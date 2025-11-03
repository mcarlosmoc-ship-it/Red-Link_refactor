"""SQLAlchemy model for billing periods."""

from __future__ import annotations

from sqlalchemy import Column, Date, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class BillingPeriod(Base):
    """Represents an accounting period used for payments and costs."""

    __tablename__ = "billing_periods"
    __table_args__ = (UniqueConstraint("starts_on", "ends_on", name="billing_periods_start_end_key"),)

    period_key = Column(String, primary_key=True)
    starts_on = Column(Date, nullable=False)
    ends_on = Column(Date, nullable=False)

    payments = relationship("Payment", back_populates="billing_period")
    operating_costs = relationship("BaseOperatingCost", back_populates="billing_period")
