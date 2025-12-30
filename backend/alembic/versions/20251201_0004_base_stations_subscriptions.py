"""Introduce base_stations + subscriptions and normalize service types.

Revision ID: 20251201_0004_base_stations_subscriptions
Revises: 20251120_0022_merge_ledger_and_transition_guards
Create Date: 2025-12-01
"""

from __future__ import annotations

import uuid
from typing import Sequence

import sqlalchemy as sa
from alembic import op

from app.db_types import GUID

revision = "20251201_0004_base_stations_subscriptions"
down_revision = "20251120_0022_merge_ledger_and_transition_guards"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

SERVICE_TYPE_MAPPING = {
    "internet": "internet_private",
    "hotspot": "internet_tokens",
    "streaming": "streaming_netflix",
}


def _has_column(inspector: sa.Inspector, table: str, column: str) -> bool:
    return any(col["name"] == column for col in inspector.get_columns(table))


def _drop_fk(inspector: sa.Inspector, table: str, target_tables: set[str]) -> list[str]:
    fk_names = [
        fk["name"]
        for fk in inspector.get_foreign_keys(table)
        if fk.get("referred_table") in target_tables and fk.get("name")
    ]
    return fk_names


def _ensure_base_stations(inspector: sa.Inspector, dialect: str) -> None:
    if not inspector.has_table("base_stations"):
        op.create_table(
            "base_stations",
            sa.Column("base_id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("code", sa.String(), nullable=False, unique=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("location", sa.String(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
        )
        inspector = sa.inspect(op.get_bind())

    if inspector.has_table("zones"):
        insert_sql = (
            """
            INSERT INTO base_stations (base_id, code, name, location, notes)
            SELECT zone_id, code, name, COALESCE(location, ''), notes
            FROM zones
            ON CONFLICT (base_id) DO NOTHING
            """
            if dialect == "postgresql"
            else """
            INSERT OR IGNORE INTO base_stations (base_id, code, name, location, notes)
            SELECT zone_id, code, name, COALESCE(location, ''), notes
            FROM zones
            """
        )
        op.execute(sa.text(insert_sql))
        if dialect == "postgresql":
            op.execute(
                sa.text(
                    """
                    SELECT setval(
                        pg_get_serial_sequence('base_stations', 'base_id'),
                        (SELECT COALESCE(MAX(base_id), 1) FROM base_stations)
                    );
                    """
                )
            )


def _migrate_base_fk(table: str, fk_kwargs: dict[str, object]) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns(table)}
    fk_names = _drop_fk(inspector, table, {"zones", "base_stations"})
    indexes = inspector.get_indexes(table)

    if table == "clients":
        op.execute(sa.text("DROP VIEW IF EXISTS base_period_revenue"))
        op.execute(sa.text("DROP VIEW IF EXISTS inventory_availability"))

    for idx in indexes:
        if idx.get("name") and "zone_id" in (idx.get("column_names") or []):
            op.drop_index(idx["name"], table_name=table)

    with op.batch_alter_table(table, recreate="always") as batch_op:
        for fk_name in fk_names:
            batch_op.drop_constraint(fk_name, type_="foreignkey")

        if "zone_id" in columns and "base_id" not in columns:
            batch_op.alter_column(
                "zone_id",
                new_column_name="base_id",
                existing_type=sa.Integer(),
                nullable=True,
            )
        elif "base_id" in columns:
            batch_op.alter_column("base_id", existing_type=sa.Integer(), nullable=True)

        batch_op.create_foreign_key(
            f"fk_{table}_base_stations",
            "base_stations",
            ["base_id"],
            ["base_id"],
            **fk_kwargs,
        )

        existing_indexes = {idx["name"] for idx in inspector.get_indexes(table)}
        if f"{table}_base_idx" not in existing_indexes:
            batch_op.create_index(f"{table}_base_idx", ["base_id"])


SUBSCRIPTION_STATUS_ENUM = sa.Enum(
    "active",
    "suspended",
    "cancelled",
    "pending",
    name="subscription_status_enum",
    native_enum=False,
    validate_strings=True,
)

BILLING_CYCLE_ENUM = sa.Enum(
    "monthly",
    "quarterly",
    "semiannual",
    "annual",
    name="subscription_billing_cycle_enum",
    native_enum=False,
    validate_strings=True,
)


