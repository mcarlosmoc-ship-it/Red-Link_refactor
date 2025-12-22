"""Business logic for sending payment reminders to client accounts."""

from __future__ import annotations

import abc
import json
import logging
import os
import threading
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from .. import models
from ..database import session_scope
from .scheduler_monitor import JOB_PAYMENT_REMINDERS, SchedulerMonitor

LOGGER = logging.getLogger(__name__)


class ConfigurationError(RuntimeError):
    """Raised when a notification client cannot be configured."""


class NotificationError(RuntimeError):
    """Raised when the external provider rejects a notification."""


@dataclass
class NotificationResult:
    """Outcome returned by a notification provider."""

    success: bool
    status_code: Optional[int] = None
    provider_message_id: Optional[str] = None
    error: Optional[str] = None


class NotificationClient(abc.ABC):
    """Interface implemented by outbound notification providers."""

    channel: str

    @abc.abstractmethod
    def send_message(
        self,
        *,
        destination: str,
        subject: str,
        plain_text: str,
        html_text: str | None = None,
    ) -> NotificationResult:
        """Send a message to the destination and return the delivery result."""


class ConsoleNotificationClient(NotificationClient):
    """Fallback client that prints messages to the console."""

    channel = "console"

    def __init__(self) -> None:
        self.records: list[dict[str, str]] = []

    def send_message(
        self,
        *,
        destination: str,
        subject: str,
        plain_text: str,
        html_text: str | None = None,
    ) -> NotificationResult:
        payload = {
            "destination": destination,
            "subject": subject,
            "plain_text": plain_text,
            "html_text": html_text or "",
        }
        self.records.append(payload)
        LOGGER.info(
            "[console] Recordatorio para %s: %s", destination, plain_text.replace("\n", " ")
        )
        return NotificationResult(success=True, status_code=200, provider_message_id="console")


