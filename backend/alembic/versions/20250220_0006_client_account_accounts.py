from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20250220_0006"
down_revision = "20241201_0005"
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

    return uuid_type, uuid_default


def upgrade() -> None:
    uuid_type, uuid_default = _dialect_settings()

    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("principal_accounts"):
        op.create_table(
            "principal_accounts",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column("email_principal", sa.String(length=255), nullable=False, unique=True),
            sa.Column("nota", sa.Text(), nullable=True),
            sa.Column(
                "fecha_alta",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    if not inspector.has_table("client_accounts"):
        op.create_table(
            "client_accounts",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column(
                "principal_account_id",
                uuid_type,
                sa.ForeignKey("principal_accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("correo_cliente", sa.String(length=255), nullable=False, unique=True),
            sa.Column("contrasena_cliente", sa.String(length=255), nullable=False),
            sa.Column("perfil", sa.String(length=100), nullable=False),
            sa.Column("nombre_cliente", sa.String(length=255), nullable=False),
            sa.Column(
                "fecha_registro",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("fecha_proximo_pago", sa.Date(), nullable=True),
            sa.Column("estatus", sa.String(length=100), nullable=False),
        )
        op.create_index(
            "client_accounts_fecha_proximo_pago_idx",
            "client_accounts",
            ["fecha_proximo_pago"],
            unique=False,
        )
        op.create_index(
            "client_accounts_estatus_idx",
            "client_accounts",
            ["estatus"],
            unique=False,
        )

    if inspector.has_table("payments"):
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("payments")}
        for index_name in (
            "payments_client_idx",
            "payments_period_idx",
            "payments_client_period_idx",
            "payments_client_paid_on_idx",
            "payments_period_paid_on_idx",
        ):
            if index_name in existing_indexes:
                op.drop_index(index_name, table_name="payments")

        op.rename_table("payments", "legacy_payments")

        op.create_index(
            "legacy_payments_client_idx",
            "legacy_payments",
            ["client_id"],
            unique=False,
        )
        op.create_index(
            "legacy_payments_period_idx",
            "legacy_payments",
            ["period_key"],
            unique=False,
        )
        op.create_index(
            "legacy_payments_client_period_idx",
            "legacy_payments",
            ["client_id", "period_key"],
            unique=False,
        )
        op.create_index(
            "legacy_payments_client_paid_on_idx",
            "legacy_payments",
            ["client_id", "paid_on"],
            unique=False,
        )
        op.create_index(
            "legacy_payments_period_paid_on_idx",
            "legacy_payments",
            ["period_key", "paid_on"],
            unique=False,
        )

    if not inspector.has_table("payments"):
        payment_method_check = (
            "metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro')"
        )
        op.create_table(
            "payments",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column(
                "client_account_id",
                uuid_type,
                sa.ForeignKey("client_accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("monto", sa.Numeric(12, 2), nullable=False),
            sa.Column("fecha_pago", sa.Date(), nullable=False),
            sa.Column("periodo_correspondiente", sa.String(length=20), nullable=True),
            sa.Column("metodo_pago", sa.String(length=50), nullable=False),
            sa.Column("notas", sa.Text(), nullable=True),
            sa.CheckConstraint(
                "monto >= 0",
                name="ck_account_payments_monto_non_negative",
            ),
            sa.CheckConstraint(payment_method_check, name="ck_account_payments_metodo_pago"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("payments"):
        op.drop_table("payments")

    if inspector.has_table("legacy_payments"):
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("legacy_payments")}
        for index_name in (
            "legacy_payments_client_idx",
            "legacy_payments_period_idx",
            "legacy_payments_client_period_idx",
            "legacy_payments_client_paid_on_idx",
            "legacy_payments_period_paid_on_idx",
        ):
            if index_name in existing_indexes:
                op.drop_index(index_name, table_name="legacy_payments")

        op.rename_table("legacy_payments", "payments")

        op.create_index("payments_client_idx", "payments", ["client_id"], unique=False)
        op.create_index("payments_period_idx", "payments", ["period_key"], unique=False)
        op.create_index(
            "payments_client_period_idx",
            "payments",
            ["client_id", "period_key"],
            unique=False,
        )
        op.create_index(
            "payments_client_paid_on_idx",
            "payments",
            ["client_id", "paid_on"],
            unique=False,
        )
        op.create_index(
            "payments_period_paid_on_idx",
            "payments",
            ["period_key", "paid_on"],
            unique=False,
        )

    if inspector.has_table("client_accounts"):
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("client_accounts")}
        if "client_accounts_estatus_idx" in existing_indexes:
            op.drop_index("client_accounts_estatus_idx", table_name="client_accounts")
        if "client_accounts_fecha_proximo_pago_idx" in existing_indexes:
            op.drop_index(
                "client_accounts_fecha_proximo_pago_idx",
                table_name="client_accounts",
            )
        op.drop_table("client_accounts")

    if inspector.has_table("principal_accounts"):
        op.drop_table("principal_accounts")
