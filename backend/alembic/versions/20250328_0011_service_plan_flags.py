from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20250328_0011"
down_revision = "20250320_0010"
branch_labels = None
depends_on = None


def _get_columns(inspector, table_name):
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect_name = bind.dialect.name

    if "service_plans" in inspector.get_table_names():
        columns = _get_columns(inspector, "service_plans")

        if "requires_ip" not in columns:
            op.add_column(
                "service_plans",
                sa.Column(
                    "requires_ip",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                ),
            )
            op.execute(
                sa.text(
                    "UPDATE service_plans SET requires_ip = 1 "
                    "WHERE service_type LIKE 'internet_%'"
                )
            )
            if dialect_name != "sqlite":
                op.alter_column(
                    "service_plans",
                    "requires_ip",
                    server_default=None,
                    existing_type=sa.Boolean(),
                )

        if "requires_base" not in columns:
            op.add_column(
                "service_plans",
                sa.Column(
                    "requires_base",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                ),
            )
            op.execute(
                sa.text(
                    "UPDATE service_plans SET requires_base = 1 "
                    "WHERE service_type LIKE 'internet_%'"
                )
            )
            if dialect_name != "sqlite":
                op.alter_column(
                    "service_plans",
                    "requires_base",
                    server_default=None,
                    existing_type=sa.Boolean(),
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "service_plans" in inspector.get_table_names():
        columns = _get_columns(inspector, "service_plans")
        if "requires_ip" in columns:
            op.drop_column("service_plans", "requires_ip")
        if "requires_base" in columns:
            op.drop_column("service_plans", "requires_base")
