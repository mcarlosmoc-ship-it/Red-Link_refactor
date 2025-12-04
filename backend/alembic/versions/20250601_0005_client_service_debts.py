"""Add debt tracking fields to client services

Revision ID: 20250601_0005
Revises: 20250525_0004
Create Date: 2025-06-01
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision = "20250601_0005"
down_revision = "20250525_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("client_services"):
        columns = {col["name"] for col in inspector.get_columns("client_services")}

        if "debt_amount" not in columns:
            op.add_column(
                "client_services",
                sa.Column("debt_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            )
        if "debt_months" not in columns:
            op.add_column(
                "client_services",
                sa.Column("debt_months", sa.Numeric(6, 2), nullable=False, server_default="0"),
            )
        if "debt_notes" not in columns:
            op.add_column(
                "client_services",
                sa.Column("debt_notes", sa.Text(), nullable=True),
            )

        op.create_check_constraint(
            "ck_client_services_debt_amount_non_negative",
            "client_services",
            "debt_amount >= 0",
            schema=None,
        )
        op.create_check_constraint(
            "ck_client_services_debt_months_non_negative",
            "client_services",
            "debt_months >= 0",
            schema=None,
        )

        op.execute(sa.text("UPDATE client_services SET debt_amount = 0 WHERE debt_amount IS NULL"))
        op.execute(sa.text("UPDATE client_services SET debt_months = 0 WHERE debt_months IS NULL"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("client_services"):
        op.drop_constraint(
            "ck_client_services_debt_amount_non_negative",
            "client_services",
            type_="check",
        )
        op.drop_constraint(
            "ck_client_services_debt_months_non_negative",
            "client_services",
            type_="check",
        )

        columns = {col["name"] for col in inspector.get_columns("client_services")}
        if "debt_amount" in columns:
            op.drop_column("client_services", "debt_amount")
        if "debt_months" in columns:
            op.drop_column("client_services", "debt_months")
        if "debt_notes" in columns:
            op.drop_column("client_services", "debt_notes")
