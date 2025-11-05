"""Models for reseller voucher deliveries and settlements."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


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
    __table_args__ = (
        CheckConstraint("total_value >= 0", name="ck_reseller_deliveries_total_non_negative"),
    )

    id = Column("delivery_id", GUID(), primary_key=True, default=uuid.uuid4)
    reseller_id = Column(GUID(), ForeignKey("resellers.reseller_id", ondelete="CASCADE"), nullable=False)
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
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_reseller_delivery_items_quantity"),
    )

    id = Column("delivery_item_id", Integer, primary_key=True, autoincrement=True)
    delivery_id = Column(GUID(), ForeignKey("reseller_deliveries.delivery_id", ondelete="CASCADE"), nullable=False)
    voucher_type_id = Column(
        Integer,
        ForeignKey("voucher_types.voucher_type_id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = Column(Integer, nullable=False)

    delivery = relationship("ResellerDelivery", back_populates="items")
    voucher_type = relationship("VoucherType", back_populates="delivery_items")
    vouchers = relationship(
        "Voucher",
        back_populates="delivery_item",
        cascade="all, delete-orphan",
    )


class ResellerSettlementStatus(str, enum.Enum):
    """Lifecycle states for reseller settlements."""

    PENDING = "pending"
    APPLIED = "applied"
    VOID = "void"


SETTLEMENT_STATUS_ENUM = SAEnum(
    ResellerSettlementStatus,
    name="reseller_settlement_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class ResellerSettlement(Base):
    """Settlements recorded when a reseller reconciles a delivery."""

    __tablename__ = "reseller_settlements"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_reseller_settlements_amount_non_negative"),
    )

    id = Column("settlement_id", GUID(), primary_key=True, default=uuid.uuid4)
    reseller_id = Column(GUID(), ForeignKey("resellers.reseller_id", ondelete="CASCADE"), nullable=False)
    delivery_id = Column(GUID(), ForeignKey("reseller_deliveries.delivery_id", ondelete="SET NULL"), nullable=True)
    settled_on = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(
        SETTLEMENT_STATUS_ENUM,
        nullable=False,
        default=ResellerSettlementStatus.PENDING,
        server_default=ResellerSettlementStatus.PENDING.value,
    )

    reseller = relationship("Reseller", back_populates="settlements")
    delivery = relationship("ResellerDelivery", back_populates="settlements")


Index(
    "reseller_deliveries_reseller_status_idx",
    ResellerDelivery.reseller_id,
    ResellerDelivery.settlement_status,
)
Index(
    "reseller_deliveries_reseller_date_idx",
    ResellerDelivery.reseller_id,
    ResellerDelivery.delivered_on,
)
Index("reseller_settlements_reseller_idx", ResellerSettlement.reseller_id)
Index(
    "reseller_settlements_reseller_date_idx",
    ResellerSettlement.reseller_id,
    ResellerSettlement.settled_on,
)
