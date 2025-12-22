"""Create compatibility view for client network fields.

Revision ID: 20251030_0018
Revises: 20251020_0017
Create Date: 2025-10-30 00:00:00.000000
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20251030_0018"
down_revision = "20251020_0017"
branch_labels = None
depends_on = None

VIEW_NAME = "client_network_compat"


def upgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {VIEW_NAME}")
    op.execute(
        f"""
        CREATE VIEW {VIEW_NAME} AS
        WITH ranked_services AS (
            SELECT
                cs.client_id AS client_id,
                cs.client_service_id AS service_id,
                cs.antenna_ip,
                cs.modem_ip,
                cs.antenna_model,
                cs.modem_model,
                cs.status,
                cs.created_at,
                ROW_NUMBER() OVER (
                    PARTITION BY cs.client_id
                    ORDER BY
                        CASE cs.status
                            WHEN 'active' THEN 0
                            WHEN 'suspended' THEN 1
                            WHEN 'pending' THEN 2
                            ELSE 3
                        END,
                        cs.created_at
                ) AS rn
            FROM client_services cs
        ),
        ranked_ips AS (
            SELECT
                service_id,
                ip_address,
                ROW_NUMBER() OVER (
                    PARTITION BY service_id
                    ORDER BY assigned_at DESC, created_at DESC
                ) AS rn
            FROM service_ip_assignments
        )
        SELECT
            rs.client_id,
            rs.service_id,
            ri.ip_address,
            rs.antenna_ip,
            rs.modem_ip,
            rs.antenna_model,
            rs.modem_model
        FROM ranked_services rs
        LEFT JOIN ranked_ips ri ON ri.service_id = rs.service_id AND ri.rn = 1
        WHERE rs.rn = 1
        """
    )


def downgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {VIEW_NAME}")
