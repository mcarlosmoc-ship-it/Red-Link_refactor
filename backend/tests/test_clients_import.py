from __future__ import annotations

import io

from backend.app import models


def test_download_import_template(client):
    response = client.get("/clients/import/template")

    assert response.status_code == 200
    assert "text/csv" in response.headers.get("content-type", "")
    assert "attachment" in response.headers.get("content-disposition", "")

    content = response.text.splitlines()
    assert content
    header = content[0]
    assert "client_type" in header
    assert "full_name" in header
    assert "zone_id" in header
    assert "service_1_plan_id" in header


def test_import_clients_creates_records(client, db_session):
    zone = models.Zone(code="Z1", name="Zona 1", location="Centro")
    db_session.add(zone)
    plan_internet = models.ServicePlan(
        name="Internet 50",
        monthly_price=350,
        category=models.ClientServiceType.INTERNET,
        requires_ip=True,
        requires_base=True,
    )
    plan_tv = models.ServicePlan(
        name="TV",
        monthly_price=200,
        category=models.ClientServiceType.STREAMING,
    )
    db_session.add_all([plan_internet, plan_tv])
    db_session.commit()

    csv_content = io.StringIO()
    csv_content.write(
        "client_type,full_name,location,zone_id,service_1_plan_id,service_1_status,service_1_billing_day,"
        "service_1_zone_id,service_1_ip_address,service_1_custom_price,service_2_plan_id,service_2_status,"
        "service_2_ip_address\n"
    )
    csv_content.write(
        f"residential,Cliente 1,Centro,{zone.id},{plan_internet.id},active,5,{zone.id},10.0.0.10,400,,\n"
    )
    csv_content.write(
        f"token,Plaza,Centro,{zone.id},{plan_tv.id},pending,10,,,,{plan_internet.id},active,10.0.0.11\n"
    )
    csv_content.seek(0)

    response = client.post(
        "/clients/import",
        json={"filename": "clientes.csv", "content": csv_content.getvalue()},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["total_rows"] == 2
    assert payload["created_count"] == 2
    assert payload["service_created_count"] == 3
    assert payload["failed_count"] == 0
    assert payload["row_summaries"][0]["services_created"] == 1
    assert payload["row_summaries"][1]["services_created"] == 2

    db_session.expire_all()
    clients = db_session.query(models.Client).all()
    assert len(clients) == 2
    assert sorted(client.full_name for client in clients) == ["Cliente 1", "Plaza"]
    services = db_session.query(models.ClientService).all()
    assert len(services) == 3
    assert {service.status for service in services} == {
        models.ClientServiceStatus.ACTIVE,
        models.ClientServiceStatus.PENDING,
    }


def test_import_clients_reports_errors(client, db_session):
    zone = models.Zone(code="Z1", name="Zona 1", location="Centro")
    plan = models.ServicePlan(name="Internet 50", monthly_price=350)
    db_session.add_all([zone, plan])
    db_session.commit()

    csv_content = (
        "client_type,full_name,location,zone_id,service_1_plan_id\n"
        "residential,Cliente Error,Centro,99," + str(plan.id) + "\n"
    )

    response = client.post(
        "/clients/import",
        json={"filename": "clientes.csv", "content": csv_content},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["total_rows"] == 1
    assert payload["created_count"] == 0
    assert payload["service_created_count"] == 0
    assert payload["failed_count"] == 1
    assert payload["errors"][0]["row_number"] == 2
    assert "no existe" in payload["errors"][0]["message"].lower()
    assert payload["row_summaries"][0]["status"] == "error"

    remaining = db_session.query(models.Client).count()
    assert remaining == 0
