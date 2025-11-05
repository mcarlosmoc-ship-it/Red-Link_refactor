"""Aggregated financial metrics per billing period."""

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, Integer, Numeric, String, UniqueConstraint, func

from ..database import Base
from ..db_types import GUID


class FinancialSnapshot(Base):
    """Stores aggregated income and expense metrics for a period."""

    __tablename__ = "financial_snapshots"
    __table_args__ = (
        UniqueConstraint("period_key", name="uq_financial_snapshots_period"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    period_key = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    total_income = Column(Numeric(14, 2), nullable=False, default=0)
    total_expenses = Column(Numeric(14, 2), nullable=False, default=0)
    reseller_income = Column(Numeric(14, 2), nullable=False, default=0)
    net_earnings = Column(Numeric(14, 2), nullable=False, default=0)
    clients_active = Column(Integer, nullable=False, default=0)
    clients_delinquent = Column(Integer, nullable=False, default=0)

