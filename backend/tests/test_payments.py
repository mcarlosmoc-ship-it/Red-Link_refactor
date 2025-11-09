from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import models
from backend.app.database import Base, get_db
from backend.app.models import BillingPeriod
from backend.app.main import app
from backend.app.security import generate_totp_code


def test_create_payment_updates_client_balance(client, db_session, seed_basic_data):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    billing_period = seed_basic_data["period"]

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 10).isoformat(),
        "amount": "300.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
        "note": "Pago parcial",
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 201, response.text

    data = response.json()
    assert data["client_id"] == client_model.id
    assert data["period_key"] == billing_period.period_key
    assert data["paid_on"] == payload["paid_on"]
    assert Decimal(str(data["amount"])) == Decimal("300.00")
    assert Decimal(str(data["months_paid"])) == Decimal("1")
    assert data["method"] == models.PaymentMethod.EFECTIVO.value
    assert data["note"] == "Pago parcial"
    assert data["client"]["id"] == client_model.id
    assert data["client"]["full_name"] == client_model.full_name

    db_session.expire_all()
    updated_client = (
        db_session.query(models.Client)
        .filter(models.Client.id == client_model.id)
        .one()
    )
    assert Decimal(updated_client.debt_months) == Decimal("1")
    assert Decimal(updated_client.paid_months_ahead) == Decimal("0")
    assert updated_client.service_status == models.ServiceStatus.SUSPENDED


def test_delete_payment_restores_client_and_snapshots(client, db_session, seed_basic_data):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    billing_period = seed_basic_data["period"]

    original_debt = Decimal(client_model.debt_months)
    original_ahead = Decimal(client_model.paid_months_ahead)
    original_status = client_model.service_status

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 12).isoformat(),
        "amount": "300.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
        "note": "Pago temporal",
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 201, response.text

    payment_id = response.json()["id"]

    db_session.expire_all()

    snapshot = (
        db_session.query(models.FinancialSnapshot)
        .filter(models.FinancialSnapshot.period_key == billing_period.period_key)
        .one()
    )
    assert Decimal(snapshot.total_income) == Decimal("300.00")
    assert Decimal(snapshot.net_earnings) == Decimal("300.00")

    delete_response = client.delete(f"/payments/{payment_id}")
    assert delete_response.status_code == 204, delete_response.text

    db_session.expire_all()
    refreshed_client = (
        db_session.query(models.Client)
        .filter(models.Client.id == client_model.id)
        .one()
    )

    assert Decimal(refreshed_client.debt_months) == original_debt
    assert Decimal(refreshed_client.paid_months_ahead) == original_ahead
    assert refreshed_client.service_status == original_status

    snapshot_after_delete = (
        db_session.query(models.FinancialSnapshot)
        .filter(models.FinancialSnapshot.period_key == billing_period.period_key)
        .one()
    )

    assert Decimal(snapshot_after_delete.total_income) == Decimal("0")
    assert Decimal(snapshot_after_delete.net_earnings) == Decimal("0")


def test_payment_clears_debt_and_sets_service_active(client, db_session, seed_basic_data):
    """A payment covering all debt activates the service and tracks credit ahead."""
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    billing_period = seed_basic_data["period"]

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 15).isoformat(),
        "amount": "900.00",
        "months_paid": "3",
        "method": models.PaymentMethod.TRANSFERENCIA.value,
        "note": "Pago completo y adelantado",
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 201, response.text

    data = response.json()
    assert data["client_id"] == client_model.id
    assert data["period_key"] == billing_period.period_key
    assert data["paid_on"] == payload["paid_on"]
    assert Decimal(str(data["amount"])) == Decimal("900.00")
    assert Decimal(str(data["months_paid"])) == Decimal("3")
    assert data["method"] == models.PaymentMethod.TRANSFERENCIA.value
    assert data["note"] == "Pago completo y adelantado"
    assert data["client"]["id"] == client_model.id
    assert data["client"]["full_name"] == client_model.full_name

    db_session.expire_all()
    updated_client = (
        db_session.query(models.Client)
        .filter(models.Client.id == client_model.id)
        .one()
    )
    assert Decimal(updated_client.debt_months) == Decimal("0")
    assert Decimal(updated_client.paid_months_ahead) == Decimal("1")
    assert updated_client.service_status == models.ServiceStatus.ACTIVE


def test_payment_validation_requires_existing_service(client, seed_basic_data):
    payload = {
        "client_id": seed_basic_data["client"].id,
        "client_service_id": "non-existent",
        "period_key": "2025-01",
        "paid_on": date(2025, 1, 10).isoformat(),
        "amount": "100.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 400


def test_payment_rejects_zero_amount(client, seed_basic_data):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    billing_period = seed_basic_data["period"]

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 10).isoformat(),
        "amount": "0.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["loc"][-1] == "amount"
    assert "greater than" in error["msg"]


def test_payment_rejects_negative_amount(client, seed_basic_data):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    billing_period = seed_basic_data["period"]

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 10).isoformat(),
        "amount": "-10.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["loc"][-1] == "amount"
    assert "greater than" in error["msg"]


