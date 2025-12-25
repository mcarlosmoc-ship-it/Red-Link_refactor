"""Introduce ledger-based service balance view."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251115_0020_service_ledger_balance_view"
down_revision = "20251105_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    due_soon_cutoff = {
        "sqlite": "date('now','+7 day')",
        "postgresql": "CURRENT_DATE + INTERVAL '7 days'",
        "postgres": "CURRENT_DATE + INTERVAL '7 days'",
    }.get(dialect, "CURRENT_DATE + INTERVAL '7 days'")

    op.execute(
        sa.text(
            f"""
            CREATE VIEW service_ledger_balances AS
            WITH charge_allocations AS (
                SELECT
                    sc.charge_id,
                    COALESCE(SUM(scp.amount), 0) AS allocated_amount
                FROM service_charges sc
                LEFT JOIN service_charge_payments scp ON scp.charge_id = sc.charge_id
                GROUP BY sc.charge_id
            ),
            charge_status AS (
                SELECT
                    sc.subscription_id AS client_service_id,
                    sc.client_id,
                    sc.period_key,
                    sc.due_date,
                    sc.amount,
                    COALESCE(ca.allocated_amount, 0) AS allocated_amount,
                    sc.amount - COALESCE(ca.allocated_amount, 0) AS open_amount
                FROM service_charges sc
                LEFT JOIN charge_allocations ca ON ca.charge_id = sc.charge_id
                WHERE sc.status != 'void'
            )
            SELECT
                cs.client_service_id,
                cs.client_id,
                COALESCE(SUM(cs.open_amount), 0) AS balance_due,
                SUM(CASE WHEN cs.open_amount > 0 THEN 1 ELSE 0 END) AS months_due,
                CASE
                    WHEN MIN(CASE WHEN cs.open_amount > 0 THEN cs.due_date END) IS NOT NULL
                         AND MIN(CASE WHEN cs.open_amount > 0 THEN cs.due_date END) <= {due_soon_cutoff}
                    THEN 1 ELSE 0
                END AS due_soon,
                MIN(CASE WHEN cs.open_amount > 0 THEN cs.due_date END) AS next_due_date
            FROM charge_status cs
            GROUP BY cs.client_service_id, cs.client_id
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP VIEW IF EXISTS service_ledger_balances"))
