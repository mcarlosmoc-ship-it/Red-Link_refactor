import pytest

from backend.app import models
from backend.app.security import generate_totp_code
from backend.app.services.backups import perform_backup


@pytest.fixture
def principal_account(client):
    response = client.post(
        "/account-management/principal-accounts",
        json={"email_principal": "principal@test.com", "nota": "test"},
    )
    assert response.status_code == 201
    payload = response.json()
    return payload["id"]


def test_client_password_encryption_and_logging(client, db_session, principal_account):
    password = "Cl13nt-Pass!"
    response = client.post(
        "/account-management/client-accounts",
        json={
            "principal_account_id": str(principal_account),
            "correo_cliente": "cliente@test.com",
            "contrasena_cliente": password,
            "perfil": "Plan Hogar",
            "nombre_cliente": "Cliente Demo",
            "estatus": "activo",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    account_id = payload["id"]
    assert payload["contrasena_cliente"] == password

    db_session.expire_all()
    stored = db_session.query(models.ClientAccount).filter_by(id=account_id).one()
    assert stored.contrasena_cliente == password
    assert stored.contrasena_cliente_encrypted != password

    events = (
        db_session.query(models.ClientAccountSecurityEvent)
        .filter_by(client_account_id=account_id)
        .all()
    )
    assert any(
        event.action is models.ClientAccountSecurityAction.PASSWORD_CREATED for event in events
    )

    detail = client.get(f"/account-management/client-accounts/{account_id}")
    assert detail.status_code == 200
    db_session.expire_all()
    events = (
        db_session.query(models.ClientAccountSecurityEvent)
        .filter_by(client_account_id=account_id)
        .all()
    )
    assert any(
        event.action is models.ClientAccountSecurityAction.DATA_ACCESSED for event in events
    )

    new_password = "N3w-Pa55w0rd!"
    update = client.put(
        f"/account-management/client-accounts/{account_id}",
        json={"contrasena_cliente": new_password},
    )
    assert update.status_code == 200
    assert update.json()["contrasena_cliente"] == new_password

    db_session.expire_all()
    stored = db_session.query(models.ClientAccount).filter_by(id=account_id).one()
    assert stored.contrasena_cliente == new_password
    assert stored.contrasena_cliente_encrypted != new_password
    events = (
        db_session.query(models.ClientAccountSecurityEvent)
        .filter_by(client_account_id=account_id)
        .all()
    )
    assert any(
        event.action is models.ClientAccountSecurityAction.PASSWORD_CHANGED for event in events
    )


def test_admin_login_requires_otp(security_settings, client):
    response = client.post(
        "/auth/token",
        json={
            "username": security_settings["username"],
            "password": security_settings["password"],
        },
    )
    assert response.status_code == 401

    invalid = client.post(
        "/auth/token",
        json={
            "username": security_settings["username"],
            "password": security_settings["password"],
            "otp_code": "000000",
        },
    )
    assert invalid.status_code == 401

    valid_code = generate_totp_code(security_settings["otp_secret"])
    response = client.post(
        "/auth/token",
        json={
            "username": security_settings["username"],
            "password": security_settings["password"],
            "otp_code": valid_code,
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_perform_backup_creates_file(security_settings, tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_BACKUP_DIR", str(tmp_path))
    backup_path = perform_backup()
    if backup_path is None:
        pytest.skip("Backups only supported for SQLite in tests")
    assert backup_path.exists()
