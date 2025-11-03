"""Initial database schema."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20240221_0001"
down_revision = None
branch_labels = None
depends_on = None


CLIENT_TYPE_ENUM = sa.Enum("residential", "token", name="client_type_enum")
SERVICE_STATUS_ENUM = sa.Enum("Activo", "Suspendido", name="client_service_status_enum")
PAYMENT_METHOD_ENUM = sa.Enum(
    "Efectivo",
    "Transferencia",
    "Tarjeta",
    "Revendedor",
    "Otro",
    name="payment_method_enum",
)
DELIVERY_STATUS_ENUM = sa.Enum(
    "pending",
    "settled",
    "partial",
    name="delivery_settlement_status_enum",
)
INVENTORY_STATUS_ENUM = sa.Enum(
    "assigned",
    "available",
    "maintenance",
    name="inventory_status_enum",
)


def upgrade() -> None:
    CLIENT_TYPE_ENUM.create(op.get_bind(), checkfirst=True)
    SERVICE_STATUS_ENUM.create(op.get_bind(), checkfirst=True)
    PAYMENT_METHOD_ENUM.create(op.get_bind(), checkfirst=True)
    DELIVERY_STATUS_ENUM.create(op.get_bind(), checkfirst=True)
    INVENTORY_STATUS_ENUM.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "base_stations",
        sa.Column("base_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "billing_periods",
        sa.Column("period_key", sa.String(), primary_key=True),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.UniqueConstraint("starts_on", "ends_on", name="billing_periods_start_end_key"),
    )

    op.create_table(
        "clients",
        sa.Column("client_id", sa.String(length=36), primary_key=True),
        sa.Column("external_code", sa.String(), nullable=True, unique=True),
        sa.Column("client_type", CLIENT_TYPE_ENUM, nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column("base_id", sa.Integer(), sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("antenna_ip", sa.String(length=45), nullable=True),
        sa.Column("modem_ip", sa.String(length=45), nullable=True),
        sa.Column("antenna_model", sa.String(), nullable=True),
        sa.Column("modem_model", sa.String(), nullable=True),
        sa.Column("monthly_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("paid_months_ahead", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("debt_months", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("service_status", SERVICE_STATUS_ENUM, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            server_onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("clients_full_name_idx", "clients", ["full_name"], unique=False)
    op.create_index("clients_location_idx", "clients", ["location"], unique=False)
    op.create_index("clients_base_idx", "clients", ["base_id"], unique=False)

    op.create_table(
        "voucher_types",
        sa.Column("voucher_type_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=False),
    )

    op.create_table(
        "resellers",
        sa.Column("reseller_id", sa.String(length=36), primary_key=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("base_id", sa.Integer(), sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "expenses",
        sa.Column("expense_id", sa.String(length=36), primary_key=True),
        sa.Column("base_id", sa.Integer(), sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("expenses_base_date_idx", "expenses", ["base_id", "expense_date"], unique=False)

    op.create_table(
        "voucher_prices",
        sa.Column("voucher_price_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("voucher_type_id", sa.Integer(), sa.ForeignKey("voucher_types.voucher_type_id", ondelete="CASCADE"), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.UniqueConstraint("voucher_type_id", "effective_from", name="voucher_prices_unique"),
    )

    op.create_table(
        "payments",
        sa.Column("payment_id", sa.String(length=36), primary_key=True),
        sa.Column("client_id", sa.String(length=36), sa.ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_key", sa.String(), sa.ForeignKey("billing_periods.period_key", ondelete="RESTRICT"), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("months_paid", sa.Numeric(6, 2), nullable=False, server_default="1"),
        sa.Column("method", PAYMENT_METHOD_ENUM, nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("payments_client_idx", "payments", ["client_id"], unique=False)
    op.create_index("payments_period_idx", "payments", ["period_key"], unique=False)

    op.create_table(
        "inventory_items",
        sa.Column("inventory_id", sa.String(length=36), primary_key=True),
        sa.Column("asset_tag", sa.String(), nullable=True, unique=True),
        sa.Column("brand", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("serial_number", sa.String(), nullable=True),
        sa.Column("base_id", sa.Integer(), sa.ForeignKey("base_stations.base_id", onupdate="CASCADE"), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("status", INVENTORY_STATUS_ENUM, nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(length=36), sa.ForeignKey("clients.client_id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("installed_at", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("inventory_status_idx", "inventory_items", ["status"], unique=False)
    op.create_index("inventory_client_idx", "inventory_items", ["client_id"], unique=False)

    op.create_table(
        "reseller_deliveries",
        sa.Column("delivery_id", sa.String(length=36), primary_key=True),
        sa.Column("reseller_id", sa.String(length=36), sa.ForeignKey("resellers.reseller_id", ondelete="CASCADE"), nullable=False),
        sa.Column("delivered_on", sa.Date(), nullable=False),
        sa.Column("settlement_status", DELIVERY_STATUS_ENUM, nullable=False, server_default="pending"),
        sa.Column("total_value", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "reseller_delivery_items",
        sa.Column("delivery_item_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("delivery_id", sa.String(length=36), sa.ForeignKey("reseller_deliveries.delivery_id", ondelete="CASCADE"), nullable=False),
        sa.Column("voucher_type_id", sa.Integer(), sa.ForeignKey("voucher_types.voucher_type_id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
    )

    op.create_table(
        "reseller_settlements",
        sa.Column("settlement_id", sa.String(length=36), primary_key=True),
        sa.Column("reseller_id", sa.String(length=36), sa.ForeignKey("resellers.reseller_id", ondelete="CASCADE"), nullable=False),
        sa.Column("delivery_id", sa.String(length=36), sa.ForeignKey("reseller_deliveries.delivery_id", ondelete="SET NULL"), nullable=True),
        sa.Column("settled_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "base_operating_costs",
        sa.Column("cost_id", sa.String(length=36), primary_key=True),
        sa.Column("base_id", sa.Integer(), sa.ForeignKey("base_stations.base_id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_key", sa.String(), sa.ForeignKey("billing_periods.period_key", ondelete="CASCADE"), nullable=False),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint("base_id", "period_key", name="base_operating_costs_unique"),
    )


def downgrade() -> None:
    op.drop_table("base_operating_costs")
    op.drop_table("reseller_settlements")
    op.drop_table("reseller_delivery_items")
    op.drop_table("reseller_deliveries")
    op.drop_index("inventory_client_idx", table_name="inventory_items")
    op.drop_index("inventory_status_idx", table_name="inventory_items")
    op.drop_table("inventory_items")
    op.drop_index("payments_period_idx", table_name="payments")
    op.drop_index("payments_client_idx", table_name="payments")
    op.drop_table("payments")
    op.drop_table("voucher_prices")
    op.drop_index("expenses_base_date_idx", table_name="expenses")
    op.drop_table("expenses")
    op.drop_table("resellers")
    op.drop_table("voucher_types")
    op.drop_index("clients_base_idx", table_name="clients")
    op.drop_index("clients_location_idx", table_name="clients")
    op.drop_index("clients_full_name_idx", table_name="clients")
    op.drop_table("clients")
    op.drop_table("billing_periods")
    op.drop_table("base_stations")

    INVENTORY_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
    DELIVERY_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
    PAYMENT_METHOD_ENUM.drop(op.get_bind(), checkfirst=True)
    SERVICE_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
    CLIENT_TYPE_ENUM.drop(op.get_bind(), checkfirst=True)
