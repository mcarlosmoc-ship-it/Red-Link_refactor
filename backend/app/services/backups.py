"""Automated database backup scheduling and execution."""

from __future__ import annotations

import logging
import os
import shutil
import sqlite3
import subprocess
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.engine import make_url

from ..database import SQLALCHEMY_DATABASE_URL
from .scheduler_monitor import JOB_BACKUPS, SchedulerMonitor

LOGGER = logging.getLogger(__name__)

BACKUP_DIR_ENV = "DATABASE_BACKUP_DIR"
BACKUP_FREQUENCY_ENV = "DATABASE_BACKUP_FREQUENCY"
PG_DUMP_BIN_ENV = "DATABASE_PG_DUMP_BIN"

DEFAULT_BACKUP_INTERVAL = timedelta(days=1)
DEFAULT_PG_DUMP_BIN = "pg_dump"

_backup_thread: Optional[threading.Thread] = None
_backup_stop = threading.Event()


def _resolve_backup_directory() -> Path:
    raw = os.getenv(BACKUP_DIR_ENV)
    if not raw:
        raise RuntimeError(
            "DATABASE_BACKUP_DIR must be configured to enable automatic backups"
        )
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_backup_interval() -> timedelta:
    raw = os.getenv(BACKUP_FREQUENCY_ENV)
    if not raw:
        return DEFAULT_BACKUP_INTERVAL
    normalized = raw.strip().lower()
    if normalized == "daily":
        return timedelta(days=1)
    if normalized == "weekly":
        return timedelta(weeks=1)
    if normalized.endswith("h"):
        try:
            hours = float(normalized[:-1])
        except ValueError as exc:  # pragma: no cover - defensive branch
            raise RuntimeError("Invalid DATABASE_BACKUP_FREQUENCY value") from exc
        if hours <= 0:
            raise RuntimeError("DATABASE_BACKUP_FREQUENCY must be positive")
        return timedelta(hours=hours)
    raise RuntimeError(
        "DATABASE_BACKUP_FREQUENCY must be 'daily', 'weekly', or a number ending with 'h'"
    )


def _sqlite_backup(source: Path, destination: Path) -> Path:
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        sqlite3.connect(source).close()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = destination / f"backup_{timestamp}{source.suffix or '.db'}"
    shutil.copy2(source, backup_path)
    LOGGER.info("Database backup created at %s", backup_path)
    return backup_path


def _postgres_backup(destination: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = destination / f"backup_{timestamp}.dump"
    pg_dump_bin = os.getenv(PG_DUMP_BIN_ENV, DEFAULT_PG_DUMP_BIN)
    command = [
        pg_dump_bin,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        str(backup_path),
        SQLALCHEMY_DATABASE_URL,
    ]
    LOGGER.info("Running PostgreSQL backup using %s", pg_dump_bin)
    subprocess.run(command, check=True)
    LOGGER.info("Database backup created at %s", backup_path)
    return backup_path


def perform_backup() -> Optional[Path]:
    """Create a backup of the configured database, if supported."""

    try:
        backup_dir = _resolve_backup_directory()
    except RuntimeError as exc:
        LOGGER.warning("Automatic backups disabled: %s", exc)
        return None

    url = make_url(SQLALCHEMY_DATABASE_URL)
    if url.drivername.startswith("sqlite") and url.database not in (None, "", ":memory:"):
        return _sqlite_backup(Path(url.database), backup_dir)
    if url.drivername.startswith("postgresql"):
        return _postgres_backup(backup_dir)

    LOGGER.warning(
        "Automatic backups are only implemented for SQLite or PostgreSQL databases"
    )
    return None


def _seconds_until_next_backup(interval: timedelta) -> float:
    return max(interval.total_seconds(), 60.0)


def _backup_worker(interval: timedelta) -> None:
    while not _backup_stop.is_set():
        try:
            perform_backup()
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.exception("Automatic backup failed: %s", exc)
            SchedulerMonitor.record_error(JOB_BACKUPS, str(exc))
        SchedulerMonitor.record_tick(JOB_BACKUPS)
        _backup_stop.wait(_seconds_until_next_backup(interval))


def start_backup_scheduler() -> None:
    """Start the background thread that performs automatic backups."""

    global _backup_thread
    if _backup_thread and _backup_thread.is_alive():
        return
    try:
        interval = _resolve_backup_interval()
        _resolve_backup_directory()
    except RuntimeError as exc:
        LOGGER.warning("Automatic backups disabled: %s", exc)
        SchedulerMonitor.set_job_enabled(JOB_BACKUPS, False)
        SchedulerMonitor.record_error(JOB_BACKUPS, str(exc))
        return

    _backup_stop.clear()
    _backup_thread = threading.Thread(
        target=_backup_worker, args=(interval,), daemon=True
    )
    _backup_thread.start()
    LOGGER.info("Automatic database backups scheduled every %s", interval)


def stop_backup_scheduler() -> None:
    """Stop the automatic backup thread."""

    _backup_stop.set()
    if _backup_thread and _backup_thread.is_alive():
        _backup_thread.join(timeout=5)
