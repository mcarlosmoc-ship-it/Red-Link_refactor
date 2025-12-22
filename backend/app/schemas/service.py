from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from ..models.client_service import ClientServiceStatus, ClientServiceType
from ..models.service_plan import CapacityType, ServicePlanStatus
from .common import PaginatedResponse


class ServicePlanSummary(BaseModel):
    """Minimal representation of a service plan linked to a client."""

    id: int
    name: str
    category: ClientServiceType
    monthly_price: Decimal
    requires_ip: bool
    requires_base: bool
    capacity_type: CapacityType
    capacity_limit: Optional[int] = None
    status: ServicePlanStatus

    model_config = ConfigDict(from_attributes=True)


class ClientServiceBase(BaseModel):
    """Shared fields for service creation and updates."""

    service_id: int = Field(
        ...,
        ge=1,
        validation_alias=AliasChoices("service_id", "service_plan_id"),
    )
    status: ClientServiceStatus = ClientServiceStatus.ACTIVE
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    next_billing_date: Optional[date] = None
    start_date: Optional[date] = Field(
        default=None, description="Fecha de inicio del servicio para prorrateo"
    )
    apply_prorate: bool = True
    zone_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("zone_id", "base_id"),
        serialization_alias="zone_id",
    )
    ip_address: Optional[str] = Field(
        default=None,
        description="IP principal para crear una reserva automáticamente",
    )
    ip_reservation_id: Optional[str] = Field(
        default=None, description="Reserva de IP asignada al servicio"
    )
    inventory_item_id: Optional[str] = Field(
        default=None, description="Equipo asociado a la IP principal"
    )
    antenna_ip: Optional[str] = None
    modem_ip: Optional[str] = None
    antenna_model: Optional[str] = None
    modem_model: Optional[str] = None
    custom_price: Optional[Decimal] = Field(default=None, ge=0)
    debt_amount: Optional[Decimal] = Field(default=Decimal("0"), ge=0)
    debt_months: Optional[Decimal] = Field(default=Decimal("0"), ge=0)
    debt_notes: Optional[str] = None
    notes: Optional[str] = None
    vigente_hasta_periodo: Optional[str] = Field(
        default=None, description="Último periodo cubierto en formato YYYY-MM"
    )
    abono_periodo: Optional[str] = Field(
        default=None, description="Periodo con abono parcial (YYYY-MM)"
    )
    abono_monto: Optional[Decimal] = Field(
        default=Decimal("0"), description="Monto abonado al periodo en curso"
    )
    service_metadata: Optional[dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("service_metadata", "metadata"),
        serialization_alias="metadata",
    )

    model_config = ConfigDict(populate_by_name=True)


class ClientServiceCreate(ClientServiceBase):
    """Payload required to create a new service for a client."""

    client_id: str


class ClientServiceInlineCreate(ClientServiceBase):
    """Service payload used when assigning services during client creation."""

    service_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("service_id", "service_plan_id"),
    )


class ClientServiceUpdate(BaseModel):
    """Payload to update an existing client service."""

    service_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("service_id", "service_plan_id"),
    )
    status: Optional[ClientServiceStatus] = None
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    next_billing_date: Optional[date] = None
    zone_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("zone_id", "base_id"),
        serialization_alias="zone_id",
    )
    ip_address: Optional[str] = Field(
        default=None,
        description="IP principal para crear una reserva automáticamente",
    )
    ip_reservation_id: Optional[str] = Field(
        default=None, description="Reserva de IP asignada al servicio"
    )
    inventory_item_id: Optional[str] = Field(
        default=None, description="Equipo asociado a la IP principal"
    )
    custom_price: Optional[Decimal] = Field(default=None, ge=0)
    debt_amount: Optional[Decimal] = Field(default=None, ge=0)
    debt_months: Optional[Decimal] = Field(default=None, ge=0)
    debt_notes: Optional[str] = None
    notes: Optional[str] = None
    vigente_hasta_periodo: Optional[str] = None
    abono_periodo: Optional[str] = None
    abono_monto: Optional[Decimal] = None
    service_metadata: Optional[dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("service_metadata", "metadata"),
        serialization_alias="metadata",
    )

    model_config = ConfigDict(populate_by_name=True)


