"""Schemas for principal and client account management."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from .common import PaginatedResponse
from ..models.client_account import ClientAccountStatus
from ..models.client_service import ClientServiceType
from ..models.payment import PaymentMethod


class PrincipalAccountBase(BaseModel):
    """Shared fields for principal account operations."""

    email_principal: str = Field(..., min_length=3)
    nota: Optional[str] = None
    max_slots: int = Field(default=5, ge=1, le=20)


class PrincipalAccountCreate(PrincipalAccountBase):
    """Payload for creating a principal account."""

    pass


class PrincipalAccountUpdate(BaseModel):
    """Payload for updating a principal account."""

    email_principal: Optional[str] = Field(default=None, min_length=3)
    nota: Optional[str] = None
    max_slots: Optional[int] = Field(default=None, ge=1, le=20)


class PrincipalAccountRead(PrincipalAccountBase):
    """Representation of a principal account returned by the API."""

    id: UUID
    fecha_alta: datetime

    model_config = ConfigDict(from_attributes=True)


class PrincipalAccountListResponse(PaginatedResponse[PrincipalAccountRead]):
    """Paginated principal account listing."""

    pass


class ClientAccountBase(BaseModel):
    """Shared fields for client account operations."""

    principal_account_id: UUID
    client_id: Optional[str] = None
    client_service_id: Optional[str] = None
    service_type: Optional[ClientServiceType] = None
    service_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("service_id", "service_plan_id"),
    )
    correo_cliente: str = Field(..., min_length=3)
    contrasena_cliente: str = Field(..., min_length=1)
    perfil: str = Field(..., min_length=1)
    nombre_cliente: str = Field(..., min_length=1)
    estatus: ClientAccountStatus = Field(...)
    fecha_registro: Optional[datetime] = None
    fecha_proximo_pago: Optional[date] = None


class ClientAccountCreate(ClientAccountBase):
    """Payload for creating a client account."""

    pass


class ClientAccountUpdate(BaseModel):
    """Payload for updating a client account."""

    principal_account_id: Optional[UUID] = None
    client_id: Optional[str] = None
    client_service_id: Optional[str] = None
    service_type: Optional[ClientServiceType] = None
    service_id: Optional[int] = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("service_id", "service_plan_id"),
    )
    correo_cliente: Optional[str] = Field(default=None, min_length=3)
    contrasena_cliente: Optional[str] = Field(default=None, min_length=1)
    perfil: Optional[str] = Field(default=None, min_length=1)
    nombre_cliente: Optional[str] = Field(default=None, min_length=1)
    estatus: Optional[ClientAccountStatus] = Field(default=None)
    fecha_registro: Optional[datetime] = None
    fecha_proximo_pago: Optional[date] = None


class ClientAccountRead(ClientAccountBase):
    """Representation of a client account returned by the API."""

    id: UUID

    model_config = ConfigDict(from_attributes=True)


class ClientAccountListResponse(PaginatedResponse[ClientAccountRead]):
    """Paginated client account listing."""

    pass


class ClientAccountPaymentBase(BaseModel):
    """Fields shared by payment operations."""

    monto: Decimal = Field(..., ge=0)
    fecha_pago: date
    periodo_correspondiente: Optional[str] = None
    metodo_pago: PaymentMethod = Field(...)
    notas: Optional[str] = None


class ClientAccountPaymentCreate(ClientAccountPaymentBase):
    """Payload for registering a payment."""

    pass


class ClientAccountPaymentRead(ClientAccountPaymentBase):
    """Payment representation returned by the API."""

    id: UUID
    client_account_id: UUID

    model_config = ConfigDict(from_attributes=True)


class ClientAccountPaymentListResponse(PaginatedResponse[ClientAccountPaymentRead]):
    """Paginated list of payments for a client account."""

    pass