class SendGridEmailClient(NotificationClient):
    """Send payment reminders using the SendGrid REST API."""

    channel = "email"
    endpoint = "https://api.sendgrid.com/v3/mail/send"

    def __init__(
        self,
        *,
        api_key: str | None,
        sender_email: str | None,
        sender_name: str | None = None,
        sandbox_mode: bool = False,
        timeout: float = 10.0,
    ) -> None:
        if not api_key:
            raise ConfigurationError("Falta la variable SENDGRID_API_KEY para enviar correos.")
        if not sender_email:
            raise ConfigurationError(
                "Falta la variable SENDGRID_SENDER_EMAIL con el remitente de los correos."
            )
        self.api_key = api_key
        self.sender_email = sender_email
        self.sender_name = sender_name or "Red-Link"
        self.sandbox_mode = sandbox_mode
        self.timeout = timeout

    def send_message(
        self,
        *,
        destination: str,
        subject: str,
        plain_text: str,
        html_text: str | None = None,
    ) -> NotificationResult:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        content = [{"type": "text/plain", "value": plain_text}]
        if html_text:
            content.append({"type": "text/html", "value": html_text})

        payload: dict[str, object] = {
            "personalizations": [
                {
                    "to": [{"email": destination}],
                }
            ],
            "from": {"email": self.sender_email, "name": self.sender_name},
            "subject": subject,
            "content": content,
        }

        if self.sandbox_mode:
            payload["mail_settings"] = {"sandbox_mode": {"enable": True}}

        try:
            response = httpx.post(
                self.endpoint,
                headers=headers,
                json=payload,
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:  # pragma: no cover - network failure
            raise NotificationError(f"Error de red al contactar SendGrid: {exc}") from exc

        if response.status_code >= 400:
            error_message = response.text
            return NotificationResult(
                success=False,
                status_code=response.status_code,
                error=error_message,
            )

        return NotificationResult(
            success=True,
            status_code=response.status_code,
            provider_message_id=response.headers.get("x-message-id"),
        )


class TwilioMessageClient(NotificationClient):
    """Send SMS or WhatsApp reminders using Twilio's REST API."""

    channel = "sms"

    def __init__(
        self,
        *,
        account_sid: str | None,
        auth_token: str | None,
        from_number: str | None,
        timeout: float = 10.0,
    ) -> None:
        if not account_sid:
            raise ConfigurationError("Falta la variable TWILIO_ACCOUNT_SID para enviar mensajes.")
        if not auth_token:
            raise ConfigurationError("Falta la variable TWILIO_AUTH_TOKEN para enviar mensajes.")
        if not from_number:
            raise ConfigurationError("Falta la variable TWILIO_FROM_NUMBER como remitente.")
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number
        self.timeout = timeout

    @property
    def endpoint(self) -> str:
        return f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"

    def send_message(
        self,
        *,
        destination: str,
        subject: str,
        plain_text: str,
        html_text: str | None = None,
    ) -> NotificationResult:
        del subject  # Twilio solo acepta texto plano.
        del html_text
        data = {"To": destination, "From": self.from_number, "Body": plain_text}
        try:
            response = httpx.post(
                self.endpoint,
                data=data,
                auth=(self.account_sid, self.auth_token),
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:  # pragma: no cover - network failure
            raise NotificationError(f"Error de red al contactar Twilio: {exc}") from exc

        if response.status_code >= 400:
            try:
                error_payload = response.json()
                message = error_payload.get("message")
            except json.JSONDecodeError:
                message = response.text
            return NotificationResult(
                success=False,
                status_code=response.status_code,
                error=message,
            )

        payload = response.json()
        return NotificationResult(
            success=True,
            status_code=response.status_code,
            provider_message_id=payload.get("sid"),
        )


@dataclass
class PaymentReminderSummary:
    """Aggregate statistics after processing reminders."""

    upcoming_attempts: int = 0
    overdue_attempts: int = 0
    sent: int = 0
    failed: int = 0

    @property
    def total_attempts(self) -> int:
        return self.upcoming_attempts + self.overdue_attempts

    def to_dict(self) -> dict[str, int]:
        return {
            "upcoming_attempts": self.upcoming_attempts,
            "overdue_attempts": self.overdue_attempts,
            "sent": self.sent,
            "failed": self.failed,
            "total_attempts": self.total_attempts,
        }


class PaymentReminderService:
    """Coordinates notification delivery for payment reminders."""

    def __init__(self, db: Session, notification_client: NotificationClient) -> None:
        self.db = db
        self.notification_client = notification_client

    def send_reminders(self, *, days_ahead: int = 3) -> PaymentReminderSummary:
        if days_ahead < 0:
            raise ValueError("El número de días debe ser mayor o igual a cero.")

        today = date.today()
        summary = PaymentReminderSummary()

        upcoming_accounts = self._get_upcoming_accounts(today, days_ahead)
        for account in upcoming_accounts:
            summary.upcoming_attempts += 1
            if self._send_reminder(account, models.ReminderType.UPCOMING):
                summary.sent += 1
            else:
                summary.failed += 1

        overdue_accounts = self._get_overdue_accounts(today)
        for account in overdue_accounts:
            summary.overdue_attempts += 1
            if self._send_reminder(account, models.ReminderType.OVERDUE):
                summary.sent += 1
            else:
                summary.failed += 1

        if summary.total_attempts:
            self.db.commit()
        return summary

    def _get_upcoming_accounts(
        self, reference_date: date, days_ahead: int
    ) -> list[models.ClientAccount]:
        end_date = reference_date + timedelta(days=days_ahead)
        query = (
            self.db.query(models.ClientAccount)
            .filter(models.ClientAccount.fecha_proximo_pago.isnot(None))
            .filter(models.ClientAccount.fecha_proximo_pago >= reference_date)
            .filter(models.ClientAccount.fecha_proximo_pago <= end_date)
            .order_by(models.ClientAccount.fecha_proximo_pago)
        )
        return query.all()

    def _get_overdue_accounts(self, reference_date: date) -> list[models.ClientAccount]:
        query = (
            self.db.query(models.ClientAccount)
            .filter(models.ClientAccount.fecha_proximo_pago.isnot(None))
            .filter(models.ClientAccount.fecha_proximo_pago < reference_date)
            .order_by(models.ClientAccount.fecha_proximo_pago)
        )
        return query.all()

    def _send_reminder(
        self, account: models.ClientAccount, reminder_type: models.ReminderType
    ) -> bool:
        due_date = account.fecha_proximo_pago
        subject, plain_text = self._compose_message(account, reminder_type, due_date)
        payload = json.dumps(
            {
                "subject": subject,
                "plain_text": plain_text,
                "reminder_type": reminder_type.value,
            },
            ensure_ascii=False,
        )

        try:
            result = self.notification_client.send_message(
                destination=account.correo_cliente,
                subject=subject,
                plain_text=plain_text,
            )
        except NotificationError as exc:
            LOGGER.warning(
                "Falló el envío del recordatorio para %s: %s", account.correo_cliente, exc
            )
            result = NotificationResult(success=False, error=str(exc))
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.exception(
                "Error inesperado enviando recordatorio a %s", account.correo_cliente
            )
            result = NotificationResult(success=False, error=str(exc))

        delivery_status = (
            models.ReminderDeliveryStatus.SENT
            if result.success
            else models.ReminderDeliveryStatus.FAILED
        )

        log_entry = models.PaymentReminderLog(
            client_account_id=account.id,
            reminder_type=reminder_type,
            delivery_status=delivery_status,
            destination=account.correo_cliente,
            channel=self.notification_client.channel,
            due_date=due_date,
            provider_message_id=result.provider_message_id,
            response_code=result.status_code,
            error_message=result.error,
            payload=payload,
        )
        self.db.add(log_entry)
        # Flush to ensure log entries are visible even if later deliveries fail.
        self.db.flush()
        return result.success

    def _compose_message(
        self,
        account: models.ClientAccount,
        reminder_type: models.ReminderType,
        due_date: Optional[date],
    ) -> tuple[str, str]:
        formatted_date = (
            due_date.strftime("%d/%m/%Y") if isinstance(due_date, date) else "sin fecha definida"
        )
        status_value = (
            account.estatus.value
            if isinstance(account.estatus, models.ClientAccountStatus)
            else str(account.estatus)
        )
        status_detail = status_value.strip().lower()
        profile = account.perfil

        if reminder_type is models.ReminderType.UPCOMING:
            subject = f"Recordatorio de pago para {profile}"
            body_lines = [
                f"Hola {account.nombre_cliente},",
                "",
                (
                    "Este es un recordatorio de que tu próximo pago para el perfil "
                    f"\"{profile}\" vence el {formatted_date}."
                ),
                "Por favor realiza el pago antes de la fecha límite para evitar la suspensión del servicio.",
            ]
        else:
            subject = f"Aviso de pago vencido para {profile}"
            body_lines = [
                f"Hola {account.nombre_cliente},",
                "",
                (
                    "Nuestro registro muestra que el pago programado para el perfil "
                    f"\"{profile}\" venció el {formatted_date}."
                ),
            ]
            if "suspendido" in status_detail:
                body_lines.append(
                    "El servicio ya se encuentra suspendido hasta que regularices tu saldo."
                )
            else:
                body_lines.append(
                    "Si el pago no se regulariza a la brevedad el servicio será suspendido."
                )

        body_lines.extend(
            [
                "",
                f"Estado actual del servicio: {status_value}.",
                "Si ya realizaste el pago, ignora este mensaje.",
                "",
                "Gracias por tu preferencia.",
            ]
        )

        plain_text = "\n".join(body_lines)
        return subject, plain_text


def _read_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _read_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        LOGGER.warning("Valor inválido para %s=%s; usando %s", name, raw, default)
        return default


def build_notification_client_from_env(*, fallback_to_console: bool = True) -> NotificationClient:
    """Instantiate a notification client from environment variables."""

    transport = os.getenv("PAYMENT_REMINDER_TRANSPORT", "auto").strip().lower()

    def _console_fallback(reason: str) -> NotificationClient:
        LOGGER.warning("%s; se utilizará la salida por consola.", reason)
        return ConsoleNotificationClient()

    if transport in {"auto", "sendgrid"}:
        sandbox = _read_bool("SENDGRID_SANDBOX_MODE")
        api_key = os.getenv("SENDGRID_API_KEY")
        sender_email = os.getenv("SENDGRID_SENDER_EMAIL")
        sender_name = os.getenv("SENDGRID_SENDER_NAME")
        try:
            return SendGridEmailClient(
                api_key=api_key,
                sender_email=sender_email,
                sender_name=sender_name,
                sandbox_mode=sandbox,
            )
        except ConfigurationError as exc:
            if transport == "sendgrid" and not fallback_to_console:
                raise
            return _console_fallback(str(exc))

    if transport == "twilio":
        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        from_number = os.getenv("TWILIO_FROM_NUMBER")
        try:
            return TwilioMessageClient(
                account_sid=account_sid,
                auth_token=auth_token,
                from_number=from_number,
            )
        except ConfigurationError as exc:
            if not fallback_to_console:
                raise
            return _console_fallback(str(exc))

    return ConsoleNotificationClient()


_reminder_thread: Optional[threading.Thread] = None
_reminder_stop = threading.Event()


def _seconds_until_next_run(now: datetime, run_hour: int, run_minute: int) -> float:
    scheduled_time = time(hour=run_hour, minute=run_minute, tzinfo=timezone.utc)
    next_run = datetime.combine(now.date(), scheduled_time)
    if next_run <= now:
        next_run += timedelta(days=1)
    delay = (next_run - now).total_seconds()
    return max(delay, 60.0)


def _execute_reminder_cycle(days_ahead: int) -> None:
    try:
        client = build_notification_client_from_env()
    except ConfigurationError as exc:  # pragma: no cover - defensive
        LOGGER.error("No fue posible configurar el proveedor de notificaciones: %s", exc)
        return

    try:
        with session_scope() as session:
            service = PaymentReminderService(session, client)
            summary = service.send_reminders(days_ahead=days_ahead)
            if summary.total_attempts:
                LOGGER.info("Recordatorios enviados: %s", summary.to_dict())
            else:
                LOGGER.info("No se encontraron cuentas para notificar en esta ejecución.")
    except Exception as exc:  # pragma: no cover - defensive logging
        LOGGER.exception("Error al ejecutar el ciclo de recordatorios: %s", exc)
        SchedulerMonitor.record_error(JOB_PAYMENT_REMINDERS, str(exc))
    finally:
        SchedulerMonitor.record_tick(JOB_PAYMENT_REMINDERS)


def _reminder_worker() -> None:
    days_ahead = max(_read_int("PAYMENT_REMINDER_DAYS_AHEAD", 3), 0)
    run_hour = min(max(_read_int("PAYMENT_REMINDER_RUN_HOUR", 9), 0), 23)
    run_minute = min(max(_read_int("PAYMENT_REMINDER_RUN_MINUTE", 0), 0), 59)
    run_immediately = _read_bool("PAYMENT_REMINDER_RUN_ON_START", True)

    if run_immediately:
        _execute_reminder_cycle(days_ahead)

    while not _reminder_stop.is_set():
        now = datetime.now(timezone.utc)
        wait_seconds = _seconds_until_next_run(now, run_hour, run_minute)
        if _reminder_stop.wait(wait_seconds):
            break
        _execute_reminder_cycle(days_ahead)


def start_payment_reminder_scheduler() -> None:
    """Start the background worker that sends daily reminders."""

    if not _read_bool("PAYMENT_REMINDER_SCHEDULER_ENABLED"):
        LOGGER.info(
            "El programador de recordatorios está deshabilitado. Establece PAYMENT_REMINDER_SCHEDULER_ENABLED=1 para activarlo."
        )
        SchedulerMonitor.set_job_enabled(JOB_PAYMENT_REMINDERS, False)
        return

    global _reminder_thread
    if _reminder_thread and _reminder_thread.is_alive():
        return

    _reminder_stop.clear()
    _reminder_thread = threading.Thread(target=_reminder_worker, daemon=True)
    _reminder_thread.start()
    LOGGER.info("Programador de recordatorios iniciado.")


def stop_payment_reminder_scheduler() -> None:
    """Stop the payment reminder background worker."""

    _reminder_stop.set()
    if _reminder_thread and _reminder_thread.is_alive():
        _reminder_thread.join(timeout=5)
        LOGGER.info("Programador de recordatorios detenido.")
