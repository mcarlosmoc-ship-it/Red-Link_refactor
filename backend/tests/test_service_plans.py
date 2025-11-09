from decimal import Decimal

from backend.app import models


def test_list_service_plans_creates_default(client):
    response = client.get("/service-plans")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    default = next(
        (item for item in data["items"] if item["name"] == "Internet mensual"),
        None,
    )
    assert default is not None
    assert default["service_type"] == models.ClientServiceType.INTERNET_PRIVATE.value
    assert Decimal(str(default["default_monthly_fee"])) == Decimal("300")
    assert default["requires_ip"] is True
    assert default["requires_base"] is True


def test_create_and_update_service_plan(client, db_session):
    payload = {
        "name": "Internet Plus",
        "service_type": models.ClientServiceType.INTERNET_PRIVATE.value,
        "default_monthly_fee": 250,
        "description": "Plan económico",
        "is_active": True,
        "requires_ip": False,
        "requires_base": False,
    }
    response = client.post("/service-plans", json=payload)
    assert response.status_code == 201, response.json()
    created = response.json()
    assert created["name"] == "Internet Plus"
    assert Decimal(str(created["default_monthly_fee"])) == Decimal("250")
    assert created["requires_ip"] is False
    assert created["requires_base"] is False

    plan_id = created["id"]
    update_response = client.put(
        f"/service-plans/{plan_id}",
        json={
            "default_monthly_fee": 275,
            "is_active": False,
            "requires_ip": True,
            "requires_base": True,
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert Decimal(str(updated["default_monthly_fee"])) == Decimal("275")
    assert updated["is_active"] is False
    assert updated["requires_ip"] is True
    assert updated["requires_base"] is True

    delete_response = client.delete(f"/service-plans/{plan_id}")
    assert delete_response.status_code == 204
