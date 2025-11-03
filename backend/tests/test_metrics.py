from __future__ import annotations

from datetime import date

from decimal import Decimal

from backend.app import models


def test_metrics_overview_returns_totals(client, db_session, seed_basic_data):
    client_model = seed_basic_data["client"]
    period = seed_basic_data["period"]

    payment_payload = {
        "client_id": client_model.id,
        "period_key": period.period_key,
        "paid_on": date(2025, 1, 20).isoformat(),
        "amount": "600.00",
        "months_paid": "2",
        "method": models.PaymentMethod.TRANSFERENCIA.value,
    }
    response = client.post("/payments/", json=payment_payload)
    assert response.status_code == 201

    metrics_response = client.get("/metrics/overview", params={"period_key": period.period_key})
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
