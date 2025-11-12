"""Rename base stations to zones and relax client technical fields."""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision = "20250520_0003"
down_revision = "20250501_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _column_exists(inspector: sa.Inspector, table: str, column: str) -> bool:
    return any(col["name"] == column for col in inspector.get_columns(table))


def _index_exists(inspector: sa.Inspector, table: str, index: str) -> bool:
    return any(idx["name"] == index for idx in inspector.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.execute(sa.text("DROP VIEW IF EXISTS base_period_revenue"))
    op.execute(sa.text("DROP VIEW IF EXISTS inventory_availability"))

    tables = inspector.get_table_names()
    if "zones" not in tables and "base_stations" in tables:
        op.rename_table("base_stations", "zones")

    inspector = sa.inspect(bind)
    if inspector.has_table("zones"):
        if _column_exists(inspector, "zones", "base_id") and not _column_exists(
            inspector, "zones", "zone_id"
        ):
            op.alter_column("zones", "base_id", new_column_name="zone_id")

    inspector = sa.inspect(bind)
    if inspector.has_table("clients"):
        client_indexes = {idx["name"] for idx in inspector.get_indexes("clients")}
        client_columns = {col["name"] for col in inspector.get_columns("clients")}

        op.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_clients"))
        with op.batch_alter_table("clients", recreate="always") as batch_op:
            if "clients_base_status_idx" in client_indexes:
                batch_op.drop_index("clients_base_status_idx")
            if "clients_base_idx" in client_indexes:
                batch_op.drop_index("clients_base_idx")

            if "base_id" in client_columns and "zone_id" not in client_columns:
                batch_op.alter_column(
                    "base_id",
                    new_column_name="zone_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )
            else:
                batch_op.alter_column(
                    "zone_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )

            batch_op.alter_column(
                "monthly_fee",
                existing_type=sa.Numeric(10, 2),
                nullable=True,
            )

        inspector = sa.inspect(bind)
        if inspector.has_table("clients"):
            client_indexes_after = {
                idx["name"] for idx in inspector.get_indexes("clients")
            }
            if "clients_zone_idx" not in client_indexes_after:
                op.create_index("clients_zone_idx", "clients", ["zone_id"])
            if "clients_zone_status_idx" not in client_indexes_after:
                op.create_index(
                    "clients_zone_status_idx",
                    "clients",
                    ["zone_id", "service_status"],
                )

    inspector = sa.inspect(bind)
    if inspector.has_table("client_services"):
        service_columns = {col["name"] for col in inspector.get_columns("client_services")}

        op.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_client_services"))
        with op.batch_alter_table("client_services", recreate="always") as batch_op:
            if "base_id" in service_columns and "zone_id" not in service_columns:
                batch_op.alter_column(
                    "base_id",
                    new_column_name="zone_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )
            else:
                batch_op.alter_column(
                    "zone_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )

    inspector = sa.inspect(bind)
    payments_table = (
        "service_payments" if inspector.has_table("service_payments") else "payments"
    )

    op.execute(
        sa.text(
            f"""
            CREATE VIEW base_period_revenue AS
            SELECT
                c.zone_id,
                p.period_key,
                SUM(p.amount) AS total_payments
            FROM {payments_table} p
            JOIN clients c ON c.client_id = p.client_id
            GROUP BY c.zone_id, p.period_key;
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE VIEW inventory_availability AS
            SELECT
                z.zone_id,
                z.name AS zone_name,
                COALESCE(SUM(CASE WHEN i.status = 'available' THEN 1 ELSE 0 END), 0) AS available_items,
                COALESCE(SUM(CASE WHEN i.status = 'assigned' THEN 1 ELSE 0 END), 0) AS assigned_items,
                COALESCE(SUM(CASE WHEN i.status = 'maintenance' THEN 1 ELSE 0 END), 0) AS maintenance_items,
                COUNT(i.inventory_id) AS total_items
            FROM zones z
            LEFT JOIN inventory_items i ON i.base_id = z.zone_id
            GROUP BY z.zone_id, z.name;
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.execute(sa.text("DROP VIEW IF EXISTS inventory_availability"))
    op.execute(sa.text("DROP VIEW IF EXISTS base_period_revenue"))

    if inspector.has_table("client_services"):
        service_columns = {col["name"] for col in inspector.get_columns("client_services")}

        op.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_client_services"))
        with op.batch_alter_table("client_services", recreate="always") as batch_op:
            if "zone_id" in service_columns and "base_id" not in service_columns:
                batch_op.alter_column(
                    "zone_id",
                    new_column_name="base_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )
            else:
                batch_op.alter_column(
                    "base_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )

    inspector = sa.inspect(bind)
    if inspector.has_table("clients"):
        client_indexes = {idx["name"] for idx in inspector.get_indexes("clients")}
        client_columns = {col["name"] for col in inspector.get_columns("clients")}

        op.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_clients"))
        with op.batch_alter_table("clients", recreate="always") as batch_op:
            if "clients_zone_status_idx" in client_indexes:
                batch_op.drop_index("clients_zone_status_idx")
            if "clients_zone_idx" in client_indexes:
                batch_op.drop_index("clients_zone_idx")

            if "zone_id" in client_columns and "base_id" not in client_columns:
                batch_op.alter_column(
                    "zone_id",
                    new_column_name="base_id",
                    existing_type=sa.Integer(),
                    nullable=False,
                )
            else:
                batch_op.alter_column(
                    "base_id",
                    existing_type=sa.Integer(),
                    nullable=False,
                )

            batch_op.alter_column(
                "monthly_fee",
                existing_type=sa.Numeric(10, 2),
                nullable=False,
            )

            if "clients_base_idx" not in client_indexes:
                batch_op.create_index("clients_base_idx", ["base_id"])
            if "clients_base_status_idx" not in client_indexes:
                batch_op.create_index(
                    "clients_base_status_idx", ["base_id", "service_status"]
                )

    inspector = sa.inspect(bind)
    if inspector.has_table("zones"):
        zone_columns = {col["name"] for col in inspector.get_columns("zones")}
        if "zone_id" in zone_columns and "base_id" not in zone_columns:
            op.alter_column("zones", "zone_id", new_column_name="base_id")
        op.rename_table("zones", "base_stations")

    inspector = sa.inspect(bind)
    payments_table = (
        "payments" if inspector.has_table("payments") else "service_payments"
    )

    op.execute(
        sa.text(
            f"""
            CREATE VIEW base_period_revenue AS
            SELECT
                c.base_id,
                p.period_key,
                SUM(p.amount) AS total_payments
            FROM {payments_table} p
            JOIN clients c ON c.client_id = p.client_id
            GROUP BY c.base_id, p.period_key;
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE VIEW inventory_availability AS
            SELECT
                b.base_id,
                b.name AS base_name,
                COALESCE(SUM(CASE WHEN i.status = 'available' THEN 1 ELSE 0 END), 0) AS available_items,
                COALESCE(SUM(CASE WHEN i.status = 'assigned' THEN 1 ELSE 0 END), 0) AS assigned_items,
                COALESCE(SUM(CASE WHEN i.status = 'maintenance' THEN 1 ELSE 0 END), 0) AS maintenance_items,
                COUNT(i.inventory_id) AS total_items
            FROM base_stations b
            LEFT JOIN inventory_items i ON i.base_id = b.base_id
            GROUP BY b.base_id, b.name;
            """
        )
    )
