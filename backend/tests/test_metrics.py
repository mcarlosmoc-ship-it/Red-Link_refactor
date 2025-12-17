from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from backend.app import models


def _ensure_base(db_session: Session, base_code: str, name: str, location: str) -> models.Zone:
    base = (
        db_session.query(models.Zone)
        .filter(models.Zone.code == base_code)
        .first()
    )
    if base is None:
        base = models.Zone(code=base_code, name=name, location=location)
        db_session.add(base)
        db_session.flush()
    return base


def test_metrics_overview_returns_totals(client, db_session, seed_basic_data, monkeypatch):
    client_model = seed_basic_data["client"]
    client_service = seed_basic_data["client_service"]
    period = seed_basic_data["period"]
    period_key = period.period_key

    fixed_date = date(2025, 1, 1)

    class FixedDate(date):
        @classmethod
        def today(cls):
            return fixed_date

    monkeypatch.setattr("backend.app.services.metrics.date", FixedDate)

    payment_payload = {
        "client_id": client_model.id,
        "client_service_id": client_service.id,
        "period_key": period_key,
        "paid_on": fixed_date.isoformat(),
        "amount": "600.00",
        "method": models.PaymentMethod.TRANSFERENCIA.value,
    }
    response = client.post("/payments/", json=payment_payload)
    assert response.status_code == 201

    metrics_response = client.get("/metrics/overview", params={"period_key": period_key})
    assert metrics_response.status_code == 200

    metrics = metrics_response.json()
    overview = metrics["overview"]

    assert overview["total_clients"] == 1
    assert overview["paid_clients"] == 1
    assert overview["pending_clients"] == 0
    assert Decimal(str(overview["total_debt_amount"])) == Decimal("0")
    assert Decimal(str(overview["client_income"])) == Decimal("600.00")
    assert Decimal(str(overview["reseller_income"])) == Decimal("150")
    assert Decimal(str(overview["total_expenses"])) == Decimal("100")
    assert Decimal(str(overview["internet_costs"])) == Decimal("200")
    assert Decimal(str(overview["net_earnings"])) == Decimal("450")
    assert Decimal(str(overview["payments_for_period"])) == Decimal("600.00")
    assert Decimal(str(overview["payments_today"])) == Decimal("600.00")

    communities = metrics["communities"]
    assert len(communities) == 1
    community = communities[0]
    assert community["location"] == "Centro"
    assert community["total_clients"] == 1
    assert Decimal(str(community["payments"])) == Decimal("600.00")

    base_costs = metrics["base_costs"]
    base_key = str(seed_basic_data["client"].base_id)
    assert Decimal(str(base_costs[base_key])) == Decimal("200")


def test_dashboard_metrics_endpoint_returns_filtered_clients(client, seed_basic_data):
    period = seed_basic_data["period"].period_key

    response = client.get(
        "/metrics/dashboard",
        params={
            "period_key": period,
            "current_period": period,
            "status_filter": "pending",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    summary = payload["summary"]

    assert summary["total_clients"] == 1
    assert summary["pending_clients"] == 1
    assert Decimal(str(summary["total_debt_amount"])) > 0
    assert "payments_for_period" in summary
    assert "payments_today" in summary

    clients = payload["clients"]
    assert len(clients) == 1
    assert clients[0]["service_status"] == "Suspendido"

    search_response = client.get(
        "/metrics/dashboard",
        params={
            "period_key": period,
            "current_period": period,
            "status_filter": "pending",
            "search": "desconocido",
        },
    )
    assert search_response.status_code == 200
    assert search_response.json()["clients"] == []

    due_soon_response = client.get(
        "/metrics/dashboard",
        params={
            "period_key": period,
            "current_period": period,
            "status_filter": "due_soon",
        },
    )
    assert due_soon_response.status_code == 200
    assert "clients" in due_soon_response.json()


def test_update_base_costs_endpoint_persists_values(client, db_session, seed_basic_data):
    period_key = seed_basic_data["period"].period_key

    base_one = seed_basic_data["client"].base
    base_two = _ensure_base(db_session, base_code="B2", name="Base Dos", location="Norte")

    payload = {
        "period_key": period_key,
        "costs": {
            str(base_one.id): "350.50",
            str(base_two.id): "120.25",
        },
    }

    response = client.put("/metrics/base-costs", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["period_key"] == period_key
    assert Decimal(str(data["costs"][str(base_one.id)])) == Decimal("350.50")
    assert Decimal(str(data["costs"][str(base_two.id)])) == Decimal("120.25")

    stored_costs = (
        db_session.query(models.BaseOperatingCost)
        .filter(models.BaseOperatingCost.period_key == period_key)
        .order_by(models.BaseOperatingCost.base_id)
        .all()
    )

    assert len(stored_costs) == 2
    assert Decimal(str(stored_costs[0].total_cost)) == Decimal("350.50")
    assert Decimal(str(stored_costs[1].total_cost)) == Decimal("120.25")
