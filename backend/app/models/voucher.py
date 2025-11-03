"""Models describing voucher catalog and pricing."""

from __future__ import annotations

from sqlalchemy import Column, Date, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class VoucherType(Base):
    """Represents a type of voucher sold to end users."""

    __tablename__ = "voucher_types"

    id = Column("voucher_type_id", Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=False)

    prices = relationship("VoucherPrice", back_populates="voucher_type", cascade="all, delete-orphan")
    delivery_items = relationship("ResellerDeliveryItem", back_populates="voucher_type")


class VoucherPrice(Base):
    """Historical pricing for voucher types."""

    __tablename__ = "voucher_prices"
    __table_args__ = (UniqueConstraint("voucher_type_id", "effective_from", name="voucher_prices_unique"),)

    id = Column("voucher_price_id", Integer, primary_key=True, autoincrement=True)
    voucher_type_id = Column(Integer, ForeignKey("voucher_types.voucher_type_id", ondelete="CASCADE"), nullable=False)
    effective_from = Column(Date, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)

    voucher_type = relationship("VoucherType", back_populates="prices")
