"""Remove legacy IP column from client services.

Revision ID: 20250925_0014
Revises: 20250920_0013
Create Date: 2025-09-25 00:00:00.000000
"""

from __future__ import annotations

import uuid
from typing import Sequence

import sqlalchemy as sa
from alembic import op

from app.db_types import INET

# revision identifiers, used by Alembic.
revision = "20250925_0014"
down_revision = "20250920_0013"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("client_services"):
        return

    service_columns = {col["name"] for col in inspector.get_columns("client_services")}
    if "ip_address" in service_columns and inspector.has_table("base_ip_reservations"):
        result = bind.execute(
            sa.text(
                """
                SELECT client_service_id, client_id, zone_id, ip_address
                FROM client_services
                WHERE ip_address IS NOT NULL
                """
            )
        )
        rows = result.mappings().all()
        for row in rows:
            base_id = row.get("zone_id")
            ip_address = row.get("ip_address")
            if base_id is None or ip_address is None:
                continue

            existing = bind.execute(
                sa.text(
                    """
                    SELECT reservation_id, service_id
                    FROM base_ip_reservations
                    WHERE base_id = :base_id AND ip_address = :ip_address
                    """
                ),
                {"base_id": base_id, "ip_address": ip_address},
            ).mappings().first()

            if existing:
                bind.execute(
                    sa.text(
                        """
                        UPDATE base_ip_reservations
                        SET
                            status = 'in_use',
                            service_id = :service_id,
                            client_id = :client_id,
                            assigned_at = COALESCE(assigned_at, CURRENT_TIMESTAMP),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE reservation_id = :reservation_id
                        """
                    ),
                    {
                        "reservation_id": existing["reservation_id"],
                        "service_id": row["client_service_id"],
                        "client_id": row["client_id"],
                    },
                )
            else:
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO base_ip_reservations (
                            reservation_id,
                            base_id,
                            ip_address,
                            status,
                            service_id,
                            client_id,
                            assigned_at,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :reservation_id,
                            :base_id,
                            :ip_address,
                            'in_use',
                            :service_id,
                            :client_id,
                            CURRENT_TIMESTAMP,
                            CURRENT_TIMESTAMP,
                            CURRENT_TIMESTAMP
                        )
                        """
                    ),
                    {
                        "reservation_id": str(uuid.uuid4()),
                        "base_id": base_id,
                        "ip_address": ip_address,
                        "service_id": row["client_service_id"],
                        "client_id": row["client_id"],
                    },
                )

    inspector = sa.inspect(bind)
    if inspector.has_table("client_services"):
        service_columns = {col["name"] for col in inspector.get_columns("client_services")}
        service_indexes = {idx["name"] for idx in inspector.get_indexes("client_services")}
        with op.batch_alter_table("client_services", recreate="auto") as batch_op:
            if "client_services_ip_unique_idx" in service_indexes:
                batch_op.drop_index("client_services_ip_unique_idx")
            if "ip_address" in service_columns:
                batch_op.drop_column("ip_address")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("client_services"):
        return

    service_columns = {col["name"] for col in inspector.get_columns("client_services")}
    with op.batch_alter_table("client_services", recreate="auto") as batch_op:
        if "ip_address" not in service_columns:
            batch_op.add_column(sa.Column("ip_address", INET(), nullable=True))

    if inspector.has_table("base_ip_reservations"):
        bind.execute(
            sa.text(
                """
                UPDATE client_services
                SET ip_address = (
                    SELECT base_ip_reservations.ip_address
                    FROM base_ip_reservations
                    WHERE base_ip_reservations.service_id = client_services.client_service_id
                    ORDER BY base_ip_reservations.assigned_at DESC
                    LIMIT 1
                )
                WHERE ip_address IS NULL
                """
            )
        )

    inspector = sa.inspect(bind)
    service_columns = {col["name"] for col in inspector.get_columns("client_services")}
    if "ip_address" in service_columns:
        op.create_index(
            "client_services_ip_unique_idx",
            "client_services",
            ["ip_address"],
            unique=True,
            postgresql_where=sa.text("ip_address IS NOT NULL"),
            sqlite_where=sa.text("ip_address IS NOT NULL"),
        )
