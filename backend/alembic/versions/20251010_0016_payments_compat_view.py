"""Create compatibility view for legacy payments.

Revision ID: 20251010_0016
Revises: 20251005_0015
Create Date: 2025-10-10 00:00:00.000000
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20251010_0016"
down_revision = "20251005_0015"
branch_labels = None
depends_on = None

VIEW_NAME = "payments_compat_view"


def upgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {VIEW_NAME}")
    op.execute(
        f"""
        CREATE VIEW {VIEW_NAME} AS
        SELECT
            sp.payment_id,
            sp.client_id,
            sc.period_key,
            sp.paid_on,
            scp.amount,
            sp.months_paid,
            sp.method,
            sp.note,
            sp.created_at
        FROM service_payments sp
        JOIN service_charge_payments scp ON scp.payment_id = sp.payment_id
        JOIN service_charges sc ON sc.charge_id = scp.charge_id

        UNION ALL

        SELECT
            sp.payment_id,
            sp.client_id,
            sp.period_key,
            sp.paid_on,
            sp.amount,
            sp.months_paid,
            sp.method,
            sp.note,
            sp.created_at
        FROM service_payments sp
        WHERE NOT EXISTS (
            SELECT 1 FROM service_charge_payments scp
            WHERE scp.payment_id = sp.payment_id
        )
        """
    )


def downgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {VIEW_NAME}")
