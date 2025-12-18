from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from backend.app import models


def _create_base(session, code: str) -> models.Zone:
    zone = models.Zone(code=code, name=f"Base {code}", location="Centro")
    session.add(zone)
    session.flush()
    return zone


def _create_plan(session, *, name: str = "Plan IP", requires_ip: bool = True) -> models.ServicePlan:
    plan = models.ServicePlan(
        name=f"{name} {uuid4().hex[:6]}",
        category=models.ClientServiceType.INTERNET,
        monthly_price=Decimal("300"),
        description="Plan con IP",
        requires_ip=requires_ip,
        requires_base=True,
        capacity_type=models.CapacityType.UNLIMITED,
        status=models.ServicePlanStatus.ACTIVE,
    )
    session.add(plan)
    session.flush()
    return plan


def _create_client(session, zone: models.Zone, name: str = "Cliente IP") -> models.Client:
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


def _create_pool_with_reservation(
    session, zone: models.Zone, ip_address: str, *, status=models.IpReservationStatus.FREE
) -> tuple[models.BaseIpPool, models.BaseIpReservation]:
    pool = models.BaseIpPool(base_id=zone.id, label="Pool", cidr="10.0.0.0/24")
    session.add(pool)
    session.flush()
    reservation = models.BaseIpReservation(
        base_id=zone.id,
        pool_id=pool.id,
        ip_address=ip_address,
        status=status,
    )
    session.add(reservation)
    session.flush()
    return pool, reservation


def _create_inventory(
    session,
    zone: models.Zone,
    *,
    ip_address: str,
    status: models.InventoryStatus = models.InventoryStatus.AVAILABLE,
    client_id: str | None = None,
) -> models.InventoryItem:
    item = models.InventoryItem(
        asset_tag=f"AS-{uuid4().hex[:4]}",
        brand="RouterBrand",
        category="router",
        base_id=zone.id,
        status=status,
        location="Oficina",
        client_id=client_id,
        ip_address=ip_address,
    )
    session.add(item)
    session.flush()
    return item


@pytest.mark.usefixtures("client")
def test_service_creation_auto_assigns_ip(client, db_session):
    zone = _create_base(db_session, "AUTO")
    plan = _create_plan(db_session)
    customer = _create_client(db_session, zone)
    _, reservation = _create_pool_with_reservation(db_session, zone, "10.0.0.10")

    payload = {
        "client_id": str(customer.id),
        "service_id": plan.id,
        "status": models.ClientServiceStatus.ACTIVE.value,
        "billing_day": 5,
        "zone_id": zone.id,
    }

    response = client.post("/client-services/", json=payload)
    assert response.status_code == 201, response.json()
    service_data = response.json()
    assert service_data["ip_address"] == str(reservation.ip_address)

    refreshed_reservation = (
        db_session.query(models.BaseIpReservation)
        .filter(models.BaseIpReservation.id == reservation.id)
        .one()
    )
    assert refreshed_reservation.status == models.IpReservationStatus.IN_USE
    assert refreshed_reservation.service_id == service_data["id"]


@pytest.mark.usefixtures("client")
def test_reassign_inventory_when_updating_service(client, db_session):
    zone = _create_base(db_session, "INV")
    plan = _create_plan(db_session)
    customer = _create_client(db_session, zone)
    device_one = _create_inventory(db_session, zone, ip_address="10.0.0.20")
    _, reservation = _create_pool_with_reservation(db_session, zone, "10.0.0.21")

    create_payload = {
        "client_id": str(customer.id),
        "service_id": plan.id,
        "status": models.ClientServiceStatus.ACTIVE.value,
        "billing_day": 6,
        "zone_id": zone.id,
        "inventory_item_id": str(device_one.id),
    }
    create_response = client.post("/client-services/", json=create_payload)
    assert create_response.status_code == 201, create_response.json()
    service_id = create_response.json()["id"]

    device_two = _create_inventory(db_session, zone, ip_address="10.0.0.22")
    update_response = client.put(
        f"/client-services/{service_id}",
        json={"inventory_item_id": str(device_two.id)},
    )
    assert update_response.status_code == 200, update_response.json()

    refreshed_reservation = (
        db_session.query(models.BaseIpReservation)
        .filter(models.BaseIpReservation.id == reservation.id)
        .one()
    )
    assert refreshed_reservation.inventory_item_id == device_two.id
    assert refreshed_reservation.service_id == service_id
    assert update_response.json()["ip_address"] == str(reservation.ip_address)


