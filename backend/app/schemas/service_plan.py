from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from ..models.client_service import ClientServiceType
from ..models.service_plan import CapacityType, ServicePlanStatus
from .common import PaginatedResponse


class ServicePlanBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    category: ClientServiceType
    monthly_price: Decimal = Field(default=Decimal("0"), ge=0)
    description: Optional[str] = None
    requires_ip: bool = False
    requires_base: bool = False
    capacity_type: CapacityType = CapacityType.UNLIMITED
    capacity_limit: Optional[int] = Field(default=None, ge=1)
    status: ServicePlanStatus = ServicePlanStatus.ACTIVE

    @field_validator("capacity_limit")
    @classmethod
    def _validate_capacity_limit(
        cls, value: Optional[int], info: ValidationInfo
    ) -> Optional[int]:
        capacity_type: CapacityType = info.data.get("capacity_type")  # type: ignore[assignment]
        if capacity_type == CapacityType.LIMITED and value is None:
            raise ValueError("Los planes con cupo limitado requieren un límite definido.")
        if capacity_type == CapacityType.UNLIMITED:
            return None
        return value


class ServicePlanCreate(ServicePlanBase):
    pass


class ServicePlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[ClientServiceType] = None
    monthly_price: Optional[Decimal] = Field(default=None, ge=0)
    description: Optional[str] = None
    requires_ip: Optional[bool] = None
    requires_base: Optional[bool] = None
    capacity_type: Optional[CapacityType] = None
    capacity_limit: Optional[int] = Field(default=None, ge=1)
    status: Optional[ServicePlanStatus] = None


class ServicePlanRead(ServicePlanBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ServicePlanListResponse(PaginatedResponse[ServicePlanRead]):
    pass
