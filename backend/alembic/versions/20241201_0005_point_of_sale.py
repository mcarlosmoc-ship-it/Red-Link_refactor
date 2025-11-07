from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20241201_0005"
down_revision = "20241105_0004"
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

    if not inspector.has_table("pos_products"):
        op.create_table(
            "pos_products",
            sa.Column("product_id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column("sku", sa.String(length=64), nullable=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("category", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
            sa.Column("stock_quantity", sa.Numeric(12, 3), nullable=True),
            sa.Column(
                "is_active",
                sa.Boolean(create_constraint=False),
                nullable=False,
                server_default=sa.true(),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                server_onupdate=sa.func.now(),
                nullable=False,
            ),
            sa.CheckConstraint(
                "unit_price >= 0",
                name="ck_pos_products_unit_price_non_negative",
            ),
            sa.CheckConstraint(
                "stock_quantity IS NULL OR stock_quantity >= 0",
                name="ck_pos_products_stock_non_negative",
            ),
            sa.UniqueConstraint("sku", name="uq_pos_products_sku"),
        )
        op.create_index("pos_products_active_idx", "pos_products", ["is_active"], unique=False)
        op.create_index("pos_products_category_idx", "pos_products", ["category"], unique=False)

    if not inspector.has_table("pos_sales"):
        payment_method_check = (
            "payment_method IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro')"
        )
        op.create_table(
            "pos_sales",
            sa.Column("sale_id", uuid_type, primary_key=True, server_default=uuid_default),
            sa.Column("ticket_number", sa.String(length=32), nullable=False, unique=True),
            sa.Column(
                "sold_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "client_id",
                uuid_type,
                sa.ForeignKey("clients.client_id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("client_name", sa.String(length=200), nullable=True),
            sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
            sa.Column(
                "discount_amount",
                sa.Numeric(12, 2),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "tax_amount",
                sa.Numeric(12, 2),
                nullable=False,
                server_default="0",
            ),
            sa.Column("total", sa.Numeric(12, 2), nullable=False),
            sa.Column("payment_method", sa.String(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.CheckConstraint(
                "subtotal >= 0",
                name="ck_pos_sales_subtotal_non_negative",
            ),
            sa.CheckConstraint(
                "discount_amount >= 0",
                name="ck_pos_sales_discount_non_negative",
            ),
            sa.CheckConstraint(
                "tax_amount >= 0",
                name="ck_pos_sales_tax_non_negative",
            ),
            sa.CheckConstraint(
                "total >= 0",
                name="ck_pos_sales_total_non_negative",
            ),
            sa.CheckConstraint(payment_method_check, name="ck_pos_sales_payment_method"),
        )
        op.create_index("pos_sales_sold_at_idx", "pos_sales", ["sold_at"], unique=False)
        op.create_index(
            "pos_sales_payment_method_idx",
            "pos_sales",
            ["payment_method"],
            unique=False,
        )
        op.create_index("pos_sales_client_idx", "pos_sales", ["client_id"], unique=False)

    if not inspector.has_table("pos_sale_items"):
        op.create_table(
            "pos_sale_items",
            sa.Column("sale_item_id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "sale_id",
                uuid_type,
                sa.ForeignKey("pos_sales.sale_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "product_id",
                uuid_type,
                sa.ForeignKey("pos_products.product_id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("description", sa.String(length=255), nullable=False),
            sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
            sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
            sa.Column("total", sa.Numeric(12, 2), nullable=False),
            sa.CheckConstraint(
                "quantity > 0",
                name="ck_pos_sale_items_quantity_positive",
            ),
            sa.CheckConstraint(
                "unit_price >= 0",
                name="ck_pos_sale_items_unit_price_non_negative",
            ),
            sa.CheckConstraint(
                "total >= 0",
                name="ck_pos_sale_items_total_non_negative",
            ),
        )
        op.create_index("pos_sale_items_sale_idx", "pos_sale_items", ["sale_id"], unique=False)
        op.create_index(
            "pos_sale_items_product_idx",
            "pos_sale_items",
            ["product_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("pos_sale_items_product_idx", table_name="pos_sale_items")
    op.drop_index("pos_sale_items_sale_idx", table_name="pos_sale_items")
    op.drop_table("pos_sale_items")

    op.drop_index("pos_sales_client_idx", table_name="pos_sales")
    op.drop_index("pos_sales_payment_method_idx", table_name="pos_sales")
    op.drop_index("pos_sales_sold_at_idx", table_name="pos_sales")
    op.drop_table("pos_sales")

    op.drop_index("pos_products_category_idx", table_name="pos_products")
    op.drop_index("pos_products_active_idx", table_name="pos_products")
    op.drop_table("pos_products")
