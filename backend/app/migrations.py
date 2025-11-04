"""Utility helpers to ensure the database schema is up to date."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config

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

    LOGGER.info("Running database migrations at %s", config.get_main_option("sqlalchemy.url"))
    command.upgrade(config, "head")
