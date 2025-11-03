"""Pydantic schemas for the client resources."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from ..models.client import ClientType, ServiceStatus


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

    class Config:
        orm_mode = True
