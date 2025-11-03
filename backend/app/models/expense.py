"""SQLAlchemy model definitions for operating expenses."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)

from ..database import Base


class Expense(Base):
    """Represents an operating expense associated with a base station."""

    __tablename__ = "expenses"

    id = Column(
        "expense_id",
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    base_id = Column(
        Integer,
        ForeignKey("base_stations.base_id", onupdate="CASCADE"),
        nullable=False,
    )
    expense_date = Column(Date, nullable=False)
    category = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


Index("expenses_base_date_idx", Expense.base_id, Expense.expense_date.desc())
