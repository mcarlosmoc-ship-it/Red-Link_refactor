"""Merge ledger hardening and stage2 transition guards heads."""

from __future__ import annotations

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

# revision identifiers, used by Alembic.
revision = "20251120_0022_merge_ledger_and_transition_guards"
down_revision = (
    "20251120_0021_ledger_hardening",
    "20251120_0021_stage2_transition_guards",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
