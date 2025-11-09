from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from ..models.payment import PaymentMethod
from .common import PaginatedResponse

if TYPE_CHECKING:  # pragma: no cover - only used for typing
    from .client import ClientRead
    from .service import ClientServiceRead


class ServicePaymentBase(BaseModel):
    """Shared attributes for service payment operations."""

    client_service_id: str = Field(
        ..., description="Identifier of the service receiving the payment"
    )
    paid_on: date = Field(..., description="Date when the payment was recorded")
    amount: Decimal = Field(..., gt=0, description="Amount received for the payment")
    method: PaymentMethod = Field(..., description="Payment method used by the client")
    period_key: Optional[str] = Field(
        default=None, description="Optional billing period key for aggregation"
    )
    months_paid: Optional[Decimal] = Field(
        default=None,
        gt=0,
        description="Number of months covered when applicable",
    )
    note: Optional[str] = Field(default=None, description="Optional note for the payment")
    recorded_by: Optional[str] = Field(
        default=None, description="User who captured the payment"
    )


class ServicePaymentCreate(ServicePaymentBase):
    """Schema used when creating a service payment."""

    pass


class ServicePaymentUpdate(BaseModel):
    """Schema used when updating a service payment."""

    paid_on: Optional[date] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    method: Optional[PaymentMethod] = None
    period_key: Optional[str] = None
    months_paid: Optional[Decimal] = Field(default=None, gt=0)
    note: Optional[str] = None


class ServicePaymentRead(ServicePaymentBase):
    """Schema returned when reading payment data."""

    id: str
    client_id: str
    created_at: datetime
    client: Optional["ClientRead"] = None
    service: Optional["ClientServiceRead"] = None

    model_config = ConfigDict(from_attributes=True)


class ServicePaymentListResponse(PaginatedResponse[ServicePaymentRead]):
    """Paginated payment listing."""

    pass
