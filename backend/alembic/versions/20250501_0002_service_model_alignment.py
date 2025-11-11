"""Align service catalog with capacity tracking."""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

from app.db_types import INET
from app.models.client_service import ClientServiceType

# revision identifiers, used by Alembic.
revision = "20250501_0002"
down_revision = "20250415_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


CATEGORY_ENUM = sa.Enum(
    *(member.value for member in ClientServiceType),
    name="service_plan_category_enum",
)
CAPACITY_TYPE_ENUM = sa.Enum("unlimited", "limited", name="service_plan_capacity_type_enum")
PLAN_STATUS_ENUM = sa.Enum("active", "inactive", name="service_plan_status_enum")


def upgrade() -> None:
    bind = op.get_bind()
    CATEGORY_ENUM.create(bind, checkfirst=True)
    CAPACITY_TYPE_ENUM.create(bind, checkfirst=True)
    PLAN_STATUS_ENUM.create(bind, checkfirst=True)

    inspector = sa.inspect(bind)
    service_plan_columns = {
        column["name"] for column in inspector.get_columns("service_plans")
    }
    client_service_columns = {
        column["name"] for column in inspector.get_columns("client_services")
    }

    already_migrated = (
        {"category", "monthly_price", "capacity_type", "status"}.issubset(service_plan_columns)
        and not {"service_type", "default_monthly_fee", "is_token_plan", "is_active"}.intersection(
            service_plan_columns
        )
        and {"custom_price", "ip_address"}.issubset(client_service_columns)
        and not {"service_type", "display_name", "price", "currency"}.intersection(
            client_service_columns
        )
    )

    if already_migrated:
        return

    service_plan_added_columns = False

    if "category" not in service_plan_columns:
        op.add_column("service_plans", sa.Column("category", CATEGORY_ENUM, nullable=True))
        service_plan_added_columns = True
    if "monthly_price" not in service_plan_columns:
        op.add_column(
            "service_plans",
            sa.Column("monthly_price", sa.Numeric(10, 2), nullable=True),
        )
        service_plan_added_columns = True
    if "capacity_type" not in service_plan_columns:
        op.add_column(
            "service_plans",
            sa.Column("capacity_type", CAPACITY_TYPE_ENUM, nullable=True),
        )
        service_plan_added_columns = True
    if "capacity_limit" not in service_plan_columns:
        op.add_column(
            "service_plans", sa.Column("capacity_limit", sa.Integer(), nullable=True)
        )
        service_plan_added_columns = True
    if "status" not in service_plan_columns:
        op.add_column("service_plans", sa.Column("status", PLAN_STATUS_ENUM, nullable=True))
        service_plan_added_columns = True

    existing_service_plan_checks = {
        constraint["name"]
        for constraint in inspector.get_check_constraints("service_plans")
        if constraint.get("name")
    }

    if "service_type" in service_plan_columns:
        op.execute(
            sa.text(
                """
                UPDATE service_plans
                SET category = service_type,
                    monthly_price = COALESCE(default_monthly_fee, 0),
                    status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
                """
            )
        )
    op.execute(
        sa.text(
            """
            UPDATE service_plans
            SET capacity_type = 'limited', capacity_limit = 5
            WHERE lower(name) IN ('netflix', 'spotify')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE service_plans
            SET capacity_type = COALESCE(capacity_type, 'unlimited')
            """
        )
    )

    has_legacy_service_plan_columns = any(
        legacy in service_plan_columns
        for legacy in ("service_type", "default_monthly_fee", "is_token_plan", "is_active")
    )
    missing_service_plan_checks = [
        name
        for name in (
            "ck_service_plans_capacity_limit_non_negative",
            "ck_service_plans_capacity_limit_required",
        )
        if name not in existing_service_plan_checks
    ]

    if service_plan_added_columns or has_legacy_service_plan_columns or missing_service_plan_checks:
        op.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_service_plans"))
        with op.batch_alter_table("service_plans", recreate="always") as batch_op:
            batch_op.alter_column("category", existing_type=CATEGORY_ENUM, nullable=False)
            batch_op.alter_column("monthly_price", existing_type=sa.Numeric(10, 2), nullable=False)
            batch_op.alter_column("capacity_type", existing_type=CAPACITY_TYPE_ENUM, nullable=False)
            batch_op.alter_column("status", existing_type=PLAN_STATUS_ENUM, nullable=False)
            if "service_type" in service_plan_columns:
                batch_op.drop_column("service_type")
            if "default_monthly_fee" in service_plan_columns:
                batch_op.drop_column("default_monthly_fee")
            if "is_token_plan" in service_plan_columns:
                batch_op.drop_column("is_token_plan")
            if "is_active" in service_plan_columns:
                batch_op.drop_column("is_active")
            if "ck_service_plans_capacity_limit_non_negative" not in existing_service_plan_checks:
                batch_op.create_check_constraint(
                    "ck_service_plans_capacity_limit_non_negative",
                    "capacity_limit IS NULL OR capacity_limit >= 0",
                )
            if "ck_service_plans_capacity_limit_required" not in existing_service_plan_checks:
                batch_op.create_check_constraint(
                    "ck_service_plans_capacity_limit_required",
                    "(capacity_type <> 'limited') OR (capacity_limit IS NOT NULL AND capacity_limit > 0)",
                )

    old_plan_enum = sa.Enum(
        "internet_private",
        "internet_tokens",
        "streaming_spotify",
        "streaming_netflix",
        "streaming_vix",
        "public_desk",
        "point_of_sale",
        "other",
        name="service_plan_type_enum",
    )
    old_plan_enum.drop(bind, checkfirst=True)

    client_service_added_columns = False

    if "custom_price" not in client_service_columns:
        op.add_column(
            "client_services",
            sa.Column("custom_price", sa.Numeric(12, 2), nullable=True),
        )
        client_service_added_columns = True
    if "ip_address" not in client_service_columns:
        op.add_column("client_services", sa.Column("ip_address", INET(), nullable=True))
        client_service_added_columns = True

    client_service_checks = {
        constraint["name"]
        for constraint in inspector.get_check_constraints("client_services")
        if constraint.get("name")
    }
    client_service_uniques = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("client_services")
        if constraint.get("name")
    }
    client_service_fk_name = None
    for fk in inspector.get_foreign_keys("client_services"):
        if fk.get("referred_table") == "service_plans":
            client_service_fk_name = fk.get("name")
            break

    if {"display_name", "service_plan_id"}.issubset(client_service_columns):
        op.execute(
            sa.text(
                """
                UPDATE client_services AS cs
                SET service_plan_id = sp.plan_id
                FROM service_plans AS sp
                WHERE cs.service_plan_id IS NULL
                  AND lower(cs.display_name) = lower(sp.name)
                """
            )
        )
    if {"price", "service_plan_id"}.issubset(client_service_columns):
        op.execute(
            sa.text(
                """
                UPDATE client_services AS cs
                SET custom_price = CASE
                    WHEN cs.service_plan_id IS NULL THEN cs.price
                    ELSE CASE
                        WHEN cs.price <> sp.monthly_price THEN cs.price
                        ELSE NULL
                    END
                END
                FROM service_plans AS sp
                WHERE cs.service_plan_id = sp.plan_id
                """
            )
        )

    has_legacy_client_columns = any(
        legacy in client_service_columns
        for legacy in ("service_type", "display_name", "price", "currency")
    )
    missing_client_checks = [
        name
        for name in ("ck_client_services_custom_price_non_negative",)
        if name not in client_service_checks
    ]

    if client_service_added_columns or has_legacy_client_columns or missing_client_checks:
        op.execute(sa.text("DROP TABLE IF EXISTS _alembic_tmp_client_services"))
        with op.batch_alter_table("client_services", recreate="always") as batch_op:
            batch_op.alter_column("service_plan_id", existing_type=sa.Integer(), nullable=False)
            if client_service_fk_name:
                batch_op.drop_constraint(client_service_fk_name, type_="foreignkey")
            if "uq_client_services_client_type_name" in client_service_uniques:
                batch_op.drop_constraint("uq_client_services_client_type_name", type_="unique")
            if "ck_client_services_price_non_negative" in client_service_checks:
                batch_op.drop_constraint(
                    "ck_client_services_price_non_negative", type_="check"
                )
            if "service_type" in client_service_columns:
                batch_op.drop_column("service_type")
            if "display_name" in client_service_columns:
                batch_op.drop_column("display_name")
            if "price" in client_service_columns:
                batch_op.drop_column("price")
            if "currency" in client_service_columns:
                batch_op.drop_column("currency")
            if "ck_client_services_custom_price_non_negative" not in client_service_checks:
                batch_op.create_check_constraint(
                    "ck_client_services_custom_price_non_negative",
                    "custom_price IS NULL OR custom_price >= 0",
                )
            batch_op.create_foreign_key(
                "fk_client_services_plan",
                "service_plans",
                ["service_plan_id"],
                ["plan_id"],
                ondelete="RESTRICT",
            )

    old_client_enum = sa.Enum(
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
    old_client_enum.drop(bind, checkfirst=True)

    missing = bind.execute(
        sa.text("SELECT COUNT(*) FROM client_services WHERE service_plan_id IS NULL")
    ).scalar()
    if missing:
        raise RuntimeError(
            "Existen servicios de clientes sin plan asociado después de la migración. "
            "Actualiza los datos antes de volver a ejecutar este paso."
        )


def downgrade() -> None:  # pragma: no cover - complex down migration not supported
    raise NotImplementedError("La migración no admite revertirse automáticamente.")
