"""Background scheduler for releasing quarantined IP reservations."""

from __future__ import annotations

import logging
import os
import threading
from datetime import timedelta
from typing import Optional

from ..database import session_scope
from .ip_pools import IpPoolService
from .scheduler_monitor import JOB_IP_QUARANTINE, SchedulerMonitor

LOGGER = logging.getLogger(__name__)

QUARANTINE_TTL_ENV = "IP_QUARANTINE_TTL_HOURS"
QUARANTINE_INTERVAL_ENV = "IP_QUARANTINE_CHECK_INTERVAL_MINUTES"

DEFAULT_QUARANTINE_TTL_HOURS = 24
DEFAULT_QUARANTINE_INTERVAL = timedelta(minutes=30)
MAX_QUARANTINE_TTL_HOURS = 24 * 30

_quarantine_thread: Optional[threading.Thread] = None
_quarantine_stop = threading.Event()


def _read_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        LOGGER.warning("Valor inválido para %s=%s; usando %s", name, raw, default)
        return default


def get_quarantine_ttl_hours() -> int:
    """Return the configured quarantine TTL in hours."""

    ttl = _read_int(QUARANTINE_TTL_ENV, DEFAULT_QUARANTINE_TTL_HOURS)
    ttl = max(ttl, 0)
    return min(ttl, MAX_QUARANTINE_TTL_HOURS)


def _resolve_interval() -> timedelta:
    interval = _read_int(
        QUARANTINE_INTERVAL_ENV, int(DEFAULT_QUARANTINE_INTERVAL.total_seconds() / 60)
    )
    if interval <= 0:
        LOGGER.warning(
            "%s debe ser mayor que cero; usando valor por defecto.",
            QUARANTINE_INTERVAL_ENV,
        )
        return DEFAULT_QUARANTINE_INTERVAL
    return timedelta(minutes=interval)


def _execute_quarantine_cycle() -> None:
    ttl_hours = get_quarantine_ttl_hours()
    with session_scope() as session:
        result = IpPoolService.run_hygiene(session, quarantine_grace_hours=ttl_hours)
        if result.freed or result.quarantined or result.released:
            LOGGER.info(
                "Higiene de IPs: %s en cuarentena, %s liberadas.",
                len(result.quarantined),
                len(result.freed),
            )


def _quarantine_worker(interval: timedelta) -> None:
    while not _quarantine_stop.is_set():
        try:
            _execute_quarantine_cycle()
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.exception("Error al ejecutar la higiene de IPs: %s", exc)
            SchedulerMonitor.record_error(JOB_IP_QUARANTINE, str(exc))
        SchedulerMonitor.record_tick(JOB_IP_QUARANTINE)
        _quarantine_stop.wait(max(interval.total_seconds(), 60.0))


def start_ip_quarantine_scheduler() -> None:
    """Start background worker for releasing quarantined IPs."""

    global _quarantine_thread
    if _quarantine_thread and _quarantine_thread.is_alive():
        return

    interval = _resolve_interval()
    _quarantine_stop.clear()
    _quarantine_thread = threading.Thread(
        target=_quarantine_worker, args=(interval,), daemon=True
    )
    _quarantine_thread.start()
    LOGGER.info("Programador de higiene de IPs iniciado cada %s", interval)


def stop_ip_quarantine_scheduler() -> None:
    """Stop the quarantined IPs background worker."""

    _quarantine_stop.set()
    if _quarantine_thread and _quarantine_thread.is_alive():
        _quarantine_thread.join(timeout=5)
