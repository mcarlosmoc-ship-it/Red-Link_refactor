"""Model definitions for client service subscriptions."""

from __future__ import annotations

import enum
import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class SubscriptionStatus(str, enum.Enum):
    """Lifecycle status values aligned with the database enum."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    PENDING = "pending"


class BillingCycle(str, enum.Enum):
    """Supported billing cycles for subscriptions."""

    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    ANNUAL = "annual"


class Subscription(Base):
    """Metadata that wraps a contracted client service."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(
            "billing_anchor_day IS NULL OR (billing_anchor_day >= 1 AND billing_anchor_day <= 31)",
            name="ck_subscriptions_billing_anchor_day_range",
        ),
    )

    id = Column("subscription_id", GUID(), primary_key=True, default=uuid.uuid4)
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
    )
    service_id = Column(
        GUID(),
        ForeignKey("client_services.client_service_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    plan_id = Column(Integer, ForeignKey("service_plans.plan_id", ondelete="SET NULL"), nullable=True)
    billing_cycle = Column(
        Enum(
            BillingCycle,
            name="subscription_billing_cycle_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=BillingCycle.MONTHLY,
    )
    billing_anchor_day = Column(Integer, nullable=True)
    start_date = Column(Date, nullable=False, default=date.today)
    end_date = Column(Date, nullable=True)
    auto_renew = Column(Boolean, nullable=False, default=True, server_default="1")
    status = Column(
        Enum(
            SubscriptionStatus,
            name="subscription_status_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=SubscriptionStatus.ACTIVE,
    )
    trial_ends_at = Column(Date, nullable=True)
    cancellation_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    client = relationship("Client", back_populates="subscriptions")
    service = relationship("ClientService", back_populates="subscription")
    service_plan = relationship("ServicePlan")
    charges = relationship(
        "ServiceCharge",
        back_populates="subscription",
        cascade="all, delete-orphan",
    )
