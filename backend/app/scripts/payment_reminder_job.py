"""Command line entry-point to send payment reminders on demand."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from typing import Optional

from ..database import session_scope
from ..services.payment_reminders import (
    ConsoleNotificationClient,
    PaymentReminderService,
    SendGridEmailClient,
    TwilioMessageClient,
    build_notification_client_from_env,
    ConfigurationError,
)

LOGGER = logging.getLogger(__name__)


def _configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s %(name)s: %(message)s")


def _parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Envía recordatorios de pago a las cuentas de clientes registradas."
    )
    parser.add_argument(
        "--days-ahead",
        type=int,
        default=int(os.getenv("PAYMENT_REMINDER_DAYS_AHEAD", "3")),
        help="Número de días hacia adelante para considerar pagos próximos (default: 3).",
    )
    parser.add_argument(
        "--transport",
        choices=["auto", "console", "sendgrid", "twilio"],
        default=os.getenv("PAYMENT_REMINDER_TRANSPORT", "auto"),
        help="Proveedor que enviará las notificaciones (auto=desde variables de entorno).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="No enviar mensajes, solo registrar la simulación en consola.",
    )
    parser.add_argument(
        "--sendgrid-api-key",
        help="API key de SendGrid para sobrescribir la variable de entorno.",
    )
    parser.add_argument(
        "--sendgrid-sender",
        help="Correo del remitente en SendGrid para sobrescribir la variable de entorno.",
    )
    parser.add_argument(
        "--sendgrid-name",
        help="Nombre del remitente en SendGrid (opcional).",
    )
    parser.add_argument(
        "--twilio-account-sid",
        help="Account SID de Twilio para sobrescribir la variable de entorno.",
    )
    parser.add_argument(
        "--twilio-auth-token",
        help="Token de autenticación de Twilio para sobrescribir la variable de entorno.",
    )
    parser.add_argument(
        "--twilio-from-number",
        help="Número remitente de Twilio para sobrescribir la variable de entorno.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Imprime información adicional para depuración.",
    )
    return parser.parse_args(argv)


def _build_client(args: argparse.Namespace):
    if args.dry_run:
        LOGGER.info("Ejecución en modo --dry-run: se usará la salida de consola.")
        return ConsoleNotificationClient()

    transport = (args.transport or "auto").strip().lower()

    if transport == "console":
        return ConsoleNotificationClient()

    if transport == "sendgrid":
        sandbox = os.getenv("SENDGRID_SANDBOX_MODE", "false").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        try:
            return SendGridEmailClient(
                api_key=args.sendgrid_api_key or os.getenv("SENDGRID_API_KEY"),
                sender_email=args.sendgrid_sender or os.getenv("SENDGRID_SENDER_EMAIL"),
                sender_name=args.sendgrid_name or os.getenv("SENDGRID_SENDER_NAME"),
                sandbox_mode=sandbox,
            )
        except ConfigurationError as exc:
            LOGGER.error("Configuración inválida de SendGrid: %s", exc)
            sys.exit(2)

    if transport == "twilio":
        try:
            return TwilioMessageClient(
                account_sid=args.twilio_account_sid or os.getenv("TWILIO_ACCOUNT_SID"),
                auth_token=args.twilio_auth_token or os.getenv("TWILIO_AUTH_TOKEN"),
                from_number=args.twilio_from_number or os.getenv("TWILIO_FROM_NUMBER"),
            )
        except ConfigurationError as exc:
            LOGGER.error("Configuración inválida de Twilio: %s", exc)
            sys.exit(2)

    return build_notification_client_from_env()


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv)
    _configure_logging(args.verbose)

    client = _build_client(args)
    days_ahead = max(args.days_ahead, 0)

    with session_scope() as session:
        service = PaymentReminderService(session, client)
        summary = service.send_reminders(days_ahead=days_ahead)
        LOGGER.info("Resumen del envío: %s", summary.to_dict())

    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())

