"""SQLAlchemy model definitions for operating expenses."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
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

from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class ExpenseCategory(Base):
    """Catalog of available expense categories for consistent reporting."""

    __tablename__ = "expense_categories"

    id = Column("expense_category_id", Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    expenses = relationship("Expense", back_populates="category_ref")


class Expense(Base):
    """Represents an operating expense associated with a base station."""

    __tablename__ = "expenses"

    id = Column("expense_id", GUID(), primary_key=True, default=uuid.uuid4)
    base_id = Column(
        Integer,
        ForeignKey("base_stations.base_id", onupdate="CASCADE"),
        nullable=False,
    )
    expense_date = Column(Date, nullable=False)
    category = Column(String, nullable=False)
    category_id = Column(
        Integer,
        ForeignKey("expense_categories.expense_category_id", ondelete="SET NULL"),
        nullable=True,
    )
    description = Column(Text, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    invoice_number = Column(String(100), nullable=True)
    attachment_url = Column(String, nullable=True)
    created_by = Column(String(100), nullable=True)

    base = relationship("BaseStation", back_populates="expenses")
    category_ref = relationship("ExpenseCategory", back_populates="expenses")


Index("expenses_base_date_idx", Expense.base_id, Expense.expense_date)
Index("expenses_category_idx", Expense.category_id)
