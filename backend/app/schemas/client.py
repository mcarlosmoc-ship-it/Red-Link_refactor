"""Pydantic schemas for the client resources."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models.client import ClientType, ServiceStatus
from .common import PaginatedResponse
from .payment import ServicePaymentRead
from .service import ClientServiceRead


class ClientBase(BaseModel):
    """Attributes shared by create and update operations."""

    external_code: Optional[str] = None
    client_type: ClientType
    full_name: str
    location: str
    base_id: int
    ip_address: Optional[str] = None
    antenna_ip: Optional[str] = None
    modem_ip: Optional[str] = None
    antenna_model: Optional[str] = None
    modem_model: Optional[str] = None
    monthly_fee: Decimal = Field(default=Decimal("0"), ge=0)
    paid_months_ahead: Decimal = Field(default=Decimal("0"), ge=0)
    debt_months: Decimal = Field(default=Decimal("0"), ge=0)
    service_status: ServiceStatus = ServiceStatus.ACTIVE


class ClientCreate(ClientBase):
    """Schema used when creating a client."""

    pass


class ClientUpdate(BaseModel):
    """Schema used when updating an existing client."""

    external_code: Optional[str] = None
    client_type: Optional[ClientType] = None
    full_name: Optional[str] = None
    location: Optional[str] = None
    base_id: Optional[int] = None
    ip_address: Optional[str] = None
    antenna_ip: Optional[str] = None
    modem_ip: Optional[str] = None
    antenna_model: Optional[str] = None
    modem_model: Optional[str] = None
    monthly_fee: Optional[Decimal] = Field(default=None, ge=0)
    paid_months_ahead: Optional[Decimal] = Field(default=None, ge=0)
    debt_months: Optional[Decimal] = Field(default=None, ge=0)
    service_status: Optional[ServiceStatus] = None


class ClientRead(ClientBase):
    """Schema used when returning client data."""

    id: str
    created_at: datetime
    updated_at: datetime
    services: list[ClientServiceRead] = Field(default_factory=list)
    recent_payments: list[ServicePaymentRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ClientListResponse(PaginatedResponse[ClientRead]):
    """Paginated client listing."""

    pass


class ClientImportError(BaseModel):
    """Represents a validation or persistence error for a row in an import file."""

    row_number: int = Field(..., ge=1)
    message: str
    field_errors: dict[str, str] = Field(default_factory=dict)


class ClientImportRequest(BaseModel):
    """Request payload expected when importing clients in bulk."""

    filename: Optional[str] = None
    content: str = Field(..., min_length=1)


class ClientImportSummary(BaseModel):
    """Summary returned after processing a bulk import."""

    total_rows: int = Field(..., ge=0)
    created_count: int = Field(..., ge=0)
    failed_count: int = Field(..., ge=0)
    errors: list[ClientImportError] = Field(default_factory=list)
