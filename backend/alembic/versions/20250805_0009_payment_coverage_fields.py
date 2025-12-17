"""Add coverage and partial payment tracking to client services

Revision ID: 20250805_0009
Revises: 20250725_0008
Create Date: 2025-08-05 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250805_0009"
down_revision = "20250725_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("client_services")}

    if "vigente_hasta_periodo" not in existing_columns:
        op.add_column(
            "client_services",
            sa.Column("vigente_hasta_periodo", sa.Text(), nullable=True),
        )
    if "abono_periodo" not in existing_columns:
        op.add_column(
            "client_services",
            sa.Column("abono_periodo", sa.Text(), nullable=True),
        )
    if "abono_monto" not in existing_columns:
        op.add_column(
            "client_services",
            sa.Column(
                "abono_monto", sa.Numeric(12, 2), nullable=False, server_default="0"
            ),
        )
        op.create_check_constraint(
            "ck_client_services_abono_monto_non_negative",
            "client_services",
            "abono_monto >= 0",
        )
        op.alter_column("client_services", "abono_monto", server_default=None)


def downgrade() -> None:
    op.drop_constraint(
        "ck_client_services_abono_monto_non_negative", "client_services", type_="check"
    )
    op.drop_column("client_services", "abono_monto")
    op.drop_column("client_services", "abono_periodo")
    op.drop_column("client_services", "vigente_hasta_periodo")
