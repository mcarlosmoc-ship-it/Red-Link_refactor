from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models.client_service import ClientServiceType
from .common import PaginatedResponse


class ServicePlanBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    service_type: ClientServiceType
    default_monthly_fee: Decimal = Field(default=Decimal("0"), ge=0)
    description: Optional[str] = None
    is_active: bool = True
    requires_ip: bool = False
    requires_base: bool = False


class ServicePlanCreate(ServicePlanBase):
    pass


class ServicePlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    service_type: Optional[ClientServiceType] = None
    default_monthly_fee: Optional[Decimal] = Field(default=None, ge=0)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    requires_ip: Optional[bool] = None
    requires_base: Optional[bool] = None


class ServicePlanRead(ServicePlanBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ServicePlanListResponse(PaginatedResponse[ServicePlanRead]):
    pass
