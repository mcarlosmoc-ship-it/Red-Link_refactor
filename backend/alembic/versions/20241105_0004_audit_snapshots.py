"""Add audit tables and financial snapshots."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import NoSuchTableError


revision = "20241105_0004"
down_revision = "20240418_0003"
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
    json_type = sa.JSON()

    if dialect == "postgresql":
        uuid_type = postgresql.UUID(as_uuid=True)
        uuid_default = sa.text("gen_random_uuid()")
        json_type = postgresql.JSONB(astext_type=sa.Text())

    return uuid_type, uuid_default, json_type


def upgrade() -> None:
    uuid_type, uuid_default, json_type = _dialect_settings()

    payment_action_enum = sa.Enum(
        "created",
        "updated",
        "deleted",
        name="payment_audit_action_enum",
    )
    payment_action_enum.create(op.get_bind(), checkfirst=True)

    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("client_change_log"):
        op.create_table(
            "client_change_log",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column(
                "client_id",
                uuid_type,
                sa.ForeignKey("clients.client_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("field_name", sa.String(), nullable=False),
            sa.Column("old_value", sa.Text(), nullable=True),
            sa.Column("new_value", sa.Text(), nullable=True),
            sa.Column("change_source", sa.String(), nullable=True),
            sa.Column(
                "changed_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )
        op.create_index(
            "client_change_log_client_id_idx",
            "client_change_log",
            ["client_id"],
        )

    if not inspector.has_table("payment_audit_log"):
        op.create_table(
            "payment_audit_log",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column(
                "payment_id",
                uuid_type,
                sa.ForeignKey("payments.payment_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("action", payment_action_enum, nullable=False),
            sa.Column(
                "performed_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("performed_by", sa.String(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("snapshot", json_type, nullable=True),
        )
        op.create_index(
            "payment_audit_log_payment_id_idx",
            "payment_audit_log",
            ["payment_id"],
        )

    if not inspector.has_table("financial_snapshots"):
        op.create_table(
            "financial_snapshots",
            sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column("period_key", sa.String(), nullable=False),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "total_income",
                sa.Numeric(14, 2),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "total_expenses",
                sa.Numeric(14, 2),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "reseller_income",
                sa.Numeric(14, 2),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "net_earnings",
                sa.Numeric(14, 2),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "clients_active",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "clients_delinquent",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.UniqueConstraint("period_key", name="uq_financial_snapshots_period"),
        )

    try:
        existing_constraints = {
            constraint["name"]
            for constraint in inspector.get_unique_constraints("financial_snapshots")
        }
    except NoSuchTableError:
        existing_constraints = set()

    if (
        "uq_financial_snapshots_period" not in existing_constraints
        and bind.dialect.name != "sqlite"
    ):
        op.create_unique_constraint(
            "uq_financial_snapshots_period", "financial_snapshots", ["period_key"]
        )


def downgrade() -> None:
    op.drop_constraint("uq_financial_snapshots_period", "financial_snapshots", type_="unique")
    op.drop_table("financial_snapshots")
    op.drop_index("payment_audit_log_payment_id_idx", table_name="payment_audit_log")
    op.drop_table("payment_audit_log")
    op.drop_index("client_change_log_client_id_idx", table_name="client_change_log")
    op.drop_table("client_change_log")
    payment_action_enum = sa.Enum(
        "created",
        "updated",
        "deleted",
        name="payment_audit_action_enum",
    )
    payment_action_enum.drop(op.get_bind(), checkfirst=True)
