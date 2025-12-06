"""Consolidate client account payments into service_payments.

Revision ID: 20250630_0006
Revises: 20250601_0005
Create Date: 2025-06-30
"""

from __future__ import annotations

from calendar import monthrange
from decimal import Decimal, ROUND_HALF_UP
from math import ceil
from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision = "20250630_0006"
down_revision = "20250601_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _add_months(base_date, months: Decimal) -> object:
    whole_months = int(ceil(float(months)))
    if whole_months <= 0:
        return None
    new_month = base_date.month + whole_months
    new_year = base_date.year + (new_month - 1) // 12
    normalized_month = ((new_month - 1) % 12) + 1
    last_day = monthrange(new_year, normalized_month)[1]
    return base_date.replace(
        year=new_year, month=normalized_month, day=min(base_date.day, last_day)
    )


def _infer_months(amount: Decimal, price: Decimal | None) -> Decimal | None:
    if price is None:
        return None
    if Decimal(price) <= 0:
        return None
    months = Decimal(amount) / Decimal(price)
    if months <= 0:
        return None
    return months.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    metadata = sa.MetaData()
    target_tables = [
        "payments",
        "service_payments",
        "client_accounts",
        "client_services",
        "service_plans",
    ]
    existing_tables = [t for t in target_tables if inspector.has_table(t)]

    if not existing_tables:
        return

    metadata.reflect(bind=bind, only=existing_tables)

    payments = metadata.tables.get("payments")
    service_payments = metadata.tables.get("service_payments")
    client_accounts = metadata.tables.get("client_accounts")
    client_services = metadata.tables.get("client_services")
    service_plans = metadata.tables.get("service_plans")

    required_tables = [payments, service_payments, client_accounts, client_services]
    if not all(table is not None for table in required_tables):
        return

    existing_ids = {
        row[0]
        for row in bind.execute(sa.select(service_payments.c.payment_id)).fetchall()
    }

    query = (
        sa.select(
            payments.c.id.label("payment_id"),
            payments.c.client_account_id,
            payments.c.monto,
            payments.c.fecha_pago,
            payments.c.periodo_correspondiente,
            payments.c.metodo_pago,
            payments.c.notas,
            client_accounts.c.client_service_id,
            client_accounts.c.client_id,
            client_services.c.custom_price,
            service_plans.c.monthly_price.label("plan_price"),
        )
        .select_from(
            payments.join(
                client_accounts,
                payments.c.client_account_id == client_accounts.c.id,
            )
            .join(
                client_services,
                client_accounts.c.client_service_id == client_services.c.client_service_id,
            )
            .outerjoin(
                service_plans,
                client_services.c.service_plan_id == service_plans.c.plan_id,
            )
        )
    )

    inserts: list[dict] = []
    next_dates_for_accounts: dict[str, object] = {}
    next_dates_for_services: dict[str, object] = {}

    for row in bind.execute(query).fetchall():
        if row.payment_id in existing_ids:
            continue
        if row.client_service_id is None or row.client_id is None:
            continue

        months_paid = _infer_months(row.monto, row.custom_price or row.plan_price)
        if row.fecha_pago and months_paid:
            next_due = _add_months(row.fecha_pago, months_paid)
            if next_due:
                current_account_date = next_dates_for_accounts.get(row.client_account_id)
                if current_account_date is None or next_due > current_account_date:
                    next_dates_for_accounts[row.client_account_id] = next_due
                current_service_date = next_dates_for_services.get(row.client_service_id)
                if current_service_date is None or next_due > current_service_date:
                    next_dates_for_services[row.client_service_id] = next_due

        inserts.append(
            {
                "payment_id": row.payment_id,
                "client_service_id": row.client_service_id,
                "client_id": row.client_id,
                "period_key": row.periodo_correspondiente,
                "paid_on": row.fecha_pago,
                "amount": row.monto,
                "months_paid": months_paid,
                "method": row.metodo_pago,
                "note": row.notas,
            }
        )

    if inserts:
        op.bulk_insert(service_payments, inserts)

    for account_id, next_due in next_dates_for_accounts.items():
        op.execute(
            sa.update(client_accounts)
            .where(client_accounts.c.id == account_id)
            .values(fecha_proximo_pago=next_due)
        )

    for service_id, next_due in next_dates_for_services.items():
        op.execute(
            sa.update(client_services)
            .where(client_services.c.client_service_id == service_id)
            .values(next_billing_date=next_due)
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    metadata = sa.MetaData()
    target_tables = ["payments", "service_payments"]
    existing_tables = [t for t in target_tables if inspector.has_table(t)]
    if not existing_tables:
        return

    metadata.reflect(bind=bind, only=existing_tables)
    payments = metadata.tables.get("payments")
    service_payments = metadata.tables.get("service_payments")
    if not payments or not service_payments:
        return

    payment_ids = [row[0] for row in bind.execute(sa.select(payments.c.id)).fetchall()]
    if not payment_ids:
        return

    op.execute(
        service_payments.delete().where(service_payments.c.payment_id.in_(payment_ids))
    )