@pytest.mark.usefixtures("client")
def test_cancellation_and_hygiene_release_ip(client, db_session):
    zone = _create_base(db_session, "CANCEL")
    plan = _create_plan(db_session)
    customer = _create_client(db_session, zone)
    _, reservation = _create_pool_with_reservation(db_session, zone, "10.0.0.30")

    create_response = client.post(
        "/client-services/",
        json={
            "client_id": str(customer.id),
            "service_id": plan.id,
            "status": models.ClientServiceStatus.ACTIVE.value,
            "billing_day": 8,
            "zone_id": zone.id,
        },
    )
    assert create_response.status_code == 201, create_response.json()
    service_id = create_response.json()["id"]

    cancel_response = client.put(
        f"/client-services/{service_id}",
        json={"status": models.ClientServiceStatus.CANCELLED.value},
    )
    assert cancel_response.status_code == 200, cancel_response.json()

    quarantined = (
        db_session.query(models.BaseIpReservation)
        .filter(models.BaseIpReservation.id == reservation.id)
        .one()
    )
    assert quarantined.status == models.IpReservationStatus.QUARANTINE
    assert cancel_response.json()["ip_address"] is None

    hygiene_response = client.post(
        "/ip-pools/reservations/hygiene", params={"quarantine_grace_hours": 0}
    )
    assert hygiene_response.status_code == 200, hygiene_response.json()
    freed = (
        db_session.query(models.BaseIpReservation)
        .filter(models.BaseIpReservation.id == reservation.id)
        .one()
    )
    assert freed.status == models.IpReservationStatus.FREE


@pytest.mark.usefixtures("client")
def test_reservation_validations_and_history(client, db_session):
    zone = _create_base(db_session, "HIST")
    plan = _create_plan(db_session)
    customer_one = _create_client(db_session, zone, name="Cliente Uno")
    customer_two = _create_client(db_session, zone, name="Cliente Dos")
    _, reservation = _create_pool_with_reservation(
        db_session, zone, "10.0.0.40", status=models.IpReservationStatus.RESERVED
    )

    first_response = client.post(
        "/client-services/",
        json={
            "client_id": str(customer_one.id),
            "service_id": plan.id,
            "status": models.ClientServiceStatus.ACTIVE.value,
            "billing_day": 10,
            "zone_id": zone.id,
            "ip_reservation_id": str(reservation.id),
        },
    )
    assert first_response.status_code == 201, first_response.json()

    duplicate_response = client.post(
        "/client-services/",
        json={
            "client_id": str(customer_two.id),
            "service_id": plan.id,
            "status": models.ClientServiceStatus.ACTIVE.value,
            "billing_day": 12,
            "zone_id": zone.id,
            "ip_reservation_id": str(reservation.id),
        },
    )
    assert duplicate_response.status_code == 400, duplicate_response.json()

    history_actions = [
        record.action
        for record in db_session.query(models.IpAssignmentHistory)
        .filter(models.IpAssignmentHistory.reservation_id == reservation.id)
        .all()
    ]
    assert models.IpAssignmentAction.ASSIGN in history_actions


