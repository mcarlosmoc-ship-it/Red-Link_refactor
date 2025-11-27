"""Pydantic schemas for the client resources."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from ..models.client import ClientType, ServiceStatus
from .common import PaginatedResponse
from .payment import ServicePaymentRead
from .service import ClientServiceInlineCreate, ClientServiceRead


class ZoneSummary(BaseModel):
    """Minimal representation of a coverage zone linked to a client."""

    id: int
    name: str
    code: str
    location: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ClientBase(BaseModel):
    """Attributes shared by create and update operations."""

    external_code: Optional[str] = None
    client_type: ClientType
    full_name: str
    location: str
    zone_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("zone_id", "base_id"),
    )
    monthly_fee: Optional[Decimal] = Field(default=None, ge=0)
    paid_months_ahead: Decimal = Field(default=Decimal("0"), ge=0)
    debt_months: Decimal = Field(default=Decimal("0"), ge=0)
    service_status: ServiceStatus = ServiceStatus.ACTIVE


class ClientCreate(ClientBase):
    """Schema used when creating a client."""

    services: list[ClientServiceInlineCreate] = Field(default_factory=list)


class ClientUpdate(BaseModel):
    """Schema used when updating an existing client."""

    external_code: Optional[str] = None
    client_type: Optional[ClientType] = None
    full_name: Optional[str] = None
    location: Optional[str] = None
    zone_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("zone_id", "base_id"),
    )
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
    zone: Optional[ZoneSummary] = None

    model_config = ConfigDict(from_attributes=True)


class ClientListResponse(PaginatedResponse[ClientRead]):
    """Paginated client listing."""

    pass


class ClientImportError(BaseModel):
    """Represents a validation or persistence error for a row in an import file."""

    row_number: int = Field(..., ge=1)
    message: str
    field_errors: dict[str, str] = Field(default_factory=dict)


class ClientImportRowSummary(BaseModel):
    """Row-level feedback about the import process."""

    row_number: int = Field(..., ge=1)
    client_name: Optional[str] = None
    services_created: int = Field(default=0, ge=0)
    status: str = Field(pattern="^(created|error)$")
    error_message: Optional[str] = None


class ClientImportRequest(BaseModel):
    """Request payload expected when importing clients in bulk."""

    filename: Optional[str] = None
    content: str = Field(..., min_length=1)


class ClientImportSummary(BaseModel):
    """Summary returned after processing a bulk import."""

    total_rows: int = Field(..., ge=0)
    created_count: int = Field(..., ge=0)
    service_created_count: int = Field(..., ge=0)
    failed_count: int = Field(..., ge=0)
    row_summaries: list[ClientImportRowSummary] = Field(default_factory=list)
    errors: list[ClientImportError] = Field(default_factory=list)
