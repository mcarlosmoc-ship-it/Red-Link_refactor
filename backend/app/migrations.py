"""Utility helpers to ensure the database schema is up to date."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from .database import SQLALCHEMY_DATABASE_URL

LOGGER = logging.getLogger(__name__)


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

        if has_version_table:
            LOGGER.debug("Alembic version table already present; applying migrations if needed")
            command.upgrade(config, "head")
            return

        if existing_tables:
            LOGGER.info(
                "Detected existing tables without Alembic metadata; stamping head and skipping migration run"
            )
            command.stamp(config, "head")
            return

        LOGGER.debug("No tables found in database; running full upgrade")
        command.upgrade(config, "head")
    finally:
        engine.dispose()
