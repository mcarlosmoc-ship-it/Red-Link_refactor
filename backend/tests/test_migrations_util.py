from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from backend.app.database import Base
from backend.app.migrations import run_database_migrations


def _configure_alembic_script() -> ScriptDirectory:
    config = Config(str(Path("backend/alembic.ini").resolve()))
    config.set_main_option("script_location", str(Path("backend/alembic").resolve()))
    return ScriptDirectory.from_config(config)


def test_run_database_migrations_upgrades_existing_database(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "legacy.db"
    url = f"sqlite:///{db_path}"

    engine = create_engine(url, connect_args={"check_same_thread": False})
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE legacy_table (id INTEGER PRIMARY KEY)"))
    engine.dispose()

    monkeypatch.setenv("DATABASE_URL", url)
    try:
        run_database_migrations()
    finally:
        monkeypatch.delenv("DATABASE_URL", raising=False)

    engine = create_engine(url, connect_args={"check_same_thread": False})
    inspector = inspect(engine)

    tables = inspector.get_table_names()
    assert "legacy_table" in tables
    assert "alembic_version" in tables
    assert "clients" in tables

    with engine.connect() as connection:
        version = connection.scalar(text("SELECT version_num FROM alembic_version"))
    expected_head = _configure_alembic_script().get_current_head()
    assert version == expected_head

    engine.dispose()


def test_run_database_migrations_stamps_head_for_current_schema(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "current.db"
    url = f"sqlite:///{db_path}"

    engine = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    engine.dispose()

    monkeypatch.setenv("DATABASE_URL", url)
    try:
        run_database_migrations()
    finally:
        monkeypatch.delenv("DATABASE_URL", raising=False)

    engine = create_engine(url, connect_args={"check_same_thread": False})
    inspector = inspect(engine)

    assert inspector.has_table("alembic_version")
    assert inspector.has_table("client_account_security_events")

    with engine.connect() as connection:
        version = connection.scalar(text("SELECT version_num FROM alembic_version"))

    expected_head = _configure_alembic_script().get_current_head()
    assert version == expected_head

    engine.dispose()
