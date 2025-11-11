"""Utility helpers to ensure the database schema is up to date."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Callable, Iterable, Sequence

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine.reflection import Inspector

from .database import SQLALCHEMY_DATABASE_URL

LOGGER = logging.getLogger(__name__)

RevisionSentinel = tuple[str, Callable[[Inspector], bool]]


def _table_exists(inspector: Inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def _index_exists(inspector: Inspector, table_name: str, index_name: str) -> bool:
    if not inspector.has_table(table_name):
        return False
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _column_exists(inspector: Inspector, table_name: str, column_name: str) -> bool:
    if not inspector.has_table(table_name):
        return False
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


REVISION_SENTINELS: Sequence[RevisionSentinel] = (
    (
        "20250501_0002",
        lambda inspector: (
            _column_exists(inspector, "service_plans", "capacity_type")
            and _column_exists(inspector, "client_services", "custom_price")
            and not _column_exists(inspector, "client_services", "price")
        ),
    ),
    (
        "20250320_0010",
        lambda inspector: _column_exists(inspector, "service_plans", "service_type"),
    ),
    ("20250304_0008", lambda inspector: _table_exists(inspector, "client_account_security_events")),
    ("20250221_0007", lambda inspector: _table_exists(inspector, "payment_reminder_logs")),
    ("20250220_0006", lambda inspector: _table_exists(inspector, "client_accounts")),
    ("20241201_0005", lambda inspector: _table_exists(inspector, "pos_products")),
    ("20241105_0004", lambda inspector: _table_exists(inspector, "payment_audit_log")),
    ("20240418_0003", lambda inspector: _index_exists(inspector, "clients", "clients_base_status_idx")),
    ("20240315_0002", lambda inspector: _table_exists(inspector, "client_plans")),
    ("20240315_0001", lambda inspector: _table_exists(inspector, "clients")),
)


def _determine_latest_revision(inspector: Inspector, sentinels: Iterable[RevisionSentinel]) -> str | None:
    for revision, check in sentinels:
        if check(inspector):
            return revision
    return None


def run_database_migrations() -> None:
    """Run Alembic migrations so the required tables exist before serving requests."""

    base_dir = Path(__file__).resolve().parent.parent
    config = Config(str(base_dir / "alembic.ini"))
    config.set_main_option("script_location", str(base_dir / "alembic"))

    if str(base_dir) not in sys.path:
        sys.path.insert(0, str(base_dir))

    database_url = os.getenv("DATABASE_URL", SQLALCHEMY_DATABASE_URL)
    if database_url:
        config.set_main_option("sqlalchemy.url", database_url)

    final_url = config.get_main_option("sqlalchemy.url")
    LOGGER.info("Running database migrations at %s", final_url)

    connect_args = {"check_same_thread": False} if final_url.startswith("sqlite") else {}
    engine = create_engine(final_url, connect_args=connect_args)

    try:
        inspector = inspect(engine)
        has_version_table = inspector.has_table("alembic_version")
        existing_tables = [
            table for table in inspector.get_table_names() if table != "alembic_version"
        ]

        script_directory = ScriptDirectory.from_config(config)
        base_revisions = list(script_directory.get_bases())
        head_revision = script_directory.get_current_head()

        if has_version_table:
            LOGGER.debug("Alembic version table already present; applying migrations if needed")
            command.upgrade(config, "head")
            return

        if existing_tables:
            detected_revision = _determine_latest_revision(inspector, REVISION_SENTINELS)
            if detected_revision:
                LOGGER.info(
                    "Detected existing tables corresponding to Alembic revision %s; stamping before upgrade",
                    detected_revision,
                )
                command.stamp(config, detected_revision)
                if detected_revision == head_revision:
                    LOGGER.info(
                        "Existing schema already matches the latest revision; skipping migration execution",
                    )
                    return
                command.upgrade(config, "head")
                return

            LOGGER.info(
                "Detected existing tables without Alembic metadata; unable to identify revision, running full upgrade",
            )
            command.upgrade(config, "head")
            return

        LOGGER.debug("No tables found in database; running full upgrade")
        command.upgrade(config, "head")
    finally:
        engine.dispose()
