from decimal import Decimal
from uuid import uuid4

from backend.app import models


def test_payment_consistency_endpoint_reports_clean_state(
    client, db_session, seed_basic_data
):
    client_service = seed_basic_data["client_service"]
    period = seed_basic_data["period"]

    payload = {
        "client_id": seed_basic_data["client"].id,
        "client_service_id": client_service.id,
        "period_key": period.period_key,
        "paid_on": period.starts_on.isoformat(),
        "amount": "300.00",
        "months_paid": "1",
        "method": models.PaymentMethod.EFECTIVO.value,
    }

    response = client.post("/payments/", json=payload)
    assert response.status_code == 201

    consistency = client.get("/metrics/consistency/payments")
    assert consistency.status_code == 200
    data = consistency.json()

    assert data["client_counters"] == []
    assert data["service_counters"] == []
    assert data["payments_without_service"] == []
    assert data["payments_with_mismatched_client"] == []
    assert data["services_without_client"] == []


def test_payment_consistency_endpoint_flags_anomalies(client, db_session, seed_basic_data):
    plan = seed_basic_data["service_plan"]
    client_service = seed_basic_data["client_service"]

    orphan_service_id = str(uuid4())
    orphan_payment_id = str(uuid4())
    mismatched_payment_id = str(uuid4())

    orphan_service = models.ClientService(
        id=orphan_service_id,
        client_id=str(uuid4()),
        service_plan_id=plan.id,
        status=models.ClientServiceStatus.ACTIVE,
        billing_day=5,
    )

    orphan_payment = models.ServicePayment(
        id=orphan_payment_id,
        client_service_id=str(uuid4()),
        client_id=seed_basic_data["client"].id,
        paid_on=seed_basic_data["period"].starts_on,
        amount=Decimal("100"),
        months_paid=Decimal("1"),
        method=models.PaymentMethod.EFECTIVO,
    )

    mismatched_payment = models.ServicePayment(
        id=mismatched_payment_id,
        client_service_id=client_service.id,
        client_id=str(uuid4()),
        paid_on=seed_basic_data["period"].starts_on,
        amount=Decimal("50"),
        months_paid=Decimal("1"),
        method=models.PaymentMethod.TRANSFERENCIA,
    )

    db_session.add_all([orphan_service, orphan_payment, mismatched_payment])
    db_session.commit()

    consistency = client.get("/metrics/consistency/payments")
    assert consistency.status_code == 200
    data = consistency.json()

    assert orphan_payment_id in data["payments_without_service"]
    assert any(
        entry["client_service_id"] == client_service.id
        and entry["payment_id"] == mismatched_payment_id
        for entry in data["payments_with_mismatched_client"]
    )
    assert orphan_service_id in data["services_without_client"]
    assert any(
        entry["key"] == str(orphan_payment.client_service_id)
        for entry in data["service_counters"]
    )
    assert any(
        entry["key"] == str(mismatched_payment.client_id)
        for entry in data["client_counters"]
    )
