"""Add centralized catalogs for accounts and payment methods."""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251020_0017_account_catalogs"
down_revision = "20251010_0016_payments_compat_view"
branch_labels = None
depends_on = None

ACCOUNT_STATUS_VALUES = ("activo", "suspendido", "moroso")
PAYMENT_METHOD_VALUES = (
    "Mixto",
    "Efectivo",
    "Transferencia",
    "Tarjeta",
    "Revendedor",
    "Otro",
)


def _get_inspector(bind):
    return sa.inspect(bind)


def _table_exists(bind, table_name: str) -> bool:
    return table_name in _get_inspector(bind).get_table_names()


def _column_exists(bind, table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in _get_inspector(bind).get_columns(table_name)
    )


def _check_constraint_exists(bind, table_name: str, constraint_name: str) -> bool:
    return any(
        constraint["name"] == constraint_name
        for constraint in _get_inspector(bind).get_check_constraints(table_name)
    )


def _foreign_key_exists(bind, table_name: str, constraint_name: str) -> bool:
    return any(
        constraint["name"] == constraint_name
        for constraint in _get_inspector(bind).get_foreign_keys(table_name)
    )


def _normalize_account_statuses() -> None:
    op.execute(
        """
        UPDATE client_accounts
        SET estatus = CASE
            WHEN lower(trim(estatus)) IN ('activo','suspendido','moroso')
                THEN lower(trim(estatus))
            ELSE 'activo'
        END
        WHERE estatus IS NOT NULL
        """
    )


def _normalize_payment_methods(table_name: str, column_name: str) -> None:
    values_list = ",".join(f"'{value}'" for value in PAYMENT_METHOD_VALUES)
    op.execute(
        f"""
        UPDATE {table_name}
        SET {column_name} = 'Otro'
        WHERE {column_name} IS NOT NULL
          AND {column_name} NOT IN ({values_list})
        """
    )


def _alter_payment_method_column(bind, table_name: str, column_name: str) -> None:
    if not _table_exists(bind, table_name) or not _column_exists(bind, table_name, column_name):
        return
    payment_method_enum = sa.Enum(*PAYMENT_METHOD_VALUES, name="payment_method_enum")
    if bind.dialect.name == "postgresql":
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.String(length=50),
            type_=payment_method_enum,
            postgresql_using=f"{column_name}::text::payment_method_enum",
        )
    else:
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.String(length=50),
            type_=payment_method_enum,
        )