@pytest.mark.usefixtures("client")
def test_hygiene_reports_and_payments(client, db_session):
    zone = _create_base(db_session, "REPORT")
    plan = _create_plan(db_session)
    customer = _create_client(db_session, zone)
    _, reservation = _create_pool_with_reservation(db_session, zone, "10.0.0.50")
    orphan_reservation = models.BaseIpReservation(
        base_id=zone.id,
        pool_id=None,
        ip_address="10.0.0.99",
        status=models.IpReservationStatus.IN_USE,
    )
    db_session.add(orphan_reservation)
    db_session.flush()

    create_response = client.post(
        "/client-services/",
        json={
            "client_id": str(customer.id),
            "service_id": plan.id,
            "status": models.ClientServiceStatus.ACTIVE.value,
            "billing_day": 9,
            "zone_id": zone.id,
        },
    )
    assert create_response.status_code == 201, create_response.json()
    service_id = create_response.json()["id"]

    hygiene_response = client.post(
        "/ip-pools/reservations/hygiene", params={"quarantine_grace_hours": 0}
    )
    assert hygiene_response.status_code == 200, hygiene_response.json()
    assert str(orphan_reservation.id) in hygiene_response.json()["freed"]

    usage_response = client.get("/ip-pools/reservations/usage")
    assert usage_response.status_code == 200, usage_response.json()
    usage_totals = usage_response.json()["usage_by_base"]
    assert any(entry["free"] >= 1 for entry in usage_totals)

    payment_response = client.post(
        "/payments",
        json={
            "client_service_id": service_id,
            "amount": 300,
            "method": models.PaymentMethod.TRANSFERENCIA.value,
            "period_key": "2025-02",
            "paid_on": date(2025, 2, 15).isoformat(),
        },
    )
    assert payment_response.status_code == 201, payment_response.json()
    assert payment_response.json()["period_key"] == "2025-02"

    listed_payments = client.get(
        "/payments",
        params={"client_service_id": service_id, "period_key": "2025-02"},
    )
    assert listed_payments.status_code == 200, listed_payments.json()
    assert listed_payments.json()["total"] == 1


@pytest.mark.usefixtures("client")
def test_full_flow_client_creation_and_ip_selection(client, db_session):
    zone = _create_base(db_session, "FLOW")

    plan_response = client.post(
        "/service-plans",
        json={
            "name": "Plan Completo",
            "category": models.ClientServiceType.INTERNET.value,
            "monthly_price": 450,
            "description": "Plan con IP fija",
            "requires_ip": True,
            "requires_base": True,
            "capacity_type": models.CapacityType.UNLIMITED.value,
            "status": models.ServicePlanStatus.ACTIVE.value,
        },
    )
    assert plan_response.status_code == 201, plan_response.json()
    plan_id = plan_response.json()["id"]

    client_response = client.post(
        "/clients",
        json={
            "full_name": "Cliente Flujo",
            "client_type": models.ClientType.RESIDENTIAL.value,
            "location": "Centro",
            "zone_id": zone.id,
        },
    )
    assert client_response.status_code == 201, client_response.json()
    client_id = client_response.json()["id"]

    pool_response = client.post(
        "/ip-pools",
        json={"base_id": zone.id, "label": "Pool Flujo", "cidr": "10.1.0.0/24"},
    )
    assert pool_response.status_code == 201, pool_response.json()
    pool_id = pool_response.json()["id"]

    free_response = client.post(
        "/ip-pools/reservations",
        json={
            "base_id": zone.id,
            "pool_id": pool_id,
            "ip_address": "10.1.0.10",
            "status": models.IpReservationStatus.FREE.value,
        },
    )
    assert free_response.status_code == 201, free_response.json()
    free_reservation_id = free_response.json()["id"]

    in_use_response = client.post(
        "/ip-pools/reservations",
        json={
            "base_id": zone.id,
            "pool_id": pool_id,
            "ip_address": "10.1.0.11",
            "status": models.IpReservationStatus.IN_USE.value,
        },
    )
    assert in_use_response.status_code == 201, in_use_response.json()
    in_use_reservation_id = in_use_response.json()["id"]

    available_response = client.get(
        "/ip-pools/reservations",
        params={
            "base_id": zone.id,
            "status": models.IpReservationStatus.FREE.value,
        },
    )
    assert available_response.status_code == 200, available_response.json()
    available_ids = {item["id"] for item in available_response.json()["items"]}
    assert free_reservation_id in available_ids
    assert in_use_reservation_id not in available_ids

    service_response = client.post(
        "/client-services/",
        json={
            "client_id": client_id,
            "service_id": plan_id,
            "status": models.ClientServiceStatus.ACTIVE.value,
            "billing_day": 7,
            "zone_id": zone.id,
            "ip_reservation_id": free_reservation_id,
        },
    )
    assert service_response.status_code == 201, service_response.json()
    service_data = service_response.json()
    assert service_data["ip_address"] == "10.1.0.10"

    assigned_reservation = (
        db_session.query(models.BaseIpReservation)
        .filter(models.BaseIpReservation.id == free_reservation_id)
        .one()
    )
    assert assigned_reservation.status == models.IpReservationStatus.IN_USE
    assert assigned_reservation.service_id == service_data["id"]
