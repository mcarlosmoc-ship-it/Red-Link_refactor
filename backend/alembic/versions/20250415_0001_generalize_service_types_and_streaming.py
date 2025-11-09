"""Generalize service types and add streaming account models."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import expression

from app.models.client_service import ClientServiceType
from app.models.streaming import StreamingPlatform

revision = "20250415_0001"
down_revision = "20250328_0011"
branch_labels = None
depends_on = None


OLD_SERVICE_TYPE_VALUES = (
    "internet_private",
    "internet_tokens",
    "streaming_spotify",
    "streaming_netflix",
    "streaming_vix",
    "public_desk",
    "point_of_sale",
    "other",
)

TYPE_MAPPING = {
    "internet_private": ClientServiceType.INTERNET.value,
    "internet_tokens": ClientServiceType.HOTSPOT.value,
    "streaming_spotify": ClientServiceType.STREAMING.value,
    "streaming_netflix": ClientServiceType.STREAMING.value,
    "streaming_vix": ClientServiceType.STREAMING.value,
    "public_desk": ClientServiceType.HOTSPOT.value,
    "point_of_sale": ClientServiceType.POINT_OF_SALE.value,
    "other": ClientServiceType.OTHER.value,
}

REVERSE_TYPE_MAPPING = {
    ClientServiceType.INTERNET.value: "internet_private",
    ClientServiceType.HOTSPOT.value: "internet_tokens",
    ClientServiceType.STREAMING.value: "streaming_netflix",
    ClientServiceType.POINT_OF_SALE.value: "point_of_sale",
    ClientServiceType.OTHER.value: "other",
}

NEW_SERVICE_TYPE_VALUES = tuple(member.value for member in ClientServiceType)

OLD_CLIENT_SERVICE_ENUM = sa.Enum(
    *OLD_SERVICE_TYPE_VALUES,
    name="client_service_type_enum",
)
OLD_SERVICE_PLAN_ENUM = sa.Enum(
    *OLD_SERVICE_TYPE_VALUES,
    name="service_plan_type_enum",
)

NEW_CLIENT_SERVICE_ENUM = sa.Enum(
    *NEW_SERVICE_TYPE_VALUES,
    name="client_service_type_enum",
)
NEW_SERVICE_PLAN_ENUM = sa.Enum(
    *NEW_SERVICE_TYPE_VALUES,
    name="service_plan_type_enum",
)

STREAMING_PLATFORM_ENUM = sa.Enum(
    *(member.value for member in StreamingPlatform),
    name="streaming_platform_enum",
)

SQLITE_UUID_DEFAULT = sa.text(
    "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || "
    "substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || "
    "substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))"
)


def _dialect_settings() -> tuple[sa.types.TypeEngine, sa.sql.elements.TextClause]:
    bind = op.get_bind()
    dialect_name = bind.dialect.name if bind else "sqlite"

    uuid_type: sa.types.TypeEngine = sa.String(length=36)
    uuid_default = SQLITE_UUID_DEFAULT

    if dialect_name == "postgresql":
        uuid_type = postgresql.UUID(as_uuid=True)
        uuid_default = sa.text("gen_random_uuid()")

    return uuid_type, uuid_default


def _alter_column_to_string(
    table: str,
    column: str,
    existing_type: sa.Enum,
    *,
    dialect: str,
) -> None:
    if dialect == "sqlite":
        with op.batch_alter_table(table, recreate="always") as batch_op:
            batch_op.alter_column(
                column,
                existing_type=existing_type,
                type_=sa.String(),
                nullable=False,
            )
    else:
        op.alter_column(
            table,
            column,
            existing_type=existing_type,
            type_=sa.String(),
            nullable=False,
            postgresql_using=f"{column}::text",
        )


def _alter_column_to_enum(
    table: str,
    column: str,
    enum_type: sa.Enum,
    *,
    dialect: str,
) -> None:
    if dialect == "sqlite":
        with op.batch_alter_table(table, recreate="always") as batch_op:
            batch_op.alter_column(
                column,
                existing_type=sa.String(),
                type_=enum_type,
                nullable=False,
            )
    else:
        op.alter_column(
            table,
            column,
            existing_type=sa.String(),
            type_=enum_type,
            nullable=False,
            postgresql_using=f"{column}::{enum_type.name}",
        )


def _apply_type_mapping(table: str) -> None:
    for old_value, new_value in TYPE_MAPPING.items():
        op.execute(
            sa.text(
                f"UPDATE {table} SET service_type = :new_value WHERE service_type = :old_value"
            ).bindparams(new_value=new_value, old_value=old_value)
        )

    params = {f"v{i}": value for i, value in enumerate(NEW_SERVICE_TYPE_VALUES)}
    placeholders = ", ".join(f":{key}" for key in params.keys())
    op.execute(
        sa.text(
            f"""
            UPDATE {table}
            SET service_type = :fallback
            WHERE service_type IS NULL
               OR service_type NOT IN ({placeholders})
        """
        ).bindparams(fallback=ClientServiceType.OTHER.value, **params)
    )


def _create_streaming_tables(uuid_type: sa.types.TypeEngine, uuid_default) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    STREAMING_PLATFORM_ENUM.create(bind, checkfirst=True)

    if not inspector.has_table("streaming_accounts"):
        op.create_table(
            "streaming_accounts",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column("platform", STREAMING_PLATFORM_ENUM, nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("password", sa.String(255), nullable=False),
            sa.Column("service_plan_id", sa.Integer(), nullable=True),
            sa.Column(
                "total_slots",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                server_onupdate=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["service_plan_id"],
                ["service_plans.plan_id"],
                name="streaming_accounts_service_plan_id_fkey",
                ondelete="SET NULL",
            ),
            sa.UniqueConstraint("email", name="uq_streaming_accounts_email"),
        )

    existing_account_indexes = {
        index["name"] for index in inspector.get_indexes("streaming_accounts")
    }
    if "streaming_accounts_plan_idx" not in existing_account_indexes and inspector.has_table(
        "streaming_accounts"
    ):
        op.create_index(
            "streaming_accounts_plan_idx",
            "streaming_accounts",
            ["service_plan_id"],
        )

    if not inspector.has_table("streaming_slots"):
        op.create_table(
            "streaming_slots",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column("streaming_account_id", uuid_type, nullable=False),
            sa.Column("slot_label", sa.String(120), nullable=False),
            sa.Column(
                "is_assigned",
                sa.Boolean(),
                nullable=False,
                server_default=expression.false(),
            ),
            sa.Column("client_service_id", uuid_type, nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
                server_onupdate=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["streaming_account_id"],
                ["streaming_accounts.id"],
                name="streaming_slots_account_id_fkey",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["client_service_id"],
                ["client_services.client_service_id"],
                name="streaming_slots_service_id_fkey",
                ondelete="SET NULL",
            ),
            sa.UniqueConstraint(
                "streaming_account_id",
                "slot_label",
                name="uq_streaming_slots_account_label",
            ),
        )

    existing_slot_indexes = {
        index["name"] for index in inspector.get_indexes("streaming_slots")
    }
    if "streaming_slots_account_idx" not in existing_slot_indexes and inspector.has_table(
        "streaming_slots"
    ):
        op.create_index(
            "streaming_slots_account_idx",
            "streaming_slots",
            ["streaming_account_id"],
        )
    if "streaming_slots_service_idx" not in existing_slot_indexes and inspector.has_table(
        "streaming_slots"
    ):
        op.create_index(
            "streaming_slots_service_idx",
            "streaming_slots",
            ["client_service_id"],
        )


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"

    _alter_column_to_string(
        "client_services",
        "service_type",
        existing_type=OLD_CLIENT_SERVICE_ENUM,
        dialect=dialect,
    )
    _alter_column_to_string(
        "service_plans",
        "service_type",
        existing_type=OLD_SERVICE_PLAN_ENUM,
        dialect=dialect,
    )

    if dialect != "sqlite":
        OLD_CLIENT_SERVICE_ENUM.drop(bind, checkfirst=True)
        OLD_SERVICE_PLAN_ENUM.drop(bind, checkfirst=True)

    _apply_type_mapping("client_services")
    _apply_type_mapping("service_plans")

    op.execute(
        sa.text(
            "UPDATE service_plans SET requires_ip = :true_value, requires_base = :true_value WHERE service_type = :internet"
        ).bindparams(true_value=True, internet=ClientServiceType.INTERNET.value)
    )
    op.execute(
        sa.text(
            "UPDATE service_plans SET requires_ip = :false_value, requires_base = :false_value WHERE service_type = :streaming"
        ).bindparams(false_value=False, streaming=ClientServiceType.STREAMING.value)
    )

    if dialect != "sqlite":
        NEW_CLIENT_SERVICE_ENUM.create(bind, checkfirst=True)
        NEW_SERVICE_PLAN_ENUM.create(bind, checkfirst=True)

    _alter_column_to_enum(
        "service_plans",
        "service_type",
        enum_type=NEW_SERVICE_PLAN_ENUM,
        dialect=dialect,
    )
    _alter_column_to_enum(
        "client_services",
        "service_type",
        enum_type=NEW_CLIENT_SERVICE_ENUM,
        dialect=dialect,
    )

    uuid_type, uuid_default = _dialect_settings()
    _create_streaming_tables(uuid_type, uuid_default)


def downgrade() -> None:
    op.drop_index("streaming_slots_service_idx", table_name="streaming_slots")
    op.drop_index("streaming_slots_account_idx", table_name="streaming_slots")
    op.drop_table("streaming_slots")
    op.drop_index("streaming_accounts_plan_idx", table_name="streaming_accounts")
    op.drop_table("streaming_accounts")
    STREAMING_PLATFORM_ENUM.drop(op.get_bind(), checkfirst=True)

    bind = op.get_bind()
    dialect = bind.dialect.name if bind else "sqlite"

    _alter_column_to_string(
        "client_services",
        "service_type",
        existing_type=NEW_CLIENT_SERVICE_ENUM,
        dialect=dialect,
    )
    _alter_column_to_string(
        "service_plans",
        "service_type",
        existing_type=NEW_SERVICE_PLAN_ENUM,
        dialect=dialect,
    )

    if dialect != "sqlite":
        NEW_CLIENT_SERVICE_ENUM.drop(bind, checkfirst=True)
        NEW_SERVICE_PLAN_ENUM.drop(bind, checkfirst=True)

    for table in ("client_services", "service_plans"):
        for new_value, old_value in REVERSE_TYPE_MAPPING.items():
            op.execute(
                sa.text(
                    f"UPDATE {table} SET service_type = :old_value WHERE service_type = :new_value"
                ).bindparams(old_value=old_value, new_value=new_value)
            )

        params = {f"o{i}": value for i, value in enumerate(OLD_SERVICE_TYPE_VALUES)}
        placeholders = ", ".join(f":{key}" for key in params.keys())
        op.execute(
            sa.text(
                f"""
                UPDATE {table}
                SET service_type = 'other'
                WHERE service_type IS NULL
                   OR service_type NOT IN ({placeholders})
            """
            ).bindparams(**params)
        )

    if dialect != "sqlite":
        OLD_CLIENT_SERVICE_ENUM.create(bind, checkfirst=True)
        OLD_SERVICE_PLAN_ENUM.create(bind, checkfirst=True)

    _alter_column_to_enum(
        "service_plans",
        "service_type",
        enum_type=OLD_SERVICE_PLAN_ENUM,
        dialect=dialect,
    )
    _alter_column_to_enum(
        "client_services",
        "service_type",
        enum_type=OLD_CLIENT_SERVICE_ENUM,
        dialect=dialect,
    )
