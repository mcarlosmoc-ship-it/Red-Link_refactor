"""CLI utility to run periodic payment consistency checks."""

from __future__ import annotations

import argparse
import logging
from typing import Optional

from ..database import session_scope
from ..services.data_consistency import DataConsistencyService

LOGGER = logging.getLogger(__name__)


def _configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s %(name)s: %(message)s")


def _parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Ejecuta una verificación de consistencia entre pagos, servicios y clientes, "
            "ideal para cron o tareas programadas."
        )
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Muestra información detallada de los contadores y anomalías detectadas.",
    )
    return parser.parse_args(argv)


def _log_mismatches(label: str, items: list) -> None:
    if not items:
        LOGGER.info("%s: sin hallazgos", label)
        return
    LOGGER.warning("%s: %s hallazgos", label, len(items))
    for item in items:
        LOGGER.debug("%s detalle: %s", label, item)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv)
    _configure_logging(args.verbose)

    with session_scope() as db:
        snapshot = DataConsistencyService.payment_counters(db)

    _log_mismatches("Clientes con contadores diferentes", snapshot.client_counters)
    _log_mismatches("Servicios con contadores diferentes", snapshot.service_counters)
    _log_mismatches("Pagos sin servicio", snapshot.payments_without_service)
    _log_mismatches(
        "Pagos con cliente diferente al del servicio",
        snapshot.payments_with_mismatched_client,
    )
    _log_mismatches("Servicios sin cliente", snapshot.services_without_client)

    LOGGER.info("Chequeo de consistencia finalizado")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
