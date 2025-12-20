"""SQLAlchemy model for billing periods."""

from __future__ import annotations

from sqlalchemy import CheckConstraint, Column, Date, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class BillingPeriod(Base):
    """Represents an accounting period used for payments and costs."""

    __tablename__ = "billing_periods"
    __table_args__ = (
        UniqueConstraint("starts_on", "ends_on", name="billing_periods_start_end_key"),
        CheckConstraint("ends_on >= starts_on", name="ck_billing_periods_valid_range"),
    )

    period_key = Column(String, primary_key=True)
    starts_on = Column(Date, nullable=False)
    ends_on = Column(Date, nullable=False)

    payments = relationship("ServicePayment", back_populates="billing_period")
    service_charges = relationship(
        "ServiceCharge",
        back_populates="billing_period",
    )
    operating_costs = relationship("BaseOperatingCost", back_populates="billing_period")
    ledger_entries = relationship("ClientLedgerEntry", back_populates="billing_period")
