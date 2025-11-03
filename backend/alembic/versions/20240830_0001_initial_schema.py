"""Initial database schema for Red-Link backend."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from alembic import op
import sqlalchemy as sa


revision = "20240830_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    client_type_enum = sa.Enum(
        "residential",
        "token",
        name="client_type_enum",
        native_enum=False,
    )
    service_status_enum = sa.Enum(
        "Activo",
        "Suspendido",
        name="client_service_status_enum",
        native_enum=False,
    )
    payment_method_enum = sa.Enum(
        "Efectivo",
        "Transferencia",
        "Tarjeta",
        "Revendedor",
        "Otro",
        name="payment_method_enum",
        native_enum=False,
    )
    settlement_status_enum = sa.Enum(
        "pending",
        "settled",
        "partial",
        name="reseller_settlement_status_enum",
        native_enum=False,
    )
    inventory_status_enum = sa.Enum(
        "assigned",
        "available",
        "maintenance",
        name="inventory_status_enum",
        native_enum=False,
    )

    op.create_table(
        "base_stations",
        sa.Column("base_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "clients",
        sa.Column("client_id", sa.String(length=36), primary_key=True),
        sa.Column("external_code", sa.String(), nullable=True, unique=True),
        sa.Column("client_type", client_type_enum, nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("antenna_ip", sa.String(length=45), nullable=True),
        sa.Column("modem_ip", sa.String(length=45), nullable=True),
        sa.Column("antenna_model", sa.String(), nullable=True),
        sa.Column("modem_model", sa.String(), nullable=True),
        sa.Column(
            "monthly_fee",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "paid_months_ahead",
            sa.Numeric(6, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "debt_months",
            sa.Numeric(6, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "service_status",
            service_status_enum,
            nullable=False,
            server_default=sa.text("'Activo'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("clients_full_name_idx", "clients", ["full_name"])
    op.create_index("clients_location_idx", "clients", ["location"])
    op.create_index("clients_base_idx", "clients", ["base_id"])

    op.create_table(
        "billing_periods",
        sa.Column("period_key", sa.String(length=7), primary_key=True),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.CheckConstraint(
            "period_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'",
            name="billing_periods_period_key_format",
        ),
        sa.UniqueConstraint("starts_on", "ends_on", name="billing_periods_unique_dates"),
    )

    op.create_table(
        "payments",
        sa.Column("payment_id", sa.String(length=36), primary_key=True),
        sa.Column(
            "client_id",
            sa.String(length=36),
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
        sa.Column(
            "months_paid",
            sa.Numeric(6, 2),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("method", payment_method_enum, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("payments_client_idx", "payments", ["client_id"])
    op.create_index("payments_period_idx", "payments", ["period_key"])

    op.create_table(
        "voucher_types",
        sa.Column("voucher_type_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("description", sa.String(), nullable=False),
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
        sa.UniqueConstraint(
            "voucher_type_id",
            "effective_from",
            name="voucher_prices_unique_per_date",
        ),
    )

    op.create_table(
        "resellers",
        sa.Column("reseller_id", sa.String(length=36), primary_key=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_table(
        "reseller_deliveries",
        sa.Column("delivery_id", sa.String(length=36), primary_key=True),
        sa.Column(
            "reseller_id",
            sa.String(length=36),
            sa.ForeignKey("resellers.reseller_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("delivered_on", sa.Date(), nullable=False),
        sa.Column(
            "settlement_status",
            settlement_status_enum,
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "total_value",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "reseller_delivery_items",
        sa.Column("delivery_item_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "delivery_id",
            sa.String(length=36),
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
        sa.CheckConstraint("quantity >= 0", name="reseller_delivery_items_quantity_non_negative"),
    )

    op.create_table(
        "reseller_settlements",
        sa.Column("settlement_id", sa.String(length=36), primary_key=True),
        sa.Column(
            "reseller_id",
            sa.String(length=36),
            sa.ForeignKey("resellers.reseller_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "delivery_id",
            sa.String(length=36),
            sa.ForeignKey("reseller_deliveries.delivery_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("settled_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "inventory_items",
        sa.Column("inventory_id", sa.String(length=36), primary_key=True),
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
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("status", inventory_status_enum, nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column(
            "client_id",
            sa.String(length=36),
            sa.ForeignKey("clients.client_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("installed_at", sa.Date(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("inventory_status_idx", "inventory_items", ["status"])
    op.create_index("inventory_client_idx", "inventory_items", ["client_id"])

    op.create_table(
        "expenses",
        sa.Column("expense_id", sa.String(length=36), primary_key=True),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"),
            nullable=False,
        ),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("expenses_base_date_idx", "expenses", ["base_id", "expense_date"])

    op.create_table(
        "base_operating_costs",
        sa.Column("cost_id", sa.String(length=36), primary_key=True),
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
        sa.UniqueConstraint("base_id", "period_key", name="base_operating_costs_unique_period"),
    )

    base_stations_table = sa.table(
        "base_stations",
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("location", sa.String()),
        sa.column("notes", sa.Text()),
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

    voucher_types_table = sa.table(
        "voucher_types",
        sa.column("code", sa.String()),
        sa.column("description", sa.String()),
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

    voucher_prices_table = sa.table(
        "voucher_prices",
        sa.column("voucher_type_id", sa.Integer()),
        sa.column("effective_from", sa.Date()),
        sa.column("price", sa.Numeric(10, 2)),
    )
    op.bulk_insert(
        voucher_prices_table,
        [
            {"voucher_type_id": 1, "effective_from": date(2025, 1, 1), "price": Decimal("5")},
            {"voucher_type_id": 2, "effective_from": date(2025, 1, 1), "price": Decimal("8")},
            {"voucher_type_id": 3, "effective_from": date(2025, 1, 1), "price": Decimal("15")},
            {"voucher_type_id": 4, "effective_from": date(2025, 1, 1), "price": Decimal("45")},
            {"voucher_type_id": 5, "effective_from": date(2025, 1, 1), "price": Decimal("70")},
            {"voucher_type_id": 6, "effective_from": date(2025, 1, 1), "price": Decimal("140")},
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM voucher_prices")
    op.execute("DELETE FROM voucher_types")
    op.execute("DELETE FROM base_stations")

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
    op.drop_table("billing_periods")
    op.drop_index("clients_base_idx", table_name="clients")
    op.drop_index("clients_location_idx", table_name="clients")
    op.drop_index("clients_full_name_idx", table_name="clients")
    op.drop_table("clients")
    op.drop_table("base_stations")
