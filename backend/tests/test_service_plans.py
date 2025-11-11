from decimal import Decimal

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
    assert default["category"] == models.ClientServiceType.INTERNET.value
    assert Decimal(str(default["monthly_price"])) == Decimal("300")
    assert default["requires_ip"] is True
    assert default["requires_base"] is True
    assert default["capacity_type"] == models.CapacityType.UNLIMITED.value
    assert default["capacity_limit"] is None

    streaming = next((item for item in data["items"] if item["name"] == "NETFLIX"), None)
    assert streaming is not None
    assert streaming["category"] == models.ClientServiceType.STREAMING.value
    assert Decimal(str(streaming["monthly_price"])) == Decimal("120")
    assert streaming["requires_ip"] is False
    assert streaming["requires_base"] is False
    assert streaming["capacity_type"] == models.CapacityType.LIMITED.value
    assert streaming["capacity_limit"] == 5


def test_create_and_update_service_plan(client, db_session):
    payload = {
        "name": "Internet Plus",
        "category": models.ClientServiceType.INTERNET.value,
        "monthly_price": 250,
        "description": "Plan económico",
        "requires_ip": True,
        "requires_base": True,
        "capacity_type": models.CapacityType.UNLIMITED.value,
        "status": models.ServicePlanStatus.ACTIVE.value,
    }
    response = client.post("/service-plans", json=payload)
    assert response.status_code == 201, response.json()
    created = response.json()
    assert created["name"] == "Internet Plus"
    assert Decimal(str(created["monthly_price"])) == Decimal("250")
    assert created["requires_ip"] is True
    assert created["requires_base"] is True
    assert created["capacity_type"] == models.CapacityType.UNLIMITED.value

    plan_id = created["id"]
    update_response = client.put(
        f"/service-plans/{plan_id}",
        json={
            "monthly_price": 275,
            "status": models.ServicePlanStatus.INACTIVE.value,
            "requires_ip": True,
            "requires_base": True,
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert Decimal(str(updated["monthly_price"])) == Decimal("275")
    assert updated["status"] == models.ServicePlanStatus.INACTIVE.value
    assert updated["requires_ip"] is True
    assert updated["requires_base"] is True

    delete_response = client.delete(f"/service-plans/{plan_id}")
    assert delete_response.status_code == 204