def test_payment_creates_missing_period(client, db_session, seed_basic_data):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": "2025-02",
        "paid_on": date(2025, 2, 10).isoformat(),
        "amount": "300.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 201, response.text

    db_session.expire_all()
    created_period = (
        db_session.query(BillingPeriod)
        .filter(BillingPeriod.period_key == "2025-02")
        .one()
    )
    assert created_period.starts_on == date(2025, 2, 1)
    assert created_period.ends_on == date(2025, 2, 28)


def test_payment_reuses_period_with_mismatched_key(client, db_session):
    """Existing periods with non-normalized keys should be reused."""

    base = models.BaseStation(code="B2", name="Base Dos", location="Norte")
    db_session.add(base)

    legacy_period = models.BillingPeriod(
        period_key="2025-1",
        starts_on=date(2025, 1, 1),
        ends_on=date(2025, 1, 31),
    )
    db_session.add(legacy_period)

    client_model = models.Client(
        full_name="Cliente Antiguo",
        location="Norte",
        base=base,
        client_type=models.ClientType.RESIDENTIAL,
        monthly_fee=Decimal("300"),
        debt_months=Decimal("1"),
        paid_months_ahead=Decimal("0"),
        service_status=models.ServiceStatus.SUSPENDED,
    )
    db_session.add(client_model)

    plan = models.ServicePlan(
        name="Internet mensual legado",
        service_type=models.ClientServiceType.INTERNET_PRIVATE,
        default_monthly_fee=Decimal("300"),
    )
    db_session.add(plan)
    db_session.flush()

    client_service = models.ClientService(
        client=client_model,
        service_plan=plan,
        service_type=plan.service_type,
        display_name=plan.name,
        status=models.ClientServiceStatus.ACTIVE,
        price=plan.default_monthly_fee,
    )
    db_session.add(client_service)
    db_session.commit()

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": "2025-01",
        "paid_on": date(2025, 1, 12).isoformat(),
        "amount": "300.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 201, response.text

    db_session.refresh(legacy_period)
    assert legacy_period.period_key == "2025-01"


def test_payment_returns_400_when_commit_fails(
    client, db_session, seed_basic_data, monkeypatch
):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    billing_period = seed_basic_data["period"]

    def failing_commit() -> None:
        raise SQLAlchemyError("boom")

    monkeypatch.setattr(db_session, "commit", failing_commit)

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 20).isoformat(),
        "amount": "300.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unable to record payment at this time."


def test_preloaded_sqlite_database_allows_creating_payments(tmp_path, monkeypatch, security_settings):
    """Ensure a pre-seeded SQLite database without Alembic metadata still works."""

    db_path = tmp_path / "clients.db"
    database_url = f"sqlite:///{db_path}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    with TestingSession() as session:
        base_station = models.BaseStation(code="B1", name="Base Uno", location="Centro")
        session.add(base_station)

        billing_period = models.BillingPeriod(
            period_key="2025-01",
            starts_on=date(2025, 1, 1),
            ends_on=date(2025, 1, 31),
        )
        session.add(billing_period)

        client_model = models.Client(
            full_name="Cliente Demo",
            location="Centro",
            base=base_station,
            client_type=models.ClientType.RESIDENTIAL,
            monthly_fee=Decimal("300"),
            debt_months=Decimal("1"),
            paid_months_ahead=Decimal("0"),
            service_status=models.ServiceStatus.SUSPENDED,
        )
        session.add(client_model)

        plan = models.ServicePlan(
            name="Internet mensual",
            service_type=models.ClientServiceType.INTERNET_PRIVATE,
            default_monthly_fee=Decimal("300"),
        )
        session.add(plan)
        session.flush()

        client_service = models.ClientService(
            client=client_model,
            service_plan=plan,
            service_type=plan.service_type,
            display_name=plan.name,
            status=models.ClientServiceStatus.ACTIVE,
            price=plan.default_monthly_fee,
        )
        session.add(client_service)

        session.commit()
        client_id = client_model.id
        client_service_id = client_service.id
        period_key = billing_period.period_key

    monkeypatch.setenv("DATABASE_URL", database_url)

    def override_get_db():
        db_session = TestingSession()
        try:
            yield db_session
        finally:
            db_session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as api_client:
            token_response = api_client.post(
                "/auth/token",
                json={
                    "username": security_settings["username"],
                    "password": security_settings["password"],
                    "otp_code": generate_totp_code(security_settings["otp_secret"]),
                },
            )
            assert token_response.status_code == 200, token_response.text
            token = token_response.json()["access_token"]
            api_client.headers.update({"Authorization": f"Bearer {token}"})

            payload = {
                "client_id": client_id,
                "client_service_id": client_service_id,
                "period_key": period_key,
                "paid_on": date(2025, 1, 10).isoformat(),
                "amount": "150.00",
                "months_paid": "1",
                "method": models.PaymentMethod.EFECTIVO.value,
            }

            response = api_client.post("/payments/", json=payload)
            assert response.status_code == 201, response.text
    finally:
        app.dependency_overrides.pop(get_db, None)
