from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models.client_service import ClientServiceStatus, ClientServiceType
from .common import PaginatedResponse


class ClientServiceBase(BaseModel):
    """Shared fields for service creation and updates."""

    service_type: ClientServiceType
    display_name: str
    status: ClientServiceStatus = ClientServiceStatus.ACTIVE
    price: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="MXN", min_length=3, max_length=3)
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    next_billing_date: Optional[date] = None
    base_id: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class ClientServiceCreate(ClientServiceBase):
    """Payload required to create a new service for a client."""

    client_id: str


class ClientServiceUpdate(BaseModel):
    """Payload to update an existing client service."""

    display_name: Optional[str] = None
    status: Optional[ClientServiceStatus] = None
    price: Optional[Decimal] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    next_billing_date: Optional[date] = None
    base_id: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class ClientServiceRead(ClientServiceBase):
    """Representation of a client service."""

    id: str
    client_id: str
    created_at: datetime
    updated_at: datetime
    cancelled_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ClientServiceListResponse(PaginatedResponse[ClientServiceRead]):
    """Paginated listing of client services."""

    pass
