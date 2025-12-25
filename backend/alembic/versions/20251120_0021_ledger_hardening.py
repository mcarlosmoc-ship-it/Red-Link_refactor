"""Harden ledger view and add supporting indexes."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251120_0021_ledger_hardening"
down_revision = "20251115_0020_service_ledger_balance_view"
branch_labels = None
depends_on = None


def _due_soon_cutoff(dialect: str) -> str:
    return {
        "sqlite": "date('now','+7 day')",
        "postgresql": "CURRENT_DATE + INTERVAL '7 days'",
        "postgres": "CURRENT_DATE + INTERVAL '7 days'",
    }.get(dialect, "CURRENT_DATE + INTERVAL '7 days'")


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    due_soon_cutoff = _due_soon_cutoff(dialect)

    # Recreate the view so services without charges still surface a zeroed balance.
    op.execute(sa.text("DROP VIEW IF EXISTS service_ledger_balances"))
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
            ),
            charge_aggregates AS (
                SELECT
                    cs.client_service_id,
                    cs.client_id,
                    COALESCE(SUM(cs.open_amount), 0) AS balance_due,
                    SUM(CASE WHEN cs.open_amount > 0 THEN 1 ELSE 0 END) AS months_due,
                    MIN(CASE WHEN cs.open_amount > 0 THEN cs.due_date END) AS next_due_date
                FROM charge_status cs
                GROUP BY cs.client_service_id, cs.client_id
            )
            SELECT
                s.client_service_id,
                s.client_id,
                COALESCE(ca.balance_due, 0) AS balance_due,
                COALESCE(ca.months_due, 0) AS months_due,
                CASE
                    WHEN ca.next_due_date IS NOT NULL AND ca.next_due_date <= {due_soon_cutoff}
                        THEN 1
                    ELSE 0
                END AS due_soon,
                ca.next_due_date
            FROM client_services s
            LEFT JOIN charge_aggregates ca ON ca.client_service_id = s.client_service_id
            """
        )
    )

    # Ledger indexes
    op.create_index(
        "ix_service_charges_subscription_due_status",
        "service_charges",
        ["subscription_id", "due_date", "status"],
    )
    op.create_index(
        "ix_service_charges_client_period",
        "service_charges",
        ["client_id", "period_key"],
    )
    op.create_index(
        "ix_service_charge_payments_charge",
        "service_charge_payments",
        ["charge_id"],
    )
    op.create_index(
        "ix_service_charge_payments_payment",
        "service_charge_payments",
        ["payment_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_service_charge_payments_payment", table_name="service_charge_payments")
    op.drop_index("ix_service_charge_payments_charge", table_name="service_charge_payments")
    op.drop_index("ix_service_charges_client_period", table_name="service_charges")
    op.drop_index("ix_service_charges_subscription_due_status", table_name="service_charges")

    bind = op.get_bind()
    dialect = bind.dialect.name
    due_soon_cutoff = _due_soon_cutoff(dialect)

    op.execute(sa.text("DROP VIEW IF EXISTS service_ledger_balances"))
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
