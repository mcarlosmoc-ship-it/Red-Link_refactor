from __future__ import annotations

from datetime import date
from decimal import Decimal

from backend.app import models


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

    db_session.refresh(client_model)
    assert Decimal(client_model.debt_months) == Decimal("1")
    assert Decimal(client_model.paid_months_ahead) == Decimal("0")
    assert client_model.service_status == models.ServiceStatus.SUSPENDED


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
