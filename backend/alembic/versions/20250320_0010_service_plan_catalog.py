"""Add service plan type and client service link."""

from __future__ import annotations

from decimal import Decimal

import sqlalchemy as sa
from alembic import op

from backend.app.models.client_service import ClientServiceType

revision = "20250320_0010"
down_revision = "20250315_0009"
branch_labels = None
depends_on = None


SERVICE_PLAN_TYPE_ENUM = sa.Enum(
    *(member.value for member in ClientServiceType),
    name="service_plan_type_enum",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect_name = bind.dialect.name

    if "service_plans" in inspector.get_table_names():
        if not any(col["name"] == "service_type" for col in inspector.get_columns("service_plans")):
            op.add_column(
                "service_plans",
                sa.Column(
                    "service_type",
                    SERVICE_PLAN_TYPE_ENUM,
                    nullable=False,
                    server_default=ClientServiceType.INTERNET_PRIVATE.value,
                ),
            )
            op.execute(
                sa.text(
                    "UPDATE service_plans SET service_type = :default_type WHERE service_type IS NULL"
                ).bindparams(default_type=ClientServiceType.INTERNET_PRIVATE.value)
            )
            if dialect_name != "sqlite":
                op.alter_column(
                    "service_plans",
                    "service_type",
                    nullable=False,
                    server_default=None,
                )

    if "client_services" in inspector.get_table_names():
        has_service_plan_id = any(
            col["name"] == "service_plan_id"
            for col in inspector.get_columns("client_services")
        )
        if not has_service_plan_id:
            if dialect_name == "sqlite":
                with op.batch_alter_table(
                    "client_services", recreate="always"
                ) as batch_op:
                    batch_op.add_column(
                        sa.Column("service_plan_id", sa.Integer(), nullable=True)
                    )
                    batch_op.create_index(
                        "client_services_plan_idx",
                        ["service_plan_id"],
                    )
                    batch_op.create_foreign_key(
                        "client_services_service_plan_id_fkey",
                        "service_plans",
                        ["service_plan_id"],
                        ["plan_id"],
                        ondelete="SET NULL",
                    )
            else:
                op.add_column(
                    "client_services",
                    sa.Column("service_plan_id", sa.Integer(), nullable=True),
                )
                op.create_index(
                    "client_services_plan_idx",
                    "client_services",
                    ["service_plan_id"],
                    unique=False,
                )
                op.create_foreign_key(
                    "client_services_service_plan_id_fkey",
                    "client_services",
                    "service_plans",
                    ["service_plan_id"],
                    ["plan_id"],
                    ondelete="SET NULL",
                )

    service_plans_table = sa.table(
        "service_plans",
        sa.column("plan_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("service_type", SERVICE_PLAN_TYPE_ENUM),
        sa.column("description", sa.Text),
        sa.column("default_monthly_fee", sa.Numeric(10, 2)),
        sa.column("is_token_plan", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )

    existing_default = bind.execute(
        sa.select(service_plans_table.c.plan_id).where(service_plans_table.c.name == "Internet mensual")
    ).first()

    if existing_default is None:
        bind.execute(
            sa.insert(service_plans_table).values(
                name="Internet mensual",
                service_type=ClientServiceType.INTERNET_PRIVATE.value,
                description="Plan base de internet residencial",
                default_monthly_fee=Decimal("300"),
                is_token_plan=False,
                is_active=True,
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect_name = bind.dialect.name

    if "client_services" in inspector.get_table_names():
        has_service_plan_id = any(
            col["name"] == "service_plan_id"
            for col in inspector.get_columns("client_services")
        )
        if has_service_plan_id:
            if dialect_name == "sqlite":
                with op.batch_alter_table(
                    "client_services", recreate="always"
                ) as batch_op:
                    batch_op.drop_constraint(
                        "client_services_service_plan_id_fkey", type_="foreignkey"
                    )
                    batch_op.drop_index("client_services_plan_idx")
                    batch_op.drop_column("service_plan_id")
            else:
                op.drop_constraint(
                    "client_services_service_plan_id_fkey",
                    "client_services",
                    type_="foreignkey",
                )
                op.drop_index(
                    "client_services_plan_idx", table_name="client_services"
                )
                op.drop_column("client_services", "service_plan_id")

    if "service_plans" in inspector.get_table_names():
        if any(col["name"] == "service_type" for col in inspector.get_columns("service_plans")):
            op.drop_column("service_plans", "service_type")

    SERVICE_PLAN_TYPE_ENUM.drop(bind, checkfirst=True)
