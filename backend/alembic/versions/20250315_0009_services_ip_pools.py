"""Introduce client services, service payments, and IP pool management."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "20250315_0009"
down_revision = "20250304_0008"
branch_labels = None
depends_on = None

SQLITE_UUID_DEFAULT = sa.text(
    "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || "
    "substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || "
    "substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))"
)


def _dialect_settings():
    bind = op.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"

    uuid_type = sa.String(length=36)
    uuid_default = SQLITE_UUID_DEFAULT

    if dialect == "postgresql":
        uuid_type = postgresql.UUID(as_uuid=True)
        uuid_default = sa.text("gen_random_uuid()")

    json_type = sa.JSON()
    if dialect == "sqlite":
        json_type = sa.Text()

    return uuid_type, uuid_default, json_type


def upgrade() -> None:
    uuid_type, uuid_default, json_type = _dialect_settings()
    bind = op.get_bind()

    client_service_type_enum = sa.Enum(
        "internet_private",
        "internet_tokens",
        "streaming_spotify",
        "streaming_netflix",
        "streaming_vix",
        "public_desk",
        "point_of_sale",
        "other",
        name="client_service_type_enum",
    )
    client_service_status_enum = sa.Enum(
        "active",
        "suspended",
        "cancelled",
        "pending",
        name="client_service_status_enum",
    )
    ip_reservation_status_enum = sa.Enum(
        "available",
        "reserved",
        "assigned",
        "retired",
        name="ip_reservation_status_enum",
    )

    client_service_type_enum.create(bind, checkfirst=True)
    client_service_status_enum.create(bind, checkfirst=True)
    ip_reservation_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "client_services",
        sa.Column("client_service_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "client_id",
            uuid_type,
            sa.ForeignKey("clients.client_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("service_type", client_service_type_enum, nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("status", client_service_status_enum, nullable=False, server_default="active"),
        sa.Column("billing_day", sa.Integer(), nullable=True),
        sa.Column("next_billing_date", sa.Date(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MXN"),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata", json_type, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "client_id", "service_type", "display_name", name="uq_client_services_client_type_name"
        ),
        sa.CheckConstraint(
            "billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 31)",
            name="ck_client_services_billing_day_range",
        ),
        sa.CheckConstraint("price >= 0", name="ck_client_services_price_non_negative"),
    )
    op.create_index("client_services_client_idx", "client_services", ["client_id"])
    op.create_index("client_services_base_idx", "client_services", ["base_id"])

    op.rename_table("legacy_payments", "service_payments")

    for index_name in (
        "legacy_payments_client_idx",
        "legacy_payments_period_idx",
        "legacy_payments_client_period_idx",
        "legacy_payments_client_paid_on_idx",
        "legacy_payments_period_paid_on_idx",
    ):
        op.drop_index(index_name, table_name="service_payments")

    is_sqlite = bind.dialect.name == "sqlite" if bind else True

    if not is_sqlite:
        op.drop_constraint("ck_payments_months_paid_positive", "service_payments", type_="check")

    if is_sqlite:
        with op.batch_alter_table("service_payments", recreate="always") as batch_op:
            batch_op.alter_column(
                "months_paid",
                existing_type=sa.Numeric(6, 2),
                nullable=True,
            )
    else:
        op.alter_column("service_payments", "months_paid", existing_type=sa.Numeric(6, 2), nullable=True)

    if not is_sqlite:
        op.create_check_constraint(
            "ck_service_payments_months_positive",
            "service_payments",
            "months_paid IS NULL OR months_paid > 0",
        )

    op.add_column(
        "service_payments",
        sa.Column(
            "client_service_id",
            uuid_type,
            sa.ForeignKey("client_services.client_service_id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "service_payments",
        sa.Column("recorded_by", sa.String(120), nullable=True),
    )

    op.create_index("service_payments_client_idx", "service_payments", ["client_id"])
    op.create_index("service_payments_service_idx", "service_payments", ["client_service_id"])
    op.create_index("service_payments_period_idx", "service_payments", ["period_key"])
    op.create_index("service_payments_paid_on_idx", "service_payments", ["paid_on"])

    op.add_column(
        "principal_accounts",
        sa.Column("max_slots", sa.Integer(), nullable=False, server_default="5"),
    )
    op.alter_column("principal_accounts", "max_slots", server_default=None)
    op.add_column(
        "client_accounts",
        sa.Column("client_id", uuid_type, sa.ForeignKey("clients.client_id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "client_accounts",
        sa.Column(
            "client_service_id",
            uuid_type,
            sa.ForeignKey("client_services.client_service_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("client_accounts_client_idx", "client_accounts", ["client_id"])
    op.create_index("client_accounts_client_service_idx", "client_accounts", ["client_service_id"])

    op.create_table(
        "base_ip_pools",
        sa.Column("pool_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("cidr", sa.String(64), nullable=False),
        sa.Column("vlan", sa.String(32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("base_id", "cidr", name="uq_base_ip_pools_base_cidr"),
    )
    op.create_index("base_ip_pools_base_idx", "base_ip_pools", ["base_id"])

    op.create_table(
        "base_ip_reservations",
        sa.Column("reservation_id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "base_id",
            sa.Integer(),
            sa.ForeignKey("base_stations.base_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "pool_id",
            sa.Integer(),
            sa.ForeignKey("base_ip_pools.pool_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("status", ip_reservation_status_enum, nullable=False, server_default="available"),
        sa.Column(
            "service_id",
            uuid_type,
            sa.ForeignKey("client_services.client_service_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "client_id",
            uuid_type,
            sa.ForeignKey("clients.client_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("base_id", "ip_address", name="uq_base_ip_reservations_unique_ip"),
    )
    op.create_index("base_ip_reservations_status_idx", "base_ip_reservations", ["status"])
    op.create_index("base_ip_reservations_pool_idx", "base_ip_reservations", ["pool_id"])
    op.create_index("base_ip_reservations_service_idx", "base_ip_reservations", ["service_id"])
    op.create_index("base_ip_reservations_client_idx", "base_ip_reservations", ["client_id"])

    op.drop_constraint("payment_audit_log_payment_id_fkey", "payment_audit_log", type_="foreignkey")
    op.create_foreign_key(
        "payment_audit_log_payment_id_fkey",
        "payment_audit_log",
        "service_payments",
        ["payment_id"],
        ["payment_id"],
        ondelete="CASCADE",
    )

    metadata = sa.MetaData(bind=bind)
    metadata.reflect(only=["clients", "client_services", "service_payments"])

    clients_table = metadata.tables["clients"]
    services_table = metadata.tables["client_services"]
    payments_table = metadata.tables["service_payments"]

    select_clients = sa.select(
        clients_table.c.client_id,
        clients_table.c.client_type,
        clients_table.c.full_name,
        clients_table.c.base_id,
        clients_table.c.monthly_fee,
    )
    clients = list(bind.execute(select_clients))
    service_id_by_client: dict[str, str] = {}
    for client in clients:
        service_type = "internet_tokens" if client.client_type == "token" else "internet_private"
        display_name = f"Servicio de {client.full_name}" if client.full_name else "Servicio"
        inserted = bind.execute(
            services_table.insert().values(
                client_id=client.client_id,
                service_type=service_type,
                display_name=display_name[:200],
                status="active",
                billing_day=1,
                price=client.monthly_fee or Decimal("0"),
                currency="MXN",
                base_id=client.base_id,
                created_at=datetime.utcnow(),
            )
        )
        service_id = inserted.inserted_primary_key[0]
        service_id_by_client[str(client.client_id)] = service_id

    for client_id, service_id in service_id_by_client.items():
        bind.execute(
            payments_table.update()
            .where(payments_table.c.client_id == client_id)
            .values(client_service_id=service_id)
        )


def downgrade() -> None:
    uuid_type, _, _ = _dialect_settings()
    bind = op.get_bind()

    metadata = sa.MetaData(bind=bind)
    metadata.reflect(only=["service_payments"])
    payments_table = metadata.tables["service_payments"]
    bind.execute(
        payments_table.update().values(client_service_id=None, recorded_by=None)
    )

    op.drop_constraint("payment_audit_log_payment_id_fkey", "payment_audit_log", type_="foreignkey")
    op.create_foreign_key(
        "payment_audit_log_payment_id_fkey",
        "payment_audit_log",
        "service_payments",
        ["payment_id"],
        ["payment_id"],
        ondelete="CASCADE",
    )

    op.drop_index("base_ip_reservations_client_idx", table_name="base_ip_reservations")
    op.drop_index("base_ip_reservations_service_idx", table_name="base_ip_reservations")
    op.drop_index("base_ip_reservations_pool_idx", table_name="base_ip_reservations")
    op.drop_index("base_ip_reservations_status_idx", table_name="base_ip_reservations")
    op.drop_table("base_ip_reservations")
    op.drop_index("base_ip_pools_base_idx", table_name="base_ip_pools")
    op.drop_table("base_ip_pools")

    op.drop_index("client_accounts_client_service_idx", table_name="client_accounts")
    op.drop_index("client_accounts_client_idx", table_name="client_accounts")
    op.drop_column("client_accounts", "client_service_id")
    op.drop_column("client_accounts", "client_id")
    op.drop_column("principal_accounts", "max_slots")

    for index_name in (
        "service_payments_client_idx",
        "service_payments_service_idx",
        "service_payments_period_idx",
        "service_payments_paid_on_idx",
    ):
        op.drop_index(index_name, table_name="service_payments")

    is_sqlite = bind.dialect.name == "sqlite" if bind else True

    if not is_sqlite:
        op.drop_constraint("ck_service_payments_months_positive", "service_payments", type_="check")

    op.alter_column("service_payments", "months_paid", existing_type=sa.Numeric(6, 2), nullable=False)

    if not is_sqlite:
        op.create_check_constraint(
            "ck_payments_months_paid_positive",
            "service_payments",
            "months_paid > 0",
        )
    op.drop_column("service_payments", "recorded_by")
    op.drop_column("service_payments", "client_service_id")

    op.rename_table("service_payments", "legacy_payments")

    op.drop_index("client_services_base_idx", table_name="client_services")
    op.drop_index("client_services_client_idx", table_name="client_services")
    op.drop_table("client_services")

    for enum_name in (
        "ip_reservation_status_enum",
        "client_service_status_enum",
        "client_service_type_enum",
    ):
        if bind.dialect.name == "postgresql":
            op.execute(f"DROP TYPE IF EXISTS {enum_name}")
