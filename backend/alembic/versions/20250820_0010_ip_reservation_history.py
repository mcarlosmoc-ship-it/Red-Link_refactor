"""Add IP reservation history and inventory linkage

Revision ID: 20250820_0010
Revises: 20250805_0009
Create Date: 2025-08-20 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db_types import GUID

# revision identifiers, used by Alembic.
revision = "20250820_0010"
down_revision = "20250805_0009"
branch_labels = None
depends_on = None


NEW_STATUSES = ("free", "reserved", "in_use", "quarantine")


def _ensure_enum_values(bind) -> None:
    if bind.dialect.name != "postgresql":
        return
    for status in NEW_STATUSES:
        op.execute(
            sa.text(
                "ALTER TYPE ip_reservation_status_enum ADD VALUE IF NOT EXISTS :value"
            ).bindparams(value=status)
        )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    _ensure_enum_values(bind)

    existing_columns = {
        column["name"] for column in inspector.get_columns("base_ip_reservations")
    }
    existing_tables = set(inspector.get_table_names())

    op.execute(
        sa.text("UPDATE base_ip_reservations SET status='free' WHERE status='available'")
    )
    op.execute(
        sa.text("UPDATE base_ip_reservations SET status='in_use' WHERE status='assigned'")
    )
    op.execute(
        sa.text("UPDATE base_ip_reservations SET status='quarantine' WHERE status='retired'")
    )

    if bind.dialect.name != "sqlite":
        op.drop_constraint(
            "ck_base_ip_reservations_status_valid",
            "base_ip_reservations",
            type_="check",
        )
        op.create_check_constraint(
            "ck_base_ip_reservations_status_valid",
            "base_ip_reservations",
            "status IN ('free','reserved','in_use','quarantine')",
        )

    if "inventory_item_id" not in existing_columns:
        with op.batch_alter_table(
            "base_ip_reservations", recreate="auto"
        ) as batch_op:
            batch_op.add_column(sa.Column("inventory_item_id", GUID(), nullable=True))
            batch_op.create_foreign_key(
                "fk_base_ip_reservations_inventory_item",
                "inventory_items",
                ["inventory_item_id"],
                ["inventory_id"],
                ondelete="SET NULL",
            )
            batch_op.create_index(
                "base_ip_reservations_inventory_item_idx",
                ["inventory_item_id"],
            )

    assignment_id_default = (
        sa.text("uuid_generate_v4()") if bind.dialect.name == "postgresql" else None
    )

    if "base_ip_assignment_history" not in existing_tables:
        op.create_table(
            "base_ip_assignment_history",
            sa.Column(
                "assignment_id",
                GUID(),
                primary_key=True,
                server_default=assignment_id_default,
            ),
            sa.Column("reservation_id", GUID(), nullable=False),
            sa.Column(
                "action",
                sa.Enum(
                    "reserve",
                    "assign",
                    "release",
                    "quarantine",
                    name="ip_assignment_action_enum",
                ),
                nullable=False,
            ),
            sa.Column("previous_status", sa.String(32), nullable=True),
            sa.Column("new_status", sa.String(32), nullable=False),
            sa.Column("service_id", GUID(), nullable=True),
            sa.Column("client_id", GUID(), nullable=True),
            sa.Column("inventory_item_id", GUID(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("recorded_by", sa.String(120), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
            sa.ForeignKeyConstraint(
                ["reservation_id"], ["base_ip_reservations.reservation_id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["service_id"], ["client_services.client_service_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["client_id"], ["clients.client_id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.inventory_id"], ondelete="SET NULL"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_tables = set(inspector.get_table_names())
    if "base_ip_assignment_history" in existing_tables:
        op.drop_table("base_ip_assignment_history")

    existing_columns = {
        column["name"] for column in inspector.get_columns("base_ip_reservations")
    }
    if "inventory_item_id" in existing_columns:
        with op.batch_alter_table(
            "base_ip_reservations", recreate="auto"
        ) as batch_op:
            batch_op.drop_constraint(
                "fk_base_ip_reservations_inventory_item", type_="foreignkey"
            )
            batch_op.drop_index(
                "base_ip_reservations_inventory_item_idx",
            )
            batch_op.drop_column("inventory_item_id")

    if bind.dialect.name != "sqlite":
        op.drop_constraint(
            "ck_base_ip_reservations_status_valid",
            "base_ip_reservations",
            type_="check",
        )
        op.create_check_constraint(
            "ck_base_ip_reservations_status_valid",
            "base_ip_reservations",
            "status IN ('available','reserved','assigned','retired')",
        )
