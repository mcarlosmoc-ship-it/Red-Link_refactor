"""Models for reseller voucher deliveries and settlements."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..database import Base


class DeliverySettlementStatus(str, enum.Enum):
    """Possible settlement states for reseller deliveries."""

    PENDING = "pending"
    SETTLED = "settled"
    PARTIAL = "partial"


DELIVERY_STATUS_ENUM = SAEnum(
    DeliverySettlementStatus,
    name="delivery_settlement_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class ResellerDelivery(Base):
    """Represents the delivery of voucher batches to a reseller."""

    __tablename__ = "reseller_deliveries"

    id = Column(
        "delivery_id",
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    reseller_id = Column(String(36), ForeignKey("resellers.reseller_id", ondelete="CASCADE"), nullable=False)
    delivered_on = Column(Date, nullable=False)
    settlement_status = Column(
        DELIVERY_STATUS_ENUM,
        nullable=False,
        default=DeliverySettlementStatus.PENDING,
        server_default=DeliverySettlementStatus.PENDING.value,
    )
    total_value = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    notes = Column(Text, nullable=True)
    reseller = relationship("Reseller", back_populates="deliveries")
    items = relationship(
        "ResellerDeliveryItem",
        back_populates="delivery",
        cascade="all, delete-orphan",
    )
    settlements = relationship("ResellerSettlement", back_populates="delivery")


class ResellerDeliveryItem(Base):
    """Individual voucher counts per delivery."""

    __tablename__ = "reseller_delivery_items"

    id = Column("delivery_item_id", Integer, primary_key=True, autoincrement=True)
    delivery_id = Column(String(36), ForeignKey("reseller_deliveries.delivery_id", ondelete="CASCADE"), nullable=False)
    voucher_type_id = Column(
        Integer,
        ForeignKey("voucher_types.voucher_type_id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = Column(Integer, nullable=False)

    delivery = relationship("ResellerDelivery", back_populates="items")
    voucher_type = relationship("VoucherType", back_populates="delivery_items")


class ResellerSettlement(Base):
    """Settlements recorded when a reseller reconciles a delivery."""

    __tablename__ = "reseller_settlements"

    id = Column(
        "settlement_id",
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    reseller_id = Column(String(36), ForeignKey("resellers.reseller_id", ondelete="CASCADE"), nullable=False)
    delivery_id = Column(String(36), ForeignKey("reseller_deliveries.delivery_id", ondelete="SET NULL"), nullable=True)
    settled_on = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text, nullable=True)

    reseller = relationship("Reseller", back_populates="settlements")
    delivery = relationship("ResellerDelivery", back_populates="settlements")
