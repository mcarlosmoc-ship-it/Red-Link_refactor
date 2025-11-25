from __future__ import annotations

from sqlalchemy import create_engine, inspect, text

from backend.app.migrations import run_database_migrations


def test_migrations_recreate_views_and_clients_schema(tmp_path, monkeypatch) -> None:
    """Ensure migrations run cleanly on SQLite and rebuild dependent views."""

    db_path = tmp_path / "migration_views.db"
    url = f"sqlite:///{db_path}"

    monkeypatch.setenv("DATABASE_URL", url)
    try:
        run_database_migrations()
    finally:
        monkeypatch.delenv("DATABASE_URL", raising=False)

    engine = create_engine(url, connect_args={"check_same_thread": False})
    inspector = inspect(engine)

    view_names = set(inspector.get_view_names())
    assert "base_period_revenue" in view_names
    assert "inventory_availability" in view_names

    client_columns = {column["name"] for column in inspector.get_columns("clients")}
    assert {"ip_address", "antenna_ip", "modem_ip", "antenna_model", "modem_model"}.isdisjoint(
        client_columns
    )

    service_columns = {column["name"] for column in inspector.get_columns("client_services")}
    for column in ["ip_address", "antenna_ip", "modem_ip", "antenna_model", "modem_model"]:
        assert column in service_columns

    tmp_tables = [name for name in inspector.get_table_names() if name.startswith("_alembic_tmp_")]
    assert not tmp_tables

    with engine.connect() as connection:
        connection.execute(text("SELECT * FROM base_period_revenue LIMIT 0"))
        connection.execute(text("SELECT * FROM inventory_availability LIMIT 0"))

    engine.dispose()
