"""Create view for service-to-IP assignments.

Revision ID: 20250920_0013
Revises: 20250910_0012
Create Date: 2025-09-20 00:00:00.000000
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20250920_0013"
down_revision = "20250910_0012"
branch_labels = None
depends_on = None


VIEW_NAME = "service_ip_assignments"


def upgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {VIEW_NAME}")
    op.execute(
        f"""
        CREATE VIEW {VIEW_NAME} AS
        SELECT
            reservation_id,
            service_id,
            client_id,
            base_id,
            pool_id,
            ip_address,
            status,
            assigned_at,
            released_at,
            inventory_item_id,
            created_at,
            updated_at
        FROM base_ip_reservations
        WHERE service_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {VIEW_NAME}")
