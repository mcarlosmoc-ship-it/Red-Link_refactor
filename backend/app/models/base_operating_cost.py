"""Model for tracking base operating costs by period."""

from __future__ import annotations

import uuid

from sqlalchemy import Column, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class BaseOperatingCost(Base):
    """Aggregated operating cost per base and billing period."""

    __tablename__ = "base_operating_costs"
    __table_args__ = (UniqueConstraint("base_id", "period_key", name="base_operating_costs_unique"),)

    id = Column("cost_id", GUID(), primary_key=True, default=uuid.uuid4)
    base_id = Column(Integer, ForeignKey("zones.zone_id", ondelete="CASCADE"), nullable=False)
    period_key = Column(String, ForeignKey("billing_periods.period_key", ondelete="CASCADE"), nullable=False)
    total_cost = Column(Numeric(12, 2), nullable=False)

    base = relationship("Zone", back_populates="operating_costs")
    billing_period = relationship("BillingPeriod", back_populates="operating_costs")
