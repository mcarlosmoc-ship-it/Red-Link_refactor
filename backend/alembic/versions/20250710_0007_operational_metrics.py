"""Add table to store operational metric events"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision = "20250710_0007"
down_revision = "20250630_0006"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("operational_metric_events"):
        return

    op.create_table(
        "operational_metric_events",
        sa.Column("event_id", sa.String(length=36), primary_key=True),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("duration_ms", sa.Numeric(14, 3), nullable=True),
        sa.Column("labels", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_operational_metric_events_event_type",
        "operational_metric_events",
        ["event_type"],
    )
    op.create_index(
        "ix_operational_metric_events_outcome",
        "operational_metric_events",
        ["outcome"],
    )
    op.create_index(
        "ix_operational_metric_events_created_at",
        "operational_metric_events",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_operational_metric_events_created_at",
        table_name="operational_metric_events",
    )
    op.drop_index(
        "ix_operational_metric_events_outcome",
        table_name="operational_metric_events",
    )
    op.drop_index(
        "ix_operational_metric_events_event_type",
        table_name="operational_metric_events",
    )
    op.drop_table("operational_metric_events")
