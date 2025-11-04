"""Models describing voucher catalog and pricing."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
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
    vouchers = relationship("Voucher", back_populates="voucher_type")


class VoucherPrice(Base):
    """Historical pricing for voucher types."""

    __tablename__ = "voucher_prices"
    __table_args__ = (UniqueConstraint("voucher_type_id", "effective_from", name="voucher_prices_unique"),)

    id = Column("voucher_price_id", Integer, primary_key=True, autoincrement=True)
    voucher_type_id = Column(Integer, ForeignKey("voucher_types.voucher_type_id", ondelete="CASCADE"), nullable=False)
    effective_from = Column(Date, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)

    voucher_type = relationship("VoucherType", back_populates="prices")


class VoucherStatus(str, enum.Enum):
    """Possible lifecycle stages for a voucher."""

    AVAILABLE = "available"
    ASSIGNED = "assigned"
    ACTIVATED = "activated"
    EXPIRED = "expired"
    VOID = "void"


VOUCHER_STATUS_ENUM = SAEnum(
    VoucherStatus,
    name="voucher_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class Voucher(Base):
    """Tracks individual voucher codes for auditing and activation."""

    __tablename__ = "vouchers"

    id = Column("voucher_id", String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    voucher_code = Column(String(64), nullable=False, unique=True)
    voucher_type_id = Column(
        Integer,
        ForeignKey("voucher_types.voucher_type_id", ondelete="RESTRICT"),
        nullable=False,
    )
    delivery_item_id = Column(
        Integer,
        ForeignKey("reseller_delivery_items.delivery_item_id", ondelete="SET NULL"),
        nullable=True,
    )
    activated_by_client_id = Column(
        String(36),
        ForeignKey("clients.client_id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(VOUCHER_STATUS_ENUM, nullable=False, default=VoucherStatus.AVAILABLE)
    delivered_on = Column(DateTime(timezone=True), nullable=True)
    activated_on = Column(DateTime(timezone=True), nullable=True)
    voided_on = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes = Column(Text, nullable=True)

    voucher_type = relationship("VoucherType", back_populates="vouchers")
    delivery_item = relationship("ResellerDeliveryItem", back_populates="vouchers")
    activated_by_client = relationship("Client")
