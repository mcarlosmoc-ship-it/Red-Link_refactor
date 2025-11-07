from __future__ import annotations

from datetime import date, timedelta

import pytest

from backend.app import models
from backend.app.services.payment_reminders import (
    ConsoleNotificationClient,
    NotificationClient,
    NotificationResult,
    PaymentReminderService,
)


class FailingNotificationClient(NotificationClient):
    channel = "test"

    def send_message(  # type: ignore[override]
        self,
        *,
        destination: str,
        subject: str,
        plain_text: str,
        html_text: str | None = None,
    ) -> NotificationResult:
        return NotificationResult(success=False, status_code=500, error="boom")


@pytest.fixture
def principal_account(db_session):
    account = models.PrincipalAccount(email_principal="principal@example.com")
    db_session.add(account)
    db_session.commit()
    return account


def _create_account(
    db_session,
    principal,
    *,
    due_date: date,
    estatus: str = "activo",
) -> models.ClientAccount:
    account = models.ClientAccount(
        principal_account_id=principal.id,
        correo_cliente=f"cliente-{due_date.isoformat()}@example.com",
        contrasena_cliente="secret",
        perfil="Plan Hogar",
        nombre_cliente="Cliente Demo",
        fecha_proximo_pago=due_date,
        estatus=estatus,
    )
    db_session.add(account)
    db_session.commit()
    return account


def test_payment_reminder_service_creates_logs(db_session, principal_account):
    today = date.today()
    upcoming = _create_account(
        db_session, principal_account, due_date=today + timedelta(days=2), estatus="activo"
    )
    overdue = _create_account(
        db_session, principal_account, due_date=today - timedelta(days=1), estatus="suspendido"
    )

    client = ConsoleNotificationClient()
    service = PaymentReminderService(db_session, client)
    summary = service.send_reminders(days_ahead=3)

    assert summary.total_attempts == 2
    assert summary.sent == 2
    assert summary.failed == 0

    logs = (
        db_session.query(models.PaymentReminderLog)
        .order_by(models.PaymentReminderLog.created_at)
        .all()
    )
    assert len(logs) == 2
    assert {log.client_account_id for log in logs} == {upcoming.id, overdue.id}
    assert all(log.channel == "console" for log in logs)
    assert logs[0].reminder_type == models.ReminderType.UPCOMING
    assert logs[1].reminder_type == models.ReminderType.OVERDUE
    assert logs[1].delivery_status == models.ReminderDeliveryStatus.SENT


def test_payment_reminder_service_logs_failures(db_session, principal_account):
    overdue_account = _create_account(
        db_session,
        principal_account,
        due_date=date.today() - timedelta(days=2),
        estatus="moroso",
    )

    service = PaymentReminderService(db_session, FailingNotificationClient())
    summary = service.send_reminders(days_ahead=0)

    assert summary.total_attempts == 1
    assert summary.sent == 0
    assert summary.failed == 1

    log = db_session.query(models.PaymentReminderLog).one()
    assert log.client_account_id == overdue_account.id
    assert log.delivery_status == models.ReminderDeliveryStatus.FAILED
    assert log.error_message == "boom"
