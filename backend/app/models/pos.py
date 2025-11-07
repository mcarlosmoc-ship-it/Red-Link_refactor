"""Models representing point of sale catalog and transactions."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID
from .payment import PAYMENT_METHOD_ENUM


class PosProduct(Base):
    """Represents a sellable item in the retail catalog."""

    __tablename__ = "pos_products"
    __table_args__ = (
        CheckConstraint("unit_price >= 0", name="ck_pos_products_unit_price_non_negative"),
        CheckConstraint(
            "stock_quantity IS NULL OR stock_quantity >= 0",
            name="ck_pos_products_stock_non_negative",
        ),
        UniqueConstraint(
            "sku",
            name="uq_pos_products_sku",
        ),
    )

    id = Column("product_id", GUID(), primary_key=True, default=uuid.uuid4)
    sku = Column(String(64), nullable=True)
    name = Column(String(200), nullable=False)
    category = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    unit_price = Column(Numeric(12, 2), nullable=False)
    stock_quantity = Column(Numeric(12, 3), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    sale_items = relationship(
        "PosSaleItem",
        back_populates="product",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


Index("pos_products_active_idx", PosProduct.is_active)
Index("pos_products_category_idx", PosProduct.category)


class PosSale(Base):
    """Represents a point of sale transaction."""

    __tablename__ = "pos_sales"
    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="ck_pos_sales_subtotal_non_negative"),
        CheckConstraint(
            "discount_amount >= 0",
            name="ck_pos_sales_discount_non_negative",
        ),
        CheckConstraint("tax_amount >= 0", name="ck_pos_sales_tax_non_negative"),
        CheckConstraint("total >= 0", name="ck_pos_sales_total_non_negative"),
    )

    id = Column("sale_id", GUID(), primary_key=True, default=uuid.uuid4)
    ticket_number = Column(String(32), nullable=False, unique=True)
    sold_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="SET NULL"),
        nullable=True,
    )
    client_name = Column(String(200), nullable=True)
    subtotal = Column(Numeric(12, 2), nullable=False)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    total = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(PAYMENT_METHOD_ENUM, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client")
    items = relationship(
        "PosSaleItem",
        back_populates="sale",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


Index("pos_sales_sold_at_idx", PosSale.sold_at)
Index("pos_sales_payment_method_idx", PosSale.payment_method)
Index("pos_sales_client_idx", PosSale.client_id)


class PosSaleItem(Base):
    """Line items that compose a POS sale."""

    __tablename__ = "pos_sale_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_pos_sale_items_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_pos_sale_items_unit_price_non_negative"),
        CheckConstraint("total >= 0", name="ck_pos_sale_items_total_non_negative"),
    )

    id = Column("sale_item_id", Integer, primary_key=True, autoincrement=True)
    sale_id = Column(
        GUID(),
        ForeignKey("pos_sales.sale_id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id = Column(
        GUID(),
        ForeignKey("pos_products.product_id", ondelete="SET NULL"),
        nullable=True,
    )
    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(12, 3), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total = Column(Numeric(12, 2), nullable=False)

    sale = relationship("PosSale", back_populates="items")
    product = relationship("PosProduct", back_populates="sale_items")


Index("pos_sale_items_sale_idx", PosSaleItem.sale_id)
Index("pos_sale_items_product_idx", PosSaleItem.product_id)
