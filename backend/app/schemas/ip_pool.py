from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models.ip_pool import IpAssignmentAction, IpPoolType, IpReservationStatus
from .common import PaginatedResponse


class BaseIpPoolBase(BaseModel):
    base_id: int = Field(..., ge=1)
    label: str = Field(..., min_length=1, max_length=120)
    cidr: str = Field(..., min_length=3, max_length=64)
    ip_type: Optional[IpPoolType] = None
    vlan: Optional[str] = Field(default=None, max_length=32)
    notes: Optional[str] = None


class BaseIpPoolCreate(BaseIpPoolBase):
    pass


class BaseIpPoolUpdate(BaseModel):
    label: Optional[str] = None
    cidr: Optional[str] = None
    ip_type: Optional[IpPoolType] = None
    vlan: Optional[str] = None
    notes: Optional[str] = None


class BaseIpPoolRead(BaseIpPoolBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BaseIpPoolListResponse(PaginatedResponse[BaseIpPoolRead]):
    pass


class BaseIpReservationBase(BaseModel):
    base_id: int = Field(..., ge=1)
    pool_id: Optional[int] = Field(default=None, ge=1)
    ip_address: str = Field(...)
    inventory_item_id: Optional[str] = Field(default=None, description="Equipo asociado")
    notes: Optional[str] = None


class BaseIpReservationCreate(BaseIpReservationBase):
    status: IpReservationStatus = IpReservationStatus.FREE


class BaseIpReservationUpdate(BaseModel):
    status: Optional[IpReservationStatus] = None
    service_id: Optional[str] = None
    client_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    notes: Optional[str] = None


class BaseIpReservationRead(BaseIpReservationBase):
    id: str
    status: IpReservationStatus
    service_id: Optional[str] = None
    client_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    assigned_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BaseIpReservationListResponse(PaginatedResponse[BaseIpReservationRead]):
    pass


class IpAssignmentHistoryClient(BaseModel):
    id: str
    full_name: str
    external_code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class IpAssignmentHistoryRead(BaseModel):
    id: str
    reservation_id: str
    action: IpAssignmentAction
    previous_status: Optional[str] = None
    new_status: str
    service_id: Optional[str] = None
    client_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    actor_id: Optional[str] = None
    actor_role: Optional[str] = None
    source: Optional[str] = None
    note: Optional[str] = None
    recorded_by: Optional[str] = None
    created_at: datetime
    client: Optional[IpAssignmentHistoryClient] = None

    model_config = ConfigDict(from_attributes=True)


class IpAssignmentHistoryListResponse(PaginatedResponse[IpAssignmentHistoryRead]):
    pass


class IpUsageBreakdown(BaseModel):
    base_id: int
    pool_id: Optional[int] = None
    pool_label: Optional[str] = None
    total: int
    free: int
    reserved: int
    in_use: int
    quarantine: int

    model_config = ConfigDict(from_attributes=True)


class IpHygieneRunResult(BaseModel):
    quarantined: list[str]
    released: list[str]
    freed: list[str]
    usage_by_pool: list[IpUsageBreakdown]
    usage_by_base: list[IpUsageBreakdown]


class IpUsageReport(BaseModel):
    usage_by_pool: list[IpUsageBreakdown]
    usage_by_base: list[IpUsageBreakdown]


class IpAssignmentInconsistency(BaseModel):
    service_id: Optional[str] = None
    reservation_id: Optional[str] = None
    service_ip: Optional[str] = None
    reservation_ip: Optional[str] = None
    reservation_status: Optional[IpReservationStatus] = None
    issue: str
    suggested_actions: list[str]


class IpAssignmentConsistencyReport(BaseModel):
    items: list[IpAssignmentInconsistency]
    total: int


class IpPoolSummaryItem(BaseModel):
    base_id: int
    total: int
    free: int
    reserved: int
    in_use: int
    quarantine: int


class IpPoolSummaryResponse(BaseModel):
    items: list[IpPoolSummaryItem]
