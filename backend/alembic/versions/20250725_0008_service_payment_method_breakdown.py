"""Add method_breakdown column to service_payments"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

revision = "20250725_0008"
down_revision = "20250710_0007"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("service_payments"):
        return

    columns = {column["name"] for column in inspector.get_columns("service_payments")}
    if "method_breakdown" in columns:
        return

    op.add_column(
        "service_payments",
        sa.Column(
            "method_breakdown",
            sa.JSON().with_variant(SQLiteJSON(), "sqlite"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("service_payments"):
        return

    columns = {column["name"] for column in inspector.get_columns("service_payments")}
    if "method_breakdown" not in columns:
        return

    op.drop_column("service_payments", "method_breakdown")
