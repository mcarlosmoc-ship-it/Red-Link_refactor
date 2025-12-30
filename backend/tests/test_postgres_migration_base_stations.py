from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine.url import URL, make_url


@pytest.fixture()
def pg_url() -> URL:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set")
    parsed = make_url(url)
    if parsed.drivername != "postgresql":
        pytest.skip("PostgreSQL required for migration smoke test")
    return parsed


def _create_ephemeral_db(url: URL) -> URL:
    admin_url = url.set(database="postgres")
    database_name = f"test_migration_{uuid.uuid4().hex}"[:63]
    engine = sa.create_engine(admin_url)
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT").execute(
            sa.text(f"CREATE DATABASE \"{database_name}\"")
        )
    return url.set(database=database_name)


def _drop_database(url: URL) -> None:
    admin_url = url.set(database="postgres")
    engine = sa.create_engine(admin_url)
    db_name = url.database
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT").execute(
            sa.text(f"DROP DATABASE IF EXISTS \"{db_name}\"")
        )


def _alembic_config(db_url: URL) -> Config:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", db_url.render_as_string(hide_password=False))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    return config


def test_migration_creates_bases_and_subscriptions(pg_url: URL):
    target_url = _create_ephemeral_db(pg_url)
    config = _alembic_config(target_url)

    try:
        # Prepare legacy state and fixtures.
        command.upgrade(config, "20251120_0022_merge_ledger_and_transition_guards")
        engine = sa.create_engine(target_url)
        with engine.begin() as conn:
            conn.execute(sa.text("INSERT INTO zones (zone_id, code, name, location) VALUES (1, 'Z1', 'Zona 1', 'Centro')"))
            conn.execute(
                sa.text(
                    """
                    INSERT INTO service_plans (plan_id, name, description, category, monthly_price)
                    VALUES (1, 'Plan Legacy', 'Internet básico', 'internet', 100)
                    """
                )
            )
            client_id = uuid.uuid4()
            service_id = uuid.uuid4()
            conn.execute(
                sa.text(
                    """
                    INSERT INTO clients (client_id, client_type, full_name, location, zone_id)
                    VALUES (:cid, 'residential', 'Cliente Uno', 'Centro', 1)
                    """
                ),
                {"cid": str(client_id)},
            )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO client_services (client_service_id, client_id, service_plan_id, status, zone_id)
                    VALUES (:sid, :cid, 1, 'active', 1)
                    """
                ),
                {"sid": str(service_id), "cid": str(client_id)},
            )

        # Run target migration.
        command.upgrade(config, "head")

        with engine.begin() as conn:
            inspector = sa.inspect(conn)
            base_count = conn.scalar(sa.text("SELECT COUNT(*) FROM base_stations"))
            zone_count = conn.scalar(sa.text("SELECT COUNT(*) FROM zones")) if inspector.has_table("zones") else 0
            subscription_count = conn.scalar(sa.text("SELECT COUNT(*) FROM subscriptions"))
            mapped_base_id = conn.scalar(sa.text("SELECT base_id FROM clients LIMIT 1"))
            normalized_category = conn.scalar(sa.text("SELECT category FROM service_plans WHERE plan_id = 1"))

        assert base_count == zone_count == 1
        assert subscription_count == 1
        assert mapped_base_id == 1
        assert normalized_category == "internet_private"
    finally:
        _drop_database(target_url)