def upgrade() -> None:
    bind = op.get_bind()

    account_status_enum = sa.Enum(*ACCOUNT_STATUS_VALUES, name="client_account_status_enum")
    payment_method_enum = sa.Enum(*PAYMENT_METHOD_VALUES, name="payment_method_enum")

    if bind.dialect.name == "postgresql":
        account_status_enum.create(bind, checkfirst=True)
        payment_method_enum.create(bind, checkfirst=True)

    if not _table_exists(bind, "client_account_profiles"):
        op.create_table(
            "client_account_profiles",
            sa.Column("profile", sa.String(length=100), primary_key=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )

    if _table_exists(bind, "client_accounts") and _column_exists(bind, "client_accounts", "perfil"):
        if bind.dialect.name == "postgresql":
            op.execute(
                """
                INSERT INTO client_account_profiles (profile)
                SELECT DISTINCT trim(perfil)
                FROM client_accounts
                WHERE perfil IS NOT NULL AND trim(perfil) <> ''
                ON CONFLICT (profile) DO NOTHING
                """
            )
        else:
            op.execute(
                """
                INSERT OR IGNORE INTO client_account_profiles (profile)
                SELECT DISTINCT trim(perfil)
                FROM client_accounts
                WHERE perfil IS NOT NULL AND trim(perfil) <> ''
                """
            )
        op.execute("UPDATE client_accounts SET perfil = trim(perfil) WHERE perfil IS NOT NULL")

        if not _foreign_key_exists(bind, "client_accounts", "client_accounts_profile_fkey"):
            op.create_foreign_key(
                "client_accounts_profile_fkey",
                "client_accounts",
                "client_account_profiles",
                ["perfil"],
                ["profile"],
                ondelete="RESTRICT",
            )

    if _table_exists(bind, "client_accounts") and _column_exists(bind, "client_accounts", "estatus"):
        _normalize_account_statuses()
        if bind.dialect.name == "postgresql":
            op.alter_column(
                "client_accounts",
                "estatus",
                existing_type=sa.String(length=100),
                type_=account_status_enum,
                postgresql_using="estatus::text::client_account_status_enum",
            )
        else:
            op.alter_column(
                "client_accounts",
                "estatus",
                existing_type=sa.String(length=100),
                type_=account_status_enum,
            )

    if _table_exists(bind, "payments") and _column_exists(bind, "payments", "metodo_pago"):
        if _check_constraint_exists(bind, "payments", "ck_account_payments_metodo_pago"):
            op.drop_constraint("ck_account_payments_metodo_pago", "payments", type_="check")
        _normalize_payment_methods("payments", "metodo_pago")
        _alter_payment_method_column(bind, "payments", "metodo_pago")

    if _table_exists(bind, "pos_sales") and _column_exists(bind, "pos_sales", "payment_method"):
        if _check_constraint_exists(bind, "pos_sales", "ck_pos_sales_payment_method"):
            op.drop_constraint("ck_pos_sales_payment_method", "pos_sales", type_="check")
        _normalize_payment_methods("pos_sales", "payment_method")
        _alter_payment_method_column(bind, "pos_sales", "payment_method")

    if _table_exists(bind, "service_payments") and _column_exists(bind, "service_payments", "method"):
        _normalize_payment_methods("service_payments", "method")
        _alter_payment_method_column(bind, "service_payments", "method")

    if _table_exists(bind, "legacy_payments") and _column_exists(bind, "legacy_payments", "method"):
        if _check_constraint_exists(bind, "legacy_payments", "ck_payments_method"):
            op.drop_constraint("ck_payments_method", "legacy_payments", type_="check")
        _normalize_payment_methods("legacy_payments", "method")
        _alter_payment_method_column(bind, "legacy_payments", "method")

    if _table_exists(bind, "payment_schedules") and _column_exists(bind, "payment_schedules", "method"):
        _normalize_payment_methods("payment_schedules", "method")
        _alter_payment_method_column(bind, "payment_schedules", "method")


def downgrade() -> None:
    bind = op.get_bind()

    account_status_enum = sa.Enum(*ACCOUNT_STATUS_VALUES, name="client_account_status_enum")
    payment_method_enum = sa.Enum(*PAYMENT_METHOD_VALUES, name="payment_method_enum")

    if _table_exists(bind, "payment_schedules") and _column_exists(bind, "payment_schedules", "method"):
        op.alter_column(
            "payment_schedules",
            "method",
            existing_type=payment_method_enum,
            type_=sa.String(length=50),
        )
    if _table_exists(bind, "legacy_payments") and _column_exists(bind, "legacy_payments", "method"):
        op.alter_column(
            "legacy_payments",
            "method",
            existing_type=payment_method_enum,
            type_=sa.String(length=50),
        )
    if _table_exists(bind, "service_payments") and _column_exists(bind, "service_payments", "method"):
        op.alter_column(
            "service_payments",
            "method",
            existing_type=payment_method_enum,
            type_=sa.String(length=50),
        )
    if _table_exists(bind, "pos_sales") and _column_exists(bind, "pos_sales", "payment_method"):
        op.alter_column(
            "pos_sales",
            "payment_method",
            existing_type=payment_method_enum,
            type_=sa.String(length=50),
        )
    if _table_exists(bind, "payments") and _column_exists(bind, "payments", "metodo_pago"):
        op.alter_column(
            "payments",
            "metodo_pago",
            existing_type=payment_method_enum,
            type_=sa.String(length=50),
        )

    if _table_exists(bind, "client_accounts") and _column_exists(bind, "client_accounts", "estatus"):
        op.alter_column(
            "client_accounts",
            "estatus",
            existing_type=account_status_enum,
            type_=sa.String(length=100),
        )

    if _table_exists(bind, "client_accounts") and _foreign_key_exists(bind, "client_accounts", "client_accounts_profile_fkey"):
        op.drop_constraint("client_accounts_profile_fkey", "client_accounts", type_="foreignkey")

    if _table_exists(bind, "client_account_profiles"):
        op.drop_table("client_account_profiles")

    if bind.dialect.name == "postgresql":
        payment_method_enum.drop(bind, checkfirst=True)
        account_status_enum.drop(bind, checkfirst=True)
