"""Add actor context fields to IP assignment history.

Revision ID: 20250905_0011
Revises: 20250820_0010
Create Date: 2025-09-05 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250905_0011"
down_revision = "20250820_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"] for column in inspector.get_columns("base_ip_assignment_history")
    }

    with op.batch_alter_table("base_ip_assignment_history", recreate="auto") as batch_op:
        if "actor_id" not in existing_columns:
            batch_op.add_column(sa.Column("actor_id", sa.String(120), nullable=True))
        if "actor_role" not in existing_columns:
            batch_op.add_column(sa.Column("actor_role", sa.String(64), nullable=True))
        if "source" not in existing_columns:
            batch_op.add_column(sa.Column("source", sa.String(64), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"] for column in inspector.get_columns("base_ip_assignment_history")
    }

    with op.batch_alter_table("base_ip_assignment_history", recreate="auto") as batch_op:
        if "source" in existing_columns:
            batch_op.drop_column("source")
        if "actor_role" in existing_columns:
            batch_op.drop_column("actor_role")
        if "actor_id" in existing_columns:
            batch_op.drop_column("actor_id")
