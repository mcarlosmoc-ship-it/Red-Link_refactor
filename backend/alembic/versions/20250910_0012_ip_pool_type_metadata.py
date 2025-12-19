"""Add ip_type metadata to base IP pools.

Revision ID: 20250910_0012
Revises: 20250905_0011
Create Date: 2025-09-10 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250910_0012"
down_revision = "20250905_0011"
branch_labels = None
depends_on = None


IP_POOL_TYPE_ENUM = sa.Enum("public", "private", name="ip_pool_type_enum")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("base_ip_pools")}

    IP_POOL_TYPE_ENUM.create(bind, checkfirst=True)

    with op.batch_alter_table("base_ip_pools", recreate="auto") as batch_op:
        if "ip_type" not in existing_columns:
            batch_op.add_column(sa.Column("ip_type", IP_POOL_TYPE_ENUM, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("base_ip_pools")}

    with op.batch_alter_table("base_ip_pools", recreate="auto") as batch_op:
        if "ip_type" in existing_columns:
            batch_op.drop_column("ip_type")

    IP_POOL_TYPE_ENUM.drop(bind, checkfirst=True)
