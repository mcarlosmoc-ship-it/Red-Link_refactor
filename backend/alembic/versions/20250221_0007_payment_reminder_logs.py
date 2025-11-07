"""Create table to track payment reminder deliveries."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20250221_0007"
down_revision = "20250220_0006"
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

    reminder_type_enum = sa.Enum(
        "upcoming",
        "overdue",
        name="payment_reminder_type_enum",
        native_enum=False,
    )
    reminder_status_enum = sa.Enum(
        "sent",
        "failed",
        name="payment_reminder_status_enum",
        native_enum=False,
    )

    reminder_type_enum.create(op.get_bind(), checkfirst=True)
    reminder_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "payment_reminder_logs",
        sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "client_account_id",
            uuid_type,
            sa.ForeignKey("client_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reminder_type", reminder_type_enum, nullable=False),
        sa.Column("delivery_status", reminder_status_enum, nullable=False),
        sa.Column("destination", sa.String(length=255), nullable=False),
        sa.Column("channel", sa.String(length=50), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("response_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_index(
        "payment_reminder_logs_client_idx",
        "payment_reminder_logs",
        ["client_account_id"],
        unique=False,
    )
    op.create_index(
        "payment_reminder_logs_created_at_idx",
        "payment_reminder_logs",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "payment_reminder_logs_type_idx",
        "payment_reminder_logs",
        ["reminder_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("payment_reminder_logs_type_idx", table_name="payment_reminder_logs")
    op.drop_index("payment_reminder_logs_created_at_idx", table_name="payment_reminder_logs")
    op.drop_index("payment_reminder_logs_client_idx", table_name="payment_reminder_logs")
    op.drop_table("payment_reminder_logs")

    reminder_type_enum = sa.Enum(
        "upcoming",
        "overdue",
        name="payment_reminder_type_enum",
        native_enum=False,
    )
    reminder_status_enum = sa.Enum(
        "sent",
        "failed",
        name="payment_reminder_status_enum",
        native_enum=False,
    )

    reminder_type_enum.drop(op.get_bind(), checkfirst=True)
    reminder_status_enum.drop(op.get_bind(), checkfirst=True)

