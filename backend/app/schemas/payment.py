from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models.payment import PaymentMethod
from .client import ClientRead
from .common import PaginatedResponse


class PaymentBase(BaseModel):
    client_id: str = Field(..., description="Identifier of the client who paid")
    period_key: str = Field(..., description="Billing period key associated with the payment")
    paid_on: date = Field(..., description="Date when the payment was recorded")
    amount: Decimal = Field(..., gt=0, description="Amount received for the payment")
    months_paid: Decimal = Field(..., gt=0, description="Number of months covered by the payment")
    method: PaymentMethod = Field(..., description="Payment method used by the client")
    note: Optional[str] = Field(default=None, description="Optional note for the payment")


class PaymentCreate(PaymentBase):
    """Schema used when creating a payment."""

    pass


class PaymentRead(PaymentBase):
    """Schema returned when reading payment data."""

    id: str
    created_at: datetime
    client: Optional[ClientRead] = None

    model_config = ConfigDict(from_attributes=True)


class PaymentListResponse(PaginatedResponse[PaymentRead]):
    """Paginated payment listing."""

    pass
