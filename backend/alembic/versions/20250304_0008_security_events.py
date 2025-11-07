import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20250304_0008"
down_revision = "20250221_0007"
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

    if inspector.has_table("client_account_security_events"):
        return

    op.create_table(
        "client_account_security_events",
        sa.Column("id", uuid_type, primary_key=True, server_default=uuid_default),
        sa.Column(
            "client_account_id",
            uuid_type,
            sa.ForeignKey("client_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "action",
            sa.Enum(
                "password_created",
                "password_changed",
                "password_accessed",
                "data_accessed",
                name="client_account_security_action",
            ),
            nullable=False,
        ),
        sa.Column("performed_by", sa.String(length=255), nullable=True),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "client_account_security_events_account_idx",
        "client_account_security_events",
        ["client_account_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("client_account_security_events"):
        op.drop_index(
            "client_account_security_events_account_idx",
            table_name="client_account_security_events",
        )
        op.drop_table("client_account_security_events")
        if bind.dialect.name == "postgresql":
            op.execute("DROP TYPE IF EXISTS client_account_security_action")
