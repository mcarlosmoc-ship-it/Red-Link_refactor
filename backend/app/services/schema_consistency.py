"""Background job for validating database schema consistency."""

from __future__ import annotations

import difflib
import logging
import os
import subprocess
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.engine import make_url

from ..database import SQLALCHEMY_DATABASE_URL
from .backups import DEFAULT_PG_DUMP_BIN, PG_DUMP_BIN_ENV
from .scheduler_monitor import JOB_SCHEMA_CHECKS, SchedulerMonitor

LOGGER = logging.getLogger(__name__)

SCHEMA_CHECK_REFERENCE_ENV = "SCHEMA_CHECK_REFERENCE"
SCHEMA_CHECK_FREQUENCY_ENV = "SCHEMA_CHECK_FREQUENCY"

DEFAULT_CHECK_INTERVAL = timedelta(days=1)

_check_thread: Optional[threading.Thread] = None
_check_stop = threading.Event()


def _resolve_reference_schema() -> Path:
    raw = os.getenv(SCHEMA_CHECK_REFERENCE_ENV)
    if raw:
        path = Path(raw)
    else:
        base_dir = Path(__file__).resolve().parents[3]
        path = base_dir / "db" / "schema.sql"
    if not path.exists():
        raise RuntimeError(f"Reference schema not found at {path}")
    return path


def _resolve_check_interval() -> timedelta:
    raw = os.getenv(SCHEMA_CHECK_FREQUENCY_ENV)
    if not raw:
        return DEFAULT_CHECK_INTERVAL
    normalized = raw.strip().lower()
    if normalized == "daily":
        return timedelta(days=1)
    if normalized == "weekly":
        return timedelta(weeks=1)
    if normalized.endswith("h"):
        try:
            hours = float(normalized[:-1])
        except ValueError as exc:  # pragma: no cover - defensive branch
            raise RuntimeError("Invalid SCHEMA_CHECK_FREQUENCY value") from exc
        if hours <= 0:
            raise RuntimeError("SCHEMA_CHECK_FREQUENCY must be positive")
        return timedelta(hours=hours)
    raise RuntimeError(
        "SCHEMA_CHECK_FREQUENCY must be 'daily', 'weekly', or a number ending with 'h'"
    )


def _run_pg_dump(target_path: Path) -> None:
    pg_dump_bin = os.getenv(PG_DUMP_BIN_ENV, DEFAULT_PG_DUMP_BIN)
    command = [
        pg_dump_bin,
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--file",
        str(target_path),
        SQLALCHEMY_DATABASE_URL,
    ]
    LOGGER.info("Running schema dump using %s", pg_dump_bin)
    subprocess.run(command, check=True)


def perform_schema_check() -> bool | None:
    """Compare the current database schema with the reference snapshot."""

    url = make_url(SQLALCHEMY_DATABASE_URL)
    if not url.drivername.startswith("postgresql"):
        LOGGER.warning("Schema consistency checks are only supported on PostgreSQL")
        return None
    try:
        reference_path = _resolve_reference_schema()
    except RuntimeError as exc:
        LOGGER.warning("Schema consistency checks disabled: %s", exc)
        return None

    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)
    try:
        _run_pg_dump(tmp_path)
        reference_schema = reference_path.read_text(encoding="utf-8")
        current_schema = tmp_path.read_text(encoding="utf-8")
    finally:
        tmp_path.unlink(missing_ok=True)

    if reference_schema == current_schema:
        LOGGER.info("Schema consistency check passed")
        return True

    diff_lines = list(
        difflib.unified_diff(
            reference_schema.splitlines(),
            current_schema.splitlines(),
            fromfile=str(reference_path),
            tofile="database_schema",
            lineterm="",
        )
    )
    preview = "\n".join(diff_lines[:40])
    LOGGER.warning("Schema consistency check failed:\n%s", preview)
    return False


def _seconds_until_next_check(interval: timedelta) -> float:
    return max(interval.total_seconds(), 60.0)


def _check_worker(interval: timedelta) -> None:
    while not _check_stop.is_set():
        try:
            result = perform_schema_check()
            if result is False:
                SchedulerMonitor.record_error(
                    JOB_SCHEMA_CHECKS, "Schema consistency mismatch detected"
                )
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.exception("Schema consistency check failed: %s", exc)
            SchedulerMonitor.record_error(JOB_SCHEMA_CHECKS, str(exc))
        SchedulerMonitor.record_tick(JOB_SCHEMA_CHECKS)
        _check_stop.wait(_seconds_until_next_check(interval))


def start_schema_check_scheduler() -> None:
    """Start the background thread that validates schema consistency."""

    global _check_thread
    if _check_thread and _check_thread.is_alive():
        return
    try:
        interval = _resolve_check_interval()
        _resolve_reference_schema()
    except RuntimeError as exc:
        LOGGER.warning("Schema consistency checks disabled: %s", exc)
        SchedulerMonitor.set_job_enabled(JOB_SCHEMA_CHECKS, False)
        SchedulerMonitor.record_error(JOB_SCHEMA_CHECKS, str(exc))
        return

    _check_stop.clear()
    _check_thread = threading.Thread(
        target=_check_worker, args=(interval,), daemon=True
    )
    _check_thread.start()
    LOGGER.info("Schema consistency checks scheduled every %s", interval)


def stop_schema_check_scheduler() -> None:
    """Stop the schema consistency background thread."""

    _check_stop.set()
    if _check_thread and _check_thread.is_alive():
        _check_thread.join(timeout=5)