def _ensure_subscriptions_table(inspector: sa.Inspector) -> None:
    if inspector.has_table("subscriptions"):
        return

    op.create_table(
        "subscriptions",
        sa.Column("subscription_id", GUID(), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "client_id",
            GUID(),
            sa.ForeignKey("clients.client_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "service_id",
            GUID(),
            sa.ForeignKey("client_services.client_service_id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "plan_id",
            sa.Integer(),
            sa.ForeignKey("service_plans.plan_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("billing_cycle", BILLING_CYCLE_ENUM, nullable=False, server_default="monthly"),
        sa.Column(
            "billing_anchor_day",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column("start_date", sa.Date(), nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("status", SUBSCRIPTION_STATUS_ENUM, nullable=False, server_default="active"),
        sa.Column("trial_ends_at", sa.Date(), nullable=True),
        sa.Column("cancellation_reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("subscriptions_client_idx", "subscriptions", ["client_id"])
    op.create_index("subscriptions_plan_idx", "subscriptions", ["plan_id"])
    op.create_index("subscriptions_service_idx", "subscriptions", ["service_id"])


def _populate_subscriptions(conn) -> dict[uuid.UUID, uuid.UUID]:
    subscriptions: dict[uuid.UUID, uuid.UUID] = {}
    rows = conn.execute(
        sa.text(
            """
            SELECT cs.client_service_id, cs.client_id, cs.service_plan_id, cs.status, cs.cancelled_at
            FROM client_services cs
            """
        )
    ).fetchall()

    status_map = {
        "active": "active",
        "suspended": "suspended",
        "cancelled": "cancelled",
        "pending": "pending",
    }

    for row in rows:
        subscription_id = uuid.uuid4()
        subscriptions[row.client_service_id] = subscription_id
        conn.execute(
            sa.text(
                """
                INSERT INTO subscriptions (subscription_id, client_id, service_id, plan_id, status)
                VALUES (:sid, :client_id, :service_id, :plan_id, :status)
                ON CONFLICT (service_id) DO NOTHING
                """
            ),
            {
                "sid": str(subscription_id),
                "client_id": str(row.client_id),
                "service_id": str(row.client_service_id),
                "plan_id": row.service_plan_id,
                "status": status_map.get(row.status, "active"),
            },
        )
    return subscriptions


def _ensure_subscription_fk_on_charges(inspector: sa.Inspector, subscriptions: dict[uuid.UUID, uuid.UUID]):
    if not inspector.has_table("service_charges"):
        return

    bind = op.get_bind()
    columns = {col["name"] for col in inspector.get_columns("service_charges")}
    fk_names = _drop_fk(inspector, "service_charges", {"client_services", "subscriptions"})

    with op.batch_alter_table("service_charges", recreate="always") as batch_op:
        for fk_name in fk_names:
            batch_op.drop_constraint(fk_name, type_="foreignkey")

        if "subscription_id" not in columns:
            batch_op.add_column(sa.Column("subscription_id", GUID(), nullable=True))

        batch_op.create_foreign_key(
            "fk_service_charges_subscription",
            "subscriptions",
            ["subscription_id"],
            ["subscription_id"],
            ondelete="CASCADE",
        )

    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("service_charges")}

    if subscriptions and "subscription_id" in columns:
        if "client_service_id" in columns:
            bind.execute(
                sa.text(
                    """
                    UPDATE service_charges sc
                    SET subscription_id = sub.subscription_id
                    FROM subscriptions sub
                    WHERE sc.client_service_id = sub.service_id AND sc.subscription_id IS NULL
                    """
                )
            )
        bind.execute(
            sa.text(
                """
                UPDATE service_charges sc
                SET subscription_id = sub.subscription_id
                FROM subscriptions sub
                WHERE sc.subscription_id IS NULL AND sc.client_id = sub.client_id
                """
            )
        )

    with op.batch_alter_table("service_charges", recreate="always") as batch_op:
        batch_op.alter_column("subscription_id", existing_type=GUID(), nullable=False)


def _normalize_service_types(conn):
    for legacy, canonical in SERVICE_TYPE_MAPPING.items():
        conn.execute(
            sa.text(
                """
                UPDATE service_plans
                SET category = :canonical
                WHERE category = :legacy
                """
            ),
            {"canonical": canonical, "legacy": legacy},
        )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect = bind.dialect.name

    if dialect != "postgresql":
        raise RuntimeError(
            "This migration is Postgres-first. Please run with PostgreSQL (REQUIRE_POSTGRES=1)."
        )

    _ensure_base_stations(inspector, dialect)
    _migrate_base_fk("clients", {"onupdate": "CASCADE"})
    _migrate_base_fk("client_services", {"ondelete": "SET NULL"})

    inspector = sa.inspect(op.get_bind())
    _ensure_subscriptions_table(inspector)
    conn = op.get_bind()
    subscriptions = _populate_subscriptions(conn)
    inspector = sa.inspect(conn)
    _ensure_subscription_fk_on_charges(inspector, subscriptions)

    _normalize_service_types(conn)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("service_charges"):
        fk_names = _drop_fk(inspector, "service_charges", {"subscriptions"})
        with op.batch_alter_table("service_charges", recreate="always") as batch_op:
            for fk_name in fk_names:
                batch_op.drop_constraint(fk_name, type_="foreignkey")
            if _has_column(inspector, "service_charges", "subscription_id"):
                batch_op.drop_column("subscription_id")

    if inspector.has_table("subscriptions"):
        op.drop_index("subscriptions_service_idx", table_name="subscriptions")
        op.drop_index("subscriptions_plan_idx", table_name="subscriptions")
        op.drop_index("subscriptions_client_idx", table_name="subscriptions")
        op.drop_table("subscriptions")

    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("client_services"):
        with op.batch_alter_table("client_services", recreate="always") as batch_op:
            fk_names = _drop_fk(inspector, "client_services", {"base_stations"})
            for fk_name in fk_names:
                batch_op.drop_constraint(fk_name, type_="foreignkey")
            if _has_column(inspector, "client_services", "base_id"):
                batch_op.alter_column(
                    "base_id",
                    new_column_name="zone_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )

    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("clients"):
        with op.batch_alter_table("clients", recreate="always") as batch_op:
            fk_names = _drop_fk(inspector, "clients", {"base_stations"})
            for fk_name in fk_names:
                batch_op.drop_constraint(fk_name, type_="foreignkey")
            if _has_column(inspector, "clients", "base_id"):
                batch_op.alter_column(
                    "base_id",
                    new_column_name="zone_id",
                    existing_type=sa.Integer(),
                    nullable=True,
                )

    if inspector.has_table("base_stations"):
        op.drop_table("base_stations")

