from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExpenseBase(BaseModel):
    base_id: int = Field(..., description="Identifier of the base station the expense belongs to")
    expense_date: date = Field(..., description="Date when the expense occurred")
    category: str = Field(..., description="Category of the expense")
    description: str = Field(..., description="Detailed description of the expense")
    amount: Decimal = Field(..., ge=0, description="Monetary value of the expense")


class ExpenseCreate(ExpenseBase):
    """Schema used to create new expenses."""

    pass


class ExpenseRead(ExpenseBase):
    """Schema representing stored expenses."""

    id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
