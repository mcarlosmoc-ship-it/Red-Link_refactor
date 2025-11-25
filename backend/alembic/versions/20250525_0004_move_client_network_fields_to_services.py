"""Migrate client network fields into client service records."""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

from app.db_types import INET

revision = "20250525_0004"
down_revision = "20250520_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _column_exists(inspector: sa.Inspector, table: str, column: str) -> bool:
    return any(col["name"] == column for col in inspector.get_columns(table))


def _index_exists(inspector: sa.Inspector, table: str, index: str) -> bool:
    return any(idx["name"] == index for idx in inspector.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("client_services"):
        service_columns = {col["name"] for col in inspector.get_columns("client_services")}

        if "antenna_ip" not in service_columns:
            op.add_column("client_services", sa.Column("antenna_ip", INET(), nullable=True))
        if "modem_ip" not in service_columns:
            op.add_column("client_services", sa.Column("modem_ip", INET(), nullable=True))
        if "antenna_model" not in service_columns:
            op.add_column("client_services", sa.Column("antenna_model", sa.String(), nullable=True))
        if "modem_model" not in service_columns:
            op.add_column("client_services", sa.Column("modem_model", sa.String(), nullable=True))

        inspector = sa.inspect(bind)
        service_columns = {col["name"] for col in inspector.get_columns("client_services")}

        if inspector.has_table("clients") and {"ip_address", "antenna_ip", "modem_ip"}.issubset(
            {col["name"] for col in inspector.get_columns("clients")}
        ):
            op.execute(
                sa.text(
                    """
                    WITH ranked_services AS (
                        SELECT
                            cs.client_service_id,
                            cs.client_id,
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
                        FROM client_services AS cs
                    )
                    UPDATE client_services AS cs
                    SET
                        ip_address = COALESCE(cs.ip_address, c.ip_address),
                        antenna_ip = COALESCE(cs.antenna_ip, c.antenna_ip),
                        modem_ip = COALESCE(cs.modem_ip, c.modem_ip),
                        antenna_model = COALESCE(cs.antenna_model, c.antenna_model),
                        modem_model = COALESCE(cs.modem_model, c.modem_model)
                    FROM ranked_services AS ranked
                    JOIN clients AS c ON c.client_id = ranked.client_id
                    WHERE ranked.client_service_id = cs.client_service_id
                      AND ranked.rn = 1
                    """
                )
            )

        if not _index_exists(inspector, "client_services", "client_services_ip_unique_idx"):
            op.create_index(
                "client_services_ip_unique_idx",
                "client_services",
                ["ip_address"],
                unique=True,
                postgresql_where=sa.text("ip_address IS NOT NULL"),
                sqlite_where=sa.text("ip_address IS NOT NULL"),
            )
        if not _index_exists(inspector, "client_services", "client_services_antenna_ip_unique_idx"):
            op.create_index(
                "client_services_antenna_ip_unique_idx",
                "client_services",
                ["antenna_ip"],
                unique=True,
                postgresql_where=sa.text("antenna_ip IS NOT NULL"),
                sqlite_where=sa.text("antenna_ip IS NOT NULL"),
            )
        if not _index_exists(inspector, "client_services", "client_services_modem_ip_unique_idx"):
            op.create_index(
                "client_services_modem_ip_unique_idx",
                "client_services",
                ["modem_ip"],
                unique=True,
                postgresql_where=sa.text("modem_ip IS NOT NULL"),
                sqlite_where=sa.text("modem_ip IS NOT NULL"),
            )

    inspector = sa.inspect(bind)
    if inspector.has_table("clients"):
        client_columns = {col["name"] for col in inspector.get_columns("clients")}
        client_indexes = {idx["name"] for idx in inspector.get_indexes("clients")}

        with op.batch_alter_table("clients", recreate="always") as batch_op:
            if "clients_ip_address_unique_idx" in client_indexes:
                batch_op.drop_index("clients_ip_address_unique_idx")
            if "clients_antenna_ip_unique_idx" in client_indexes:
                batch_op.drop_index("clients_antenna_ip_unique_idx")
            if "clients_modem_ip_unique_idx" in client_indexes:
                batch_op.drop_index("clients_modem_ip_unique_idx")
            if "ip_address" in client_columns:
                batch_op.drop_column("ip_address")
            if "antenna_ip" in client_columns:
                batch_op.drop_column("antenna_ip")
            if "modem_ip" in client_columns:
                batch_op.drop_column("modem_ip")
            if "antenna_model" in client_columns:
                batch_op.drop_column("antenna_model")
            if "modem_model" in client_columns:
                batch_op.drop_column("modem_model")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("clients"):
        client_columns = {col["name"] for col in inspector.get_columns("clients")}
        if "ip_address" not in client_columns:
            op.add_column("clients", sa.Column("ip_address", INET(), nullable=True))
        if "antenna_ip" not in client_columns:
            op.add_column("clients", sa.Column("antenna_ip", INET(), nullable=True))
        if "modem_ip" not in client_columns:
            op.add_column("clients", sa.Column("modem_ip", INET(), nullable=True))
        if "antenna_model" not in client_columns:
            op.add_column("clients", sa.Column("antenna_model", sa.String(), nullable=True))
        if "modem_model" not in client_columns:
            op.add_column("clients", sa.Column("modem_model", sa.String(), nullable=True))

    inspector = sa.inspect(bind)
    if inspector.has_table("client_services"):
        service_columns = {col["name"] for col in inspector.get_columns("client_services")}
        service_indexes = {idx["name"] for idx in inspector.get_indexes("client_services")}

        if "client_services_ip_unique_idx" in service_indexes:
            op.drop_index("client_services_ip_unique_idx", table_name="client_services")
        if "client_services_antenna_ip_unique_idx" in service_indexes:
            op.drop_index("client_services_antenna_ip_unique_idx", table_name="client_services")
        if "client_services_modem_ip_unique_idx" in service_indexes:
            op.drop_index("client_services_modem_ip_unique_idx", table_name="client_services")

        if inspector.has_table("clients"):
            op.execute(
                sa.text(
                    """
                    WITH ranked_services AS (
                        SELECT
                            cs.client_service_id,
                            cs.client_id,
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
                        FROM client_services AS cs
                    )
                    UPDATE clients AS c
                    SET
                        ip_address = COALESCE(c.ip_address, cs.ip_address),
                        antenna_ip = COALESCE(c.antenna_ip, cs.antenna_ip),
                        modem_ip = COALESCE(c.modem_ip, cs.modem_ip),
                        antenna_model = COALESCE(c.antenna_model, cs.antenna_model),
                        modem_model = COALESCE(c.modem_model, cs.modem_model)
                    FROM ranked_services AS ranked
                    JOIN client_services AS cs ON cs.client_service_id = ranked.client_service_id
                    WHERE ranked.client_id = c.client_id
                      AND ranked.rn = 1
                    """
                )
            )

        if "modem_model" in service_columns:
            op.drop_column("client_services", "modem_model")
        if "antenna_model" in service_columns:
            op.drop_column("client_services", "antenna_model")
        if "modem_ip" in service_columns:
            op.drop_column("client_services", "modem_ip")
        if "antenna_ip" in service_columns:
            op.drop_column("client_services", "antenna_ip")

    inspector = sa.inspect(bind)
    if inspector.has_table("clients"):
        client_columns = {col["name"] for col in inspector.get_columns("clients")}
        if not _index_exists(inspector, "clients", "clients_ip_address_unique_idx") and "ip_address" in client_columns:
            op.create_index(
                "clients_ip_address_unique_idx",
                "clients",
                ["ip_address"],
                unique=True,
                postgresql_where=sa.text("ip_address IS NOT NULL"),
                sqlite_where=sa.text("ip_address IS NOT NULL"),
            )
        if not _index_exists(inspector, "clients", "clients_antenna_ip_unique_idx") and "antenna_ip" in client_columns:
            op.create_index(
                "clients_antenna_ip_unique_idx",
                "clients",
                ["antenna_ip"],
                unique=True,
                postgresql_where=sa.text("antenna_ip IS NOT NULL"),
                sqlite_where=sa.text("antenna_ip IS NOT NULL"),
            )
        if not _index_exists(inspector, "clients", "clients_modem_ip_unique_idx") and "modem_ip" in client_columns:
            op.create_index(
                "clients_modem_ip_unique_idx",
                "clients",
                ["modem_ip"],
                unique=True,
                postgresql_where=sa.text("modem_ip IS NOT NULL"),
                sqlite_where=sa.text("modem_ip IS NOT NULL"),
            )
