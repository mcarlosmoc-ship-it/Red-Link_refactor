"""Initial schema derived from db/schema.sql."""

from __future__ import annotations

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, table


revision = "20240315_0001"
down_revision = None
branch_labels = None
depends_on = None


SQLITE_UUID_DEFAULT = sa.text(
    "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || "
    "substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || "
    "substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))"
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind is not None:
        dialect_name = bind.dialect.name
    else:
        ctx = context.get_context()
        dialect_name = ctx.dialect.name if ctx is not None else ""

    uuid_type = sa.String(length=36)
    uuid_default = SQLITE_UUID_DEFAULT
    inet_type = sa.String(length=45)

    if dialect_name == "postgresql":
        uuid_type = postgresql.UUID(as_uuid=True)
        uuid_default = sa.text("gen_random_uuid()")
        inet_type = postgresql.INET()
        op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "base_stations",
        sa.Column("base_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "billing_periods",
        sa.Column("period_key", sa.String(), primary_key=True),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.CheckConstraint(
            "period_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'",
            name="ck_billing_periods_period_key",
        ),
        sa.UniqueConstraint("starts_on", "ends_on", name="billing_periods_start_end_key"),
    )

    op.create_table(
        "clients",
        sa.Column("client_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column("external_code", sa.String(), nullable=True, unique=True),
        sa.Column("client_type", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("ip_address", inet_type, nullable=True),
        sa.Column("antenna_ip", inet_type, nullable=True),
        sa.Column("modem_ip", inet_type, nullable=True),
        sa.Column("antenna_model", sa.String(), nullable=True),
        sa.Column("modem_model", sa.String(), nullable=True),
        sa.Column("monthly_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("paid_months_ahead", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("debt_months", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("service_status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            server_onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "client_type IN ('residential', 'token')",
            name="ck_clients_client_type",
        ),
        sa.CheckConstraint(
            "service_status IN ('Activo', 'Suspendido')",
            name="ck_clients_service_status",
        ),
    )

    op.create_index("clients_full_name_idx", "clients", ["full_name"], unique=False)
    op.create_index("clients_location_idx", "clients", ["location"], unique=False)
    op.create_index("clients_base_idx", "clients", ["base_id"], unique=False)

    op.create_table(
        "payments",
        sa.Column("payment_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "client_id",
            uuid_type,
            sa.ForeignKey("clients.client_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "period_key",
            sa.String(),
            sa.ForeignKey("billing_periods.period_key", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("months_paid", sa.Numeric(6, 2), nullable=False, server_default="1"),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "method IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro')",
            name="ck_payments_method",
        ),
    )

    op.create_index("payments_client_idx", "payments", ["client_id"], unique=False)
    op.create_index("payments_period_idx", "payments", ["period_key"], unique=False)

    op.create_table(
        "voucher_types",
        sa.Column("voucher_type_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=False),
    )

    op.create_table(
        "voucher_prices",
        sa.Column("voucher_price_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "voucher_type_id",
            sa.Integer(),
            sa.ForeignKey("voucher_types.voucher_type_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.UniqueConstraint("voucher_type_id", "effective_from", name="voucher_prices_unique"),
    )

    op.create_table(
        "resellers",
        sa.Column("reseller_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("location", sa.String(), nullable=False),
    )

    op.create_table(
        "reseller_deliveries",
        sa.Column("delivery_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "reseller_id",
            uuid_type,
            sa.ForeignKey("resellers.reseller_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("delivered_on", sa.Date(), nullable=False),
        sa.Column("settlement_status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("total_value", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "settlement_status IN ('pending', 'settled', 'partial')",
            name="ck_reseller_deliveries_status",
        ),
    )

    op.create_table(
        "reseller_delivery_items",
        sa.Column("delivery_item_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "delivery_id",
            uuid_type,
            sa.ForeignKey("reseller_deliveries.delivery_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "voucher_type_id",
            sa.Integer(),
            sa.ForeignKey("voucher_types.voucher_type_id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity >= 0", name="ck_reseller_delivery_items_quantity"),
    )

    op.create_table(
        "reseller_settlements",
        sa.Column("settlement_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "reseller_id",
            uuid_type,
            sa.ForeignKey("resellers.reseller_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "delivery_id",
            uuid_type,
            sa.ForeignKey("reseller_deliveries.delivery_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("settled_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "inventory_items",
        sa.Column("inventory_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column("asset_tag", sa.String(), nullable=True, unique=True),
        sa.Column("brand", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("serial_number", sa.String(), nullable=True),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("ip_address", inet_type, nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column(
            "client_id",
            uuid_type,
            sa.ForeignKey("clients.client_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("installed_at", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('assigned', 'available', 'maintenance')",
            name="ck_inventory_items_status",
        ),
    )

    op.create_index("inventory_status_idx", "inventory_items", ["status"], unique=False)
    op.create_index("inventory_client_idx", "inventory_items", ["client_id"], unique=False)

    op.create_table(
        "expenses",
        sa.Column("expense_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("expenses_base_date_idx", "expenses", ["base_id", "expense_date"], unique=False)

    op.create_table(
        "base_operating_costs",
        sa.Column("cost_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "period_key",
            sa.String(),
            sa.ForeignKey("billing_periods.period_key", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint("base_id", "period_key", name="base_operating_costs_unique"),
    )

    base_stations_table = table(
        "base_stations",
        column("code", sa.String()),
        column("name", sa.String()),
        column("location", sa.String()),
        column("notes", sa.Text()),
    )
    op.bulk_insert(
        base_stations_table,
        [
            {
                "code": "BASE1",
                "name": "Base 1",
                "location": "Nuevo Amatenango",
                "notes": "Cobertura principal",
            },
            {
                "code": "BASE2",
                "name": "Base 2",
                "location": "Lagunita",
                "notes": "Cobertura extendida",
            },
        ],
    )

    voucher_types_table = table(
        "voucher_types",
        column("code", sa.String()),
        column("description", sa.Text()),
    )
    op.bulk_insert(
        voucher_types_table,
        [
            {"code": "h1", "description": "Ficha 1 hora"},
            {"code": "h3", "description": "Ficha 3 horas"},
            {"code": "d1", "description": "Ficha 1 día"},
            {"code": "w1", "description": "Ficha 1 semana"},
            {"code": "d15", "description": "Ficha 15 días"},
            {"code": "m1", "description": "Ficha 1 mes"},
        ],
    )

    op.execute(
        sa.text(
            """
            INSERT INTO voucher_prices (voucher_type_id, effective_from, price)
            SELECT voucher_type_id,
                   '2025-01-01' AS effective_from,
                   CASE code
                       WHEN 'h1' THEN 5
                       WHEN 'h3' THEN 8
                       WHEN 'd1' THEN 15
                       WHEN 'w1' THEN 45
                       WHEN 'd15' THEN 70
                       WHEN 'm1' THEN 140
                   END AS price
            FROM voucher_types
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM voucher_prices"))
    op.execute(sa.text("DELETE FROM voucher_types"))
    op.execute(sa.text("DELETE FROM base_stations"))

    op.drop_table("base_operating_costs")
    op.drop_index("expenses_base_date_idx", table_name="expenses")
    op.drop_table("expenses")
    op.drop_index("inventory_client_idx", table_name="inventory_items")
    op.drop_index("inventory_status_idx", table_name="inventory_items")
    op.drop_table("inventory_items")
    op.drop_table("reseller_settlements")
    op.drop_table("reseller_delivery_items")
    op.drop_table("reseller_deliveries")
    op.drop_table("resellers")
    op.drop_table("voucher_prices")
    op.drop_table("voucher_types")
    op.drop_index("payments_period_idx", table_name="payments")
    op.drop_index("payments_client_idx", table_name="payments")
    op.drop_table("payments")
    op.drop_index("clients_base_idx", table_name="clients")
    op.drop_index("clients_location_idx", table_name="clients")
    op.drop_index("clients_full_name_idx", table_name="clients")
    op.drop_table("clients")
    op.drop_table("billing_periods")
    op.drop_table("base_stations")