class ClientServiceRead(BaseModel):
    """Representation of a client service."""

    id: str
    client_id: str
    service_id: int = Field(validation_alias=AliasChoices("service_id", "service_plan_id"))
    status: ClientServiceStatus
    billing_day: Optional[int] = None
    next_billing_date: Optional[date] = None
    zone_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("zone_id", "base_id"),
        serialization_alias="zone_id",
    )
    ip_address: Optional[str] = Field(
        default=None,
        validation_alias="primary_ip_address",
    )
    ip_reservation_id: Optional[str] = None
    antenna_ip: Optional[str] = None
    modem_ip: Optional[str] = None
    antenna_model: Optional[str] = None
    modem_model: Optional[str] = None
    custom_price: Optional[Decimal] = None
    effective_price: Optional[Decimal] = None
    debt_amount: Optional[Decimal] = None
    debt_months: Optional[Decimal] = None
    debt_notes: Optional[str] = None
    notes: Optional[str] = None
    vigente_hasta_periodo: Optional[str] = None
    abono_periodo: Optional[str] = None
    abono_monto: Optional[Decimal] = None
    service_metadata: Optional[dict[str, Any]] = Field(
        default=None,
        alias="metadata",
        validation_alias=AliasChoices("service_metadata", "metadata"),
    )
    service_plan: ServicePlanSummary
    created_at: datetime
    updated_at: datetime
    cancelled_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ClientServiceListResponse(PaginatedResponse[ClientServiceRead]):
    """Paginated listing of client services."""

    pass


class ContractedServiceSummary(BaseModel):
    """Aggregated view of a client's contracted services and debt."""

    id: str
    client_id: str
    plan_name: str
    category: ClientServiceType
    status: ClientServiceStatus
    debt_amount: Decimal
    debt_months: Decimal
    next_billing_date: Optional[date] = None
    period_key: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ClientContractsResponse(BaseModel):
    """List of contracted services with aggregated debt data."""

    items: list[ContractedServiceSummary]
    total_debt_amount: Decimal
    total_debt_months: Decimal


class ProrationPreview(BaseModel):
    """Result of simulating proration or plan adjustments."""

    client_service_id: str
    applied_plan_id: int
    effective_price: Decimal
    next_billing_date: Optional[date] = None
    added_debt_months: Decimal
    added_debt_amount: Decimal


class ServiceDebtRead(BaseModel):
    """Standalone view for service-level debt tracking."""

    debt_amount: Decimal = Field(default=Decimal("0"), ge=0)
    debt_months: Decimal = Field(default=Decimal("0"), ge=0)
    debt_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ServiceDebtUpdate(BaseModel):
    """Payload to modify outstanding debt for a service."""

    debt_amount: Optional[Decimal] = Field(default=None, ge=0)
    debt_months: Optional[Decimal] = Field(default=None, ge=0)
    debt_notes: Optional[str] = None


class ClientServiceBulkCreate(BaseModel):
    """Payload to assign the same service plan to multiple clients."""

    service_id: int = Field(
        ...,
        ge=1,
        validation_alias=AliasChoices("service_id", "service_plan_id"),
    )
    client_ids: list[str] = Field(..., min_length=1)
    status: ClientServiceStatus = ClientServiceStatus.ACTIVE
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    zone_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("zone_id", "base_id"),
        serialization_alias="zone_id",
    )
    ip_reservation_id: Optional[str] = Field(
        default=None, description="Reserva de IP asignada al servicio"
    )
    custom_price: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None
    service_metadata: Optional[dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("service_metadata", "metadata"),
        serialization_alias="metadata",
    )

    model_config = ConfigDict(populate_by_name=True)
