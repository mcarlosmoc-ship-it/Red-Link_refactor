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


def test_create_payment_updates_client_balance(client, db_session, seed_basic_data):
    client_model = seed_basic_data["client"]
    billing_period = seed_basic_data["period"]

    payload = {
        "client_id": client_model.id,
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

    db_session.expire_all()
    updated_client = (
        db_session.query(models.Client)
        .filter(models.Client.id == client_model.id)
        .one()
    )
    assert Decimal(updated_client.debt_months) == Decimal("1")
    assert Decimal(updated_client.paid_months_ahead) == Decimal("0")
    assert updated_client.service_status == models.ServiceStatus.SUSPENDED


def test_payment_clears_debt_and_sets_service_active(client, db_session, seed_basic_data):
    """A payment covering all debt activates the service and tracks credit ahead."""
    client_model = seed_basic_data["client"]
    billing_period = seed_basic_data["period"]

    payload = {
        "client_id": client_model.id,
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

    db_session.expire_all()
    updated_client = (
        db_session.query(models.Client)
        .filter(models.Client.id == client_model.id)
        .one()
    )
    assert Decimal(updated_client.debt_months) == Decimal("0")
    assert Decimal(updated_client.paid_months_ahead) == Decimal("1")
    assert updated_client.service_status == models.ServiceStatus.ACTIVE


def test_payment_validation_requires_existing_client(client):
    payload = {
        "client_id": "non-existent",
        "period_key": "2025-01",
        "paid_on": date(2025, 1, 10).isoformat(),
        "amount": "100.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 400


def test_payment_creates_missing_period(client, db_session, seed_basic_data):
    client_model = seed_basic_data["client"]

    payload = {
        "client_id": client_model.id,
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


def test_payment_returns_400_when_commit_fails(
    client, db_session, seed_basic_data, monkeypatch
):
    client_model = seed_basic_data["client"]
    billing_period = seed_basic_data["period"]

    def failing_commit() -> None:
        raise SQLAlchemyError("boom")

    monkeypatch.setattr(db_session, "commit", failing_commit)

    payload = {
        "client_id": client_model.id,
        "period_key": billing_period.period_key,
        "paid_on": date(2025, 1, 20).isoformat(),
        "amount": "300.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unable to record payment at this time."


def test_preloaded_sqlite_database_allows_creating_payments(tmp_path, monkeypatch):
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

        session.commit()
        client_id = client_model.id
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
            payload = {
                "client_id": client_id,
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
