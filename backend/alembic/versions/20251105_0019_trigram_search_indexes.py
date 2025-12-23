"""Add trigram search indexes for common text queries.

Revision ID: 20251105_0019
Revises: 20251030_0018
Create Date: 2025-11-05 00:00:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "20251105_0019"
down_revision = "20251030_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_index(
        "clients_location_trgm_idx",
        "clients",
        ["location"],
        postgresql_using="gin",
        postgresql_ops={"location": "gin_trgm_ops"},
    )
    op.create_index(
        "inventory_items_brand_trgm_idx",
        "inventory_items",
        ["brand"],
        postgresql_using="gin",
        postgresql_ops={"brand": "gin_trgm_ops"},
    )
    op.create_index(
        "inventory_items_model_trgm_idx",
        "inventory_items",
        ["model"],
        postgresql_using="gin",
        postgresql_ops={"model": "gin_trgm_ops"},
    )
    op.create_index(
        "inventory_items_serial_trgm_idx",
        "inventory_items",
        ["serial_number"],
        postgresql_using="gin",
        postgresql_ops={"serial_number": "gin_trgm_ops"},
    )
    op.create_index(
        "inventory_items_asset_tag_trgm_idx",
        "inventory_items",
        ["asset_tag"],
        postgresql_using="gin",
        postgresql_ops={"asset_tag": "gin_trgm_ops"},
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.drop_index("inventory_items_asset_tag_trgm_idx", table_name="inventory_items")
    op.drop_index("inventory_items_serial_trgm_idx", table_name="inventory_items")
    op.drop_index("inventory_items_model_trgm_idx", table_name="inventory_items")
    op.drop_index("inventory_items_brand_trgm_idx", table_name="inventory_items")
    op.drop_index("clients_location_trgm_idx", table_name="clients")
