from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..models.payment import PaymentMethod
from .common import PaginatedResponse

if TYPE_CHECKING:  # pragma: no cover - only used for typing
    from .client import ClientRead
    from .service import ClientServiceRead


class PaymentMethodBreakdown(BaseModel):
    """Represents one payment method inside a transaction."""

    method: PaymentMethod = Field(..., description="Payment method used")
    amount: Decimal = Field(..., gt=0, description="Amount paid with this method")


class ServicePaymentBase(BaseModel):
    """Shared attributes for service payment operations."""

    client_service_id: str = Field(
        ..., description="Identifier of the service receiving the payment"
    )
    paid_on: date = Field(..., description="Date when the payment was recorded")
    amount: Decimal = Field(..., gt=0, description="Amount received for the payment")
    method: Optional[PaymentMethod] = Field(
        default=None, description="Payment method used by the client"
    )
    methods: Optional[list[PaymentMethodBreakdown]] = Field(
        default=None, description="Breakdown by payment method for a mixed transaction"
    )
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

    @model_validator(mode="after")
    def validate_methods(self):
        if self.method is None and not self.methods:
            raise ValueError("Debes especificar un método de pago o un desglose de métodos.")

        if self.methods:
            total = sum((entry.amount for entry in self.methods), Decimal("0"))
            if total <= 0:
                raise ValueError("El desglose de métodos debe sumar un monto válido.")
            if self.amount and total != self.amount:
                raise ValueError("La suma de los métodos debe coincidir con el monto total.")
            if self.method is None and len(self.methods) == 1:
                self.method = self.methods[0].method

        return self


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


class PeriodPaymentStatus(str, Enum):
    """Current payment state for a billing period."""

    PENDING = "pendiente"
    PAID = "pagado"
    OVERDUE = "vencido"


class ServicePeriodStatus(BaseModel):
    """Represents the billing status for a client service in a period."""

    client_id: str
    client_service_id: str
    period_key: str
    period_start: date
    period_end: date
    status: PeriodPaymentStatus


class ServicePeriodStatusListResponse(BaseModel):
    """List of billing statuses for current periods."""

    items: list[ServicePeriodStatus]
    total: int


class OverduePeriod(BaseModel):
    """Details of an overdue billing period including adjustments."""

    client_service_id: str
    period_key: str
    period_start: date
    period_end: date
    late_fee_applied: Decimal = Field(default=Decimal("0"), ge=0)
    discount_applied: Decimal = Field(default=Decimal("0"), ge=0)
    amount_due: Decimal = Field(default=Decimal("0"), ge=0)
    total_due: Decimal = Field(default=Decimal("0"), ge=0)
    applied_by: Optional[str] = Field(
        default=None, description="Usuario que aplicó recargos o descuentos"
    )
    applied_role: Optional[str] = Field(
        default=None, description="Rol asociado a los ajustes"
    )


class OverduePeriodListResponse(BaseModel):
    """Overdue period list with calculated charges."""

    items: list[OverduePeriod]


class PaymentDuplicateCheck(BaseModel):
    """Indicates if a period already has a payment for the service."""

    client_service_id: str
    period_key: str
    exists: bool
