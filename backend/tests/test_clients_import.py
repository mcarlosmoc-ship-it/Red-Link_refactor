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


def test_import_clients_creates_records(client, db_session):
    zone = models.Zone(code="Z1", name="Zona 1", location="Centro")
    db_session.add(zone)
    db_session.commit()

    csv_content = io.StringIO()
    csv_content.write(
        "client_type,full_name,location,zone_id,monthly_fee,paid_months_ahead,debt_months\n"
    )
    csv_content.write(
        f"residential,Cliente 1,Centro,{zone.id},350,0,0\n"
    )
    csv_content.write(
        f"token,Plaza,Centro,{zone.id},0,0,0\n"
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
    assert payload["failed_count"] == 0

    db_session.expire_all()
    clients = db_session.query(models.Client).all()
    assert len(clients) == 2
    assert sorted(client.full_name for client in clients) == ["Cliente 1", "Plaza"]


def test_import_clients_reports_errors(client, db_session):
    # No base stations created on purpose
    csv_content = "client_type,full_name,location,zone_id\nresidential,Cliente Error,Centro,99\n"

    response = client.post(
        "/clients/import",
        json={"filename": "clientes.csv", "content": csv_content},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["total_rows"] == 1
    assert payload["created_count"] == 0
    assert payload["failed_count"] == 1
    assert payload["errors"][0]["row_number"] == 2
    assert "no existe" in payload["errors"][0]["message"].lower()

    remaining = db_session.query(models.Client).count()
    assert remaining == 0
