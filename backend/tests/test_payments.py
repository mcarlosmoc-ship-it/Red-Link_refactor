from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from backend.app import models
from backend.app.database import Base, get_db
from backend.app.main import LOCAL_DEVELOPMENT_ORIGIN, app
from backend.app.models import BillingPeriod
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
    assert data["months_paid"] is None
    assert data["method"] == models.PaymentMethod.EFECTIVO.value
    assert data["note"] == "Pago parcial"
    assert data["client"]["id"] == client_model.id
    assert data["client"]["full_name"] == client_model.full_name

    db_session.expire_all()
    updated_service = (
        db_session.query(models.ClientService)
        .filter(models.ClientService.id == client_service.id)
        .one()
    )
    assert updated_service.vigente_hasta_periodo is not None
    assert Decimal(updated_service.abono_monto or 0) == Decimal("0")


def test_payment_listing_returns_cors_headers_on_failure(client, monkeypatch):
    def fail_listing(*_args, **_kwargs):
        raise SQLAlchemyError("boom")

    monkeypatch.setattr(
        "backend.app.services.payments.PaymentService.list_payments",
        fail_listing,
    )

    response = client.get("/payments", headers={"Origin": LOCAL_DEVELOPMENT_ORIGIN})

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == LOCAL_DEVELOPMENT_ORIGIN
    assert response.json()["detail"] == "No se pudieron cargar los pagos. Inténtalo de nuevo más tarde."


