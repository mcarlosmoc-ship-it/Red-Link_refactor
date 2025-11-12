from decimal import Decimal

from backend.app import models


def _create_base(session, code="BASE-01"):
    zone = models.Zone(code=code, name=f"{code} Name", location="Centro")
    session.add(zone)
    session.flush()
    return zone


def _create_client(session, zone, name):
    client = models.Client(
        full_name=name,
        location="Centro",
        zone=zone,
        client_type=models.ClientType.RESIDENTIAL,
        monthly_fee=Decimal("300"),
    )
    session.add(client)
    session.flush()
    return client


def _create_limited_plan(session, *, capacity_limit, name="Plan Limitado"):
    plan = models.ServicePlan(
        name=name,
        category=models.ClientServiceType.INTERNET,
        monthly_price=Decimal("350"),
        description="Plan con cupo limitado",
        requires_ip=True,
        requires_base=True,
        capacity_type=models.CapacityType.LIMITED,
        capacity_limit=capacity_limit,
        status=models.ServicePlanStatus.ACTIVE,
    )
    session.add(plan)
    session.flush()
    return plan


def test_bulk_assign_services_returns_failed_clients_when_plan_is_full(client, db_session):
    zone = _create_base(db_session, code="BASE-FULL")
    plan = _create_limited_plan(db_session, capacity_limit=1, name="Plan Saturado")

    existing_client = _create_client(db_session, zone, "Cliente Existente")
    db_session.add(
        models.ClientService(
            client=existing_client,
            service_plan=plan,
            status=models.ClientServiceStatus.ACTIVE,
        )
    )
    db_session.flush()

    pending_clients = [
        _create_client(db_session, zone, "Cliente Uno"),
        _create_client(db_session, zone, "Cliente Dos"),
    ]

    payload = {
        "service_id": plan.id,
        "client_ids": [str(client.id) for client in pending_clients],
        "status": models.ClientServiceStatus.ACTIVE.value,
    }

    response = client.post("/client-services/bulk-assign", json=payload)
    assert response.status_code == 400, response.json()
    detail = response.json()["detail"]
    assert detail["code"] == "capacity_limit_exceeded"
    assert detail["available_slots"] == 0
    failed_names = {entry["name"] for entry in detail["failed_clients"]}
    assert failed_names == {client.full_name for client in pending_clients}


def test_bulk_assign_services_reports_partial_capacity(client, db_session):
    zone = _create_base(db_session, code="BASE-PARTIAL")
    plan = _create_limited_plan(db_session, capacity_limit=3, name="Plan Parcial")

    existing_client = _create_client(db_session, zone, "Cliente Activo")
    db_session.add(
        models.ClientService(
            client=existing_client,
            service_plan=plan,
            status=models.ClientServiceStatus.ACTIVE,
        )
    )
    db_session.flush()

    pending_clients = [
        _create_client(db_session, zone, f"Cliente Nuevo {index}")
        for index in range(1, 4)
    ]

    payload = {
        "service_id": plan.id,
        "client_ids": [str(client.id) for client in pending_clients],
        "status": models.ClientServiceStatus.ACTIVE.value,
    }

    response = client.post("/client-services/bulk-assign", json=payload)
    assert response.status_code == 400, response.json()
    detail = response.json()["detail"]
    assert detail["code"] == "capacity_limit_exceeded"
    assert detail["available_slots"] == 2
    assert detail["requested_assignments"] == len(pending_clients)
    failed_clients = detail["failed_clients"]
    assert len(failed_clients) == 1
    assert failed_clients[0]["name"] == pending_clients[-1].full_name
