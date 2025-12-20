"""Add recurring service charge tables.

Revision ID: 20251005_0015
Revises: 20250925_0014
Create Date: 2025-10-05 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

from app.db_types import GUID


revision = "20251005_0015"
down_revision = "20250925_0014"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


SERVICE_CHARGE_STATUS_ENUM = sa.Enum(
    "pending",
    "invoiced",
    "partially_paid",
    "paid",
    "void",
    name="service_charge_status_enum",
    native_enum=False,
    validate_strings=True,
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("service_charges"):
        op.create_table(
            "service_charges",
            sa.Column(
                "charge_id",
                GUID(),
                primary_key=True,
                nullable=False,
            ),
            sa.Column(
                "subscription_id",
                GUID(),
                sa.ForeignKey("client_services.client_service_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "client_id",
                GUID(),
                sa.ForeignKey("clients.client_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "period_key",
                sa.String(),
                sa.ForeignKey("billing_periods.period_key", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("charge_date", sa.Date(), nullable=False),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column(
                "status",
                SERVICE_CHARGE_STATUS_ENUM,
                nullable=False,
                server_default="pending",
            ),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.CheckConstraint(
                "amount >= 0",
                name="ck_service_charges_amount_non_negative",
            ),
            sa.UniqueConstraint(
                "subscription_id",
                "period_key",
                name="service_charges_unique_subscription_period",
            ),
        )
        op.create_index(
            "service_charges_client_idx",
            "service_charges",
            ["client_id"],
        )
        op.create_index(
            "service_charges_subscription_idx",
            "service_charges",
            ["subscription_id"],
        )
        op.create_index(
            "service_charges_period_idx",
            "service_charges",
            ["period_key"],
        )
        op.create_index(
            "service_charges_status_idx",
            "service_charges",
            ["status"],
        )
        op.create_index(
            "service_charges_charge_date_idx",
            "service_charges",
            ["charge_date"],
        )

    if not inspector.has_table("service_charge_payments"):
        op.create_table(
            "service_charge_payments",
            sa.Column(
                "allocation_id",
                GUID(),
                primary_key=True,
                nullable=False,
            ),
            sa.Column(
                "charge_id",
                GUID(),
                sa.ForeignKey("service_charges.charge_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "payment_id",
                GUID(),
                sa.ForeignKey("service_payments.payment_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("applied_on", sa.Date(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.CheckConstraint(
                "amount >= 0",
                name="ck_service_charge_payments_amount_non_negative",
            ),
            sa.UniqueConstraint(
                "charge_id",
                "payment_id",
                name="service_charge_payments_unique_charge_payment",
            ),
        )
        op.create_index(
            "service_charge_payments_charge_idx",
            "service_charge_payments",
            ["charge_id"],
        )
        op.create_index(
            "service_charge_payments_payment_idx",
            "service_charge_payments",
            ["payment_id"],
        )

    if inspector.has_table("service_charges"):
        op.execute(
            sa.text(
                """
                UPDATE service_charges
                SET status = 'pending'
                WHERE status IS NULL
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("service_charge_payments"):
        op.drop_index(
            "service_charge_payments_payment_idx",
            table_name="service_charge_payments",
        )
        op.drop_index(
            "service_charge_payments_charge_idx",
            table_name="service_charge_payments",
        )
        op.drop_table("service_charge_payments")

    if inspector.has_table("service_charges"):
        op.drop_index("service_charges_charge_date_idx", table_name="service_charges")
        op.drop_index("service_charges_status_idx", table_name="service_charges")
        op.drop_index("service_charges_period_idx", table_name="service_charges")
        op.drop_index("service_charges_subscription_idx", table_name="service_charges")
        op.drop_index("service_charges_client_idx", table_name="service_charges")
        op.drop_table("service_charges")