def test_payment_listing_rejects_malformed_period_key(client):
    response = client.get("/payments", params={"period_key": "2025/12"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid period key format, expected YYYY-MM"


def test_payment_listing_rejects_out_of_range_month(client):
    response = client.get("/payments", params={"period_key": "2025-13"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid period key format, expected YYYY-MM"


def test_payment_listing_accepts_period_alias_and_builds_date_range(client, monkeypatch):
    captured = {}

    def capture_params(_db, **kwargs):
        captured.update(kwargs)
        return [], 0

    monkeypatch.setattr(
        "backend.app.services.payments.PaymentService.list_payments",
        capture_params,
    )

    response = client.get("/payments", params={"period": "2025-12"})

    assert response.status_code == 200, response.text
    assert captured["start_date"] == date(2025, 12, 1)
    assert captured["end_date"] == date(2025, 12, 31)


def test_payment_listing_accepts_period_key_as_period_alias(client, monkeypatch):
    captured = {}

    def capture_params(_db, **kwargs):
        captured.update(kwargs)
        return [], 0

    monkeypatch.setattr(
        "backend.app.services.payments.PaymentService.list_payments",
        capture_params,
    )

    response = client.get("/payments", params={"period_key": "2025-11"})

    assert response.status_code == 200, response.text
    assert captured["start_date"] == date(2025, 11, 1)
    assert captured["end_date"] == date(2025, 11, 30)


def test_payment_listing_rejects_invalid_period_alias(client):
    response = client.get("/payments", params={"period": "2025/12"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid period key format, expected YYYY-MM"


def test_payment_listing_rejects_period_with_explicit_dates(client):
    response = client.get(
        "/payments",
        params={"period": "2025-12", "start_date": "2025-12-05"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot combine period with explicit start_date or end_date"


def test_payment_listing_accepts_valid_period_key_without_500(client):
    response = client.get("/payments", params={"period_key": "2025-12"})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["items"] == []
    assert payload["total"] == 0


def test_payment_listing_accepts_valid_period_key(client, seed_basic_data):
    response = client.get("/payments", params={"period_key": " 2025-01 "})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["items"] == []
    assert payload["total"] == 0


def test_delete_payment_restores_client_and_snapshots(client, db_session, seed_basic_data):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    billing_period = seed_basic_data["period"]

    original_debt = Decimal(client_model.debt_months)
    original_ahead = Decimal(client_model.paid_months_ahead)

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 12).isoformat(),
        "amount": "300.00",
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
    assert data["months_paid"] is None
    assert data["method"] == models.PaymentMethod.TRANSFERENCIA.value
    assert data["note"] == "Pago completo y adelantado"
    assert data["client"]["id"] == client_model.id
    assert data["client"]["full_name"] == client_model.full_name

    db_session.expire_all()
    updated_service = (
        db_session.query(models.ClientService)
        .filter(models.ClientService.id == client_service.id)
        .one()
    )
    assert updated_service.vigente_hasta_periodo == "2025-03"
    assert updated_service.abono_periodo is None
    assert Decimal(updated_service.abono_monto or 0) == Decimal("0")
    assert updated_service.next_billing_date == date(2025, 4, 10)


def test_payment_validation_requires_existing_service(client, seed_basic_data):
    payload = {
        "client_id": seed_basic_data["client"].id,
        "client_service_id": "non-existent",
        "period_key": "2025-01",
        "paid_on": date(2025, 1, 10).isoformat(),
        "amount": "100.00",
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

    zone = models.Zone(code="Z2", name="Zona Dos", location="Norte")
    db_session.add(zone)

    legacy_period = models.BillingPeriod(
        period_key="2025-1",
        starts_on=date(2025, 1, 1),
        ends_on=date(2025, 1, 31),
    )
    db_session.add(legacy_period)

    client_model = models.Client(
        full_name="Cliente Antiguo",
        location="Norte",
        zone=zone,
        client_type=models.ClientType.RESIDENTIAL,
        debt_months=Decimal("1"),
        paid_months_ahead=Decimal("0"),
    )
    db_session.add(client_model)

    plan = models.ServicePlan(
        name="Internet mensual legado",
        category=models.ClientServiceType.INTERNET,
        monthly_price=Decimal("300"),
        requires_ip=True,
        requires_base=True,
        capacity_type=models.CapacityType.UNLIMITED,
        status=models.ServicePlanStatus.ACTIVE,
    )
    db_session.add(plan)
    db_session.flush()

    client_service = models.ClientService(
        client=client_model,
        service_plan=plan,
        status=models.ClientServiceStatus.ACTIVE,
        billing_day=10,
    )
    db_session.add(client_service)
    db_session.commit()

    payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": "2025-01",
        "paid_on": date(2025, 1, 12).isoformat(),
        "amount": "300.00",
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
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 400


def test_streaming_payment_updates_next_billing(client, db_session):
    principal = models.PrincipalAccount(
        email_principal="streaming-owner@example.com", max_slots=5
    )
    streaming_client = models.Client(
        full_name="Cliente Streaming",
        location="Zona Streaming",
        client_type=models.ClientType.RESIDENTIAL,
    )
    streaming_plan = models.ServicePlan(
        name="Plan Streaming",
        category=models.ClientServiceType.STREAMING,
        monthly_price=Decimal("150"),
        status=models.ServicePlanStatus.ACTIVE,
    )
    streaming_service = models.ClientService(
        client=streaming_client,
        service_plan=streaming_plan,
        status=models.ClientServiceStatus.ACTIVE,
    )
    streaming_account = models.ClientAccount(
        principal_account=principal,
        client_service=streaming_service,
        client_id=streaming_client.id,
        correo_cliente="perfil@example.com",
        contrasena_cliente="secreto123",
        perfil="Perfil 1",
        nombre_cliente="Perfil Streaming",
        estatus="activo",
    )

    db_session.add_all(
        [principal, streaming_client, streaming_plan, streaming_service, streaming_account]
    )
    db_session.commit()

    pay_date = date(2025, 2, 1)
    response = client.post(
        "/payments/",
        json={
            "client_service_id": str(streaming_service.id),
            "paid_on": pay_date.isoformat(),
            "amount": "450.00",
            "method": models.PaymentMethod.TRANSFERENCIA.value,
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["months_paid"] is None

    db_session.expire_all()
    refreshed_account = (
        db_session.query(models.ClientAccount)
        .filter(models.ClientAccount.id == streaming_account.id)
        .one()
    )
    refreshed_service = (
        db_session.query(models.ClientService)
        .filter(models.ClientService.id == streaming_service.id)
        .one()
    )

    assert refreshed_service.vigente_hasta_periodo == "2025-04"
    assert refreshed_service.abono_monto == 0
    assert refreshed_account.fecha_proximo_pago == date(2025, 5, 1)
    assert refreshed_service.next_billing_date == date(2025, 5, 1)


def test_preloaded_sqlite_database_allows_creating_payments(tmp_path, monkeypatch, security_settings):
    """Ensure a pre-seeded SQLite database without Alembic metadata still works."""

    db_path = tmp_path / "clients.db"
    database_url = f"sqlite:///{db_path}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    with TestingSession() as session:
        zone = models.Zone(code="Z1", name="Zona Uno", location="Centro")
        session.add(zone)

        billing_period = models.BillingPeriod(
            period_key="2025-01",
            starts_on=date(2025, 1, 1),
            ends_on=date(2025, 1, 31),
        )
        session.add(billing_period)

        client_model = models.Client(
            full_name="Cliente Demo",
            location="Centro",
            zone=zone,
            client_type=models.ClientType.RESIDENTIAL,
            debt_months=Decimal("1"),
            paid_months_ahead=Decimal("0"),
        )
        session.add(client_model)

        plan = models.ServicePlan(
            name="Internet mensual",
            category=models.ClientServiceType.INTERNET,
            monthly_price=Decimal("300"),
            requires_ip=True,
            requires_base=True,
            capacity_type=models.CapacityType.UNLIMITED,
            status=models.ServicePlanStatus.ACTIVE,
        )
        session.add(plan)
        session.flush()

        client_service = models.ClientService(
            client=client_model,
            service_plan=plan,
            status=models.ClientServiceStatus.ACTIVE,
            billing_day=10,
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
                "method": models.PaymentMethod.EFECTIVO.value,
            }

            response = api_client.post("/payments/", json=payload)
            assert response.status_code == 201, response.text
    finally:
        app.dependency_overrides.pop(get_db, None)
