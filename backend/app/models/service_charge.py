"""Models representing recurring service charges and allocations."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class ServiceChargeStatus(str, enum.Enum):
    """Lifecycle status for a recurring service charge."""

    PENDING = "pending"
    INVOICED = "invoiced"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    VOID = "void"


SERVICE_CHARGE_STATUS_ENUM = SAEnum(
    ServiceChargeStatus,
    name="service_charge_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class ServiceCharge(Base):
    """Represents a monthly charge tied to a client service subscription."""

    __tablename__ = "service_charges"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_service_charges_amount_non_negative"),
        UniqueConstraint(
            "subscription_id",
            "period_key",
            name="service_charges_unique_subscription_period",
        ),
    )

    id = Column("charge_id", GUID(), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(
        GUID(),
        ForeignKey("subscriptions.subscription_id", ondelete="CASCADE"),
        nullable=False,
    )
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
    )
    period_key = Column(
        String,
        ForeignKey("billing_periods.period_key", ondelete="RESTRICT"),
        nullable=False,
    )
    charge_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(SERVICE_CHARGE_STATUS_ENUM, nullable=False, default=ServiceChargeStatus.PENDING)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    subscription = relationship("Subscription", back_populates="charges")
    client = relationship("Client", back_populates="charges")
    billing_period = relationship(
        "BillingPeriod",
        back_populates="service_charges",
        primaryjoin="BillingPeriod.period_key==foreign(ServiceCharge.period_key)",
    )
    allocations = relationship(
        "ServiceChargePayment",
        back_populates="charge",
        cascade="all, delete-orphan",
    )


class ServiceChargePayment(Base):
    """Allocation of a payment toward a specific service charge."""

    __tablename__ = "service_charge_payments"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_service_charge_payments_amount_non_negative"),
        UniqueConstraint(
            "charge_id",
            "payment_id",
            name="service_charge_payments_unique_charge_payment",
        ),
    )

    id = Column("allocation_id", GUID(), primary_key=True, default=uuid.uuid4)
    charge_id = Column(
        GUID(),
        ForeignKey("service_charges.charge_id", ondelete="CASCADE"),
        nullable=False,
    )
    payment_id = Column(
        GUID(),
        ForeignKey("service_payments.payment_id", ondelete="CASCADE"),
        nullable=False,
    )
    amount = Column(Numeric(12, 2), nullable=False)
    applied_on = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    charge = relationship("ServiceCharge", back_populates="allocations")
    payment = relationship("ServicePayment", back_populates="charge_allocations")
