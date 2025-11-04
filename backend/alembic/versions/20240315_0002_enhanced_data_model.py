"""Add extended client, inventory, voucher and support tracking."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.sql import expression


revision = "20240315_0002"
down_revision = "20240315_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect_name = bind.dialect.name

    def table_exists(name: str) -> bool:
        return inspector.has_table(name)

    def column_exists(table: str, column: str) -> bool:
        if not inspector.has_table(table):
            return False
        return column in {col["name"] for col in inspector.get_columns(table)}

    def index_exists(table: str, index: str) -> bool:
        if not inspector.has_table(table):
            return False
        return index in {idx["name"] for idx in inspector.get_indexes(table)}

    def fk_exists(table: str, constraint: str) -> bool:
        if not inspector.has_table(table):
            return False
        return constraint in {fk["name"] for fk in inspector.get_foreign_keys(table)}

    if not table_exists("service_plans"):
        op.create_table(
            "service_plans",
            sa.Column("plan_id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=120), nullable=False, unique=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("download_speed_mbps", sa.Numeric(8, 2), nullable=True),
            sa.Column("upload_speed_mbps", sa.Numeric(8, 2), nullable=True),
            sa.Column("default_monthly_fee", sa.Numeric(10, 2), nullable=False),
            sa.Column("is_token_plan", sa.Boolean(), nullable=False, server_default=expression.false()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=expression.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    if not table_exists("client_plans"):
        op.create_table(
            "client_plans",
            sa.Column("client_plan_id", sa.String(length=36), primary_key=True),
            sa.Column("client_id", sa.String(length=36), nullable=False),
            sa.Column("service_plan_id", sa.Integer(), nullable=False),
            sa.Column("effective_from", sa.Date(), nullable=False),
            sa.Column("effective_to", sa.Date(), nullable=True),
            sa.Column("monthly_fee", sa.Numeric(10, 2), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                server_onupdate=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["service_plan_id"], ["service_plans.plan_id"], ondelete="RESTRICT"),
            sa.UniqueConstraint("client_id", "effective_from", name="client_plans_unique_start"),
        )

    added_active_plan_column = False
    if not column_exists("clients", "active_client_plan_id"):
        op.add_column(
            "clients",
            sa.Column("active_client_plan_id", sa.String(length=36), nullable=True),
        )
        added_active_plan_column = True
    if not index_exists("clients", "clients_active_plan_idx"):
        op.create_index("clients_active_plan_idx", "clients", ["active_client_plan_id"], unique=False)
    if (
        added_active_plan_column
        and dialect_name != "sqlite"
        and not fk_exists("clients", "clients_active_client_plan_id_fkey")
    ):
        op.create_foreign_key(
            "clients_active_client_plan_id_fkey",
            "clients",
            "client_plans",
            ["active_client_plan_id"],
            ["client_plan_id"],
            ondelete="SET NULL",
        )

    if not table_exists("client_contacts"):
        op.create_table(
            "client_contacts",
            sa.Column("contact_id", sa.String(length=36), primary_key=True),
            sa.Column("client_id", sa.String(length=36), nullable=False),
            sa.Column("contact_type", sa.String(), nullable=False),
            sa.Column("value", sa.String(length=255), nullable=False),
            sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=expression.false()),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                server_onupdate=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "contact_type IN ('email', 'phone', 'whatsapp', 'other')",
                name="ck_client_contacts_type",
            ),
        )
        op.create_index("client_contacts_client_idx", "client_contacts", ["client_id"], unique=False)

    if not table_exists("client_status_history"):
        op.create_table(
            "client_status_history",
            sa.Column("status_history_id", sa.String(length=36), primary_key=True),
            sa.Column("client_id", sa.String(length=36), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("changed_by", sa.String(length=100), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "status IN ('Activo', 'Suspendido')",
                name="ck_client_status_history_status",
            ),
        )
        op.create_index(
            "client_status_history_client_idx",
            "client_status_history",
            ["client_id", "changed_at"],
            unique=False,
        )

    if not table_exists("client_ledger_entries"):
        op.create_table(
            "client_ledger_entries",
            sa.Column("ledger_entry_id", sa.String(length=36), primary_key=True),
            sa.Column("client_id", sa.String(length=36), nullable=False),
            sa.Column("period_key", sa.String(), nullable=True),
            sa.Column("entry_type", sa.String(), nullable=False),
            sa.Column("entry_date", sa.Date(), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("balance_after", sa.Numeric(12, 2), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["period_key"], ["billing_periods.period_key"], ondelete="SET NULL"),
            sa.CheckConstraint(
                "entry_type IN ('invoice', 'payment', 'adjustment', 'credit')",
                name="ck_client_ledger_entry_type",
            ),
        )
        op.create_index(
            "client_ledger_entries_client_idx",
            "client_ledger_entries",
            ["client_id", "entry_date"],
            unique=False,
        )
        op.create_index(
            "client_ledger_entries_period_idx",
            "client_ledger_entries",
            ["period_key"],
            unique=False,
        )

    if not table_exists("expense_categories"):
        op.create_table(
            "expense_categories",
            sa.Column("expense_category_id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=100), nullable=False, unique=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=expression.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    added_expense_category_column = False
    if not column_exists("expenses", "category_id"):
        op.add_column("expenses", sa.Column("category_id", sa.Integer(), nullable=True))
        added_expense_category_column = True
    if not column_exists("expenses", "updated_at"):
        op.add_column(
            "expenses",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                server_onupdate=sa.func.now(),
                nullable=False,
            ),
        )
    if not column_exists("expenses", "invoice_number"):
        op.add_column("expenses", sa.Column("invoice_number", sa.String(length=100), nullable=True))
    if not column_exists("expenses", "attachment_url"):
        op.add_column("expenses", sa.Column("attachment_url", sa.String(), nullable=True))
    if not column_exists("expenses", "created_by"):
        op.add_column("expenses", sa.Column("created_by", sa.String(length=100), nullable=True))
    if (
        added_expense_category_column
        and dialect_name != "sqlite"
        and not fk_exists("expenses", "expenses_category_id_fkey")
    ):
        op.create_foreign_key(
            "expenses_category_id_fkey",
            "expenses",
            "expense_categories",
            ["category_id"],
            ["expense_category_id"],
            ondelete="SET NULL",
        )
    if not index_exists("expenses", "expenses_category_idx"):
        op.create_index("expenses_category_idx", "expenses", ["category_id"], unique=False)

    if not column_exists("inventory_items", "category"):
        op.add_column("inventory_items", sa.Column("category", sa.String(), nullable=True))
    if not column_exists("inventory_items", "purchase_date"):
        op.add_column("inventory_items", sa.Column("purchase_date", sa.Date(), nullable=True))
    if not column_exists("inventory_items", "purchase_cost"):
        op.add_column("inventory_items", sa.Column("purchase_cost", sa.Numeric(12, 2), nullable=True))

    if not table_exists("support_tickets"):
        op.create_table(
            "support_tickets",
            sa.Column("ticket_id", sa.String(length=36), primary_key=True),
            sa.Column("client_id", sa.String(length=36), nullable=True),
            sa.Column("base_id", sa.Integer(), nullable=True),
            sa.Column("inventory_id", sa.String(length=36), nullable=True),
            sa.Column("subject", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="open"),
            sa.Column("priority", sa.String(), nullable=False, server_default="medium"),
            sa.Column("assigned_to", sa.String(length=120), nullable=True),
            sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                server_onupdate=sa.func.now(),
                nullable=False,
            ),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("resolution", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["base_id"], ["base_stations.base_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["inventory_id"], ["inventory_items.inventory_id"], ondelete="SET NULL"),
            sa.CheckConstraint(
                "status IN ('open', 'in_progress', 'resolved', 'closed')",
                name="ck_support_tickets_status",
            ),
            sa.CheckConstraint(
                "priority IN ('low', 'medium', 'high', 'urgent')",
                name="ck_support_tickets_priority",
            ),
        )
        op.create_index(
            "support_tickets_client_idx",
            "support_tickets",
            ["client_id", "status"],
            unique=False,
        )
        op.create_index(
            "support_tickets_base_idx",
            "support_tickets",
            ["base_id"],
            unique=False,
        )

    if not table_exists("inventory_movements"):
        op.create_table(
            "inventory_movements",
            sa.Column("movement_id", sa.String(length=36), primary_key=True),
            sa.Column("inventory_id", sa.String(length=36), nullable=False),
            sa.Column("movement_type", sa.String(), nullable=False),
            sa.Column("from_base_id", sa.Integer(), nullable=True),
            sa.Column("to_base_id", sa.Integer(), nullable=True),
            sa.Column("from_client_id", sa.String(length=36), nullable=True),
            sa.Column("to_client_id", sa.String(length=36), nullable=True),
            sa.Column("performed_by", sa.String(length=120), nullable=True),
            sa.Column("moved_on", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["inventory_id"], ["inventory_items.inventory_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["from_base_id"], ["base_stations.base_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["to_base_id"], ["base_stations.base_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["from_client_id"], ["clients.client_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["to_client_id"], ["clients.client_id"], ondelete="SET NULL"),
            sa.CheckConstraint(
                "movement_type IN ('transfer', 'assignment', 'return', 'maintenance', 'adjustment')",
                name="ck_inventory_movements_type",
            ),
        )
        op.create_index(
            "inventory_movements_inventory_idx",
            "inventory_movements",
            ["inventory_id", "moved_on"],
            unique=False,
        )
        op.create_index(
            "inventory_movements_base_from_idx",
            "inventory_movements",
            ["from_base_id"],
            unique=False,
        )
        op.create_index(
            "inventory_movements_base_to_idx",
            "inventory_movements",
            ["to_base_id"],
            unique=False,
        )

    if not table_exists("vouchers"):
        op.create_table(
            "vouchers",
            sa.Column("voucher_id", sa.String(length=36), primary_key=True),
            sa.Column("voucher_code", sa.String(length=64), nullable=False, unique=True),
            sa.Column("voucher_type_id", sa.Integer(), nullable=False),
            sa.Column("delivery_item_id", sa.Integer(), nullable=True),
            sa.Column("activated_by_client_id", sa.String(length=36), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="available"),
            sa.Column("delivered_on", sa.DateTime(timezone=True), nullable=True),
            sa.Column("activated_on", sa.DateTime(timezone=True), nullable=True),
            sa.Column("voided_on", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["voucher_type_id"], ["voucher_types.voucher_type_id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["delivery_item_id"], ["reseller_delivery_items.delivery_item_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["activated_by_client_id"], ["clients.client_id"], ondelete="SET NULL"),
            sa.CheckConstraint(
                "status IN ('available', 'assigned', 'activated', 'expired', 'void')",
                name="ck_vouchers_status",
            ),
        )
        op.create_index("vouchers_status_idx", "vouchers", ["status"], unique=False)
        op.create_index("vouchers_delivery_idx", "vouchers", ["delivery_item_id"], unique=False)


def downgrade() -> None:
    op.drop_index("vouchers_delivery_idx", table_name="vouchers")
    op.drop_index("vouchers_status_idx", table_name="vouchers")
    op.drop_table("vouchers")

    op.drop_index("inventory_movements_base_to_idx", table_name="inventory_movements")
    op.drop_index("inventory_movements_base_from_idx", table_name="inventory_movements")
    op.drop_index("inventory_movements_inventory_idx", table_name="inventory_movements")
    op.drop_table("inventory_movements")

    op.drop_index("support_tickets_base_idx", table_name="support_tickets")
    op.drop_index("support_tickets_client_idx", table_name="support_tickets")
    op.drop_table("support_tickets")

    op.drop_column("inventory_items", "purchase_cost")
    op.drop_column("inventory_items", "purchase_date")
    op.drop_column("inventory_items", "category")

    op.drop_index("expenses_category_idx", table_name="expenses")
    op.drop_constraint("expenses_category_id_fkey", "expenses", type_="foreignkey")
    op.drop_column("expenses", "created_by")
    op.drop_column("expenses", "attachment_url")
    op.drop_column("expenses", "invoice_number")
    op.drop_column("expenses", "updated_at")
    op.drop_column("expenses", "category_id")

    op.drop_table("expense_categories")

    op.drop_index("client_ledger_entries_period_idx", table_name="client_ledger_entries")
    op.drop_index("client_ledger_entries_client_idx", table_name="client_ledger_entries")
    op.drop_table("client_ledger_entries")

    op.drop_index("client_status_history_client_idx", table_name="client_status_history")
    op.drop_table("client_status_history")

    op.drop_index("client_contacts_client_idx", table_name="client_contacts")
    op.drop_table("client_contacts")

    op.drop_constraint("clients_active_client_plan_id_fkey", "clients", type_="foreignkey")
    op.drop_index("clients_active_plan_idx", table_name="clients")
    op.drop_column("clients", "active_client_plan_id")

    op.drop_table("client_plans")
    op.drop_table("service_plans")
