from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models.inventory import InventoryStatus


class InventoryBase(BaseModel):
    brand: str = Field(..., description="Brand of the hardware asset")
    model: Optional[str] = Field(default=None, description="Model of the hardware asset")
    serial_number: Optional[str] = Field(default=None, description="Serial number if available")
    asset_tag: Optional[str] = Field(default=None, description="Internal asset tag")
    base_id: int = Field(..., description="Base station where the asset resides")
    ip_address: Optional[str] = Field(default=None, description="IP address assigned to the asset")
    status: InventoryStatus = Field(..., description="Current lifecycle status of the asset")
    location: str = Field(..., description="Physical location of the asset")
    client_id: Optional[str] = Field(default=None, description="Client identifier if the asset is assigned")
    notes: Optional[str] = Field(default=None, description="Additional observations")
    installed_at: Optional[date] = Field(default=None, description="Installation date when available")


class InventoryCreate(InventoryBase):
    """Schema used when creating inventory items."""

    pass


class InventoryUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    asset_tag: Optional[str] = None
    base_id: Optional[int] = None
    ip_address: Optional[str] = None
    status: Optional[InventoryStatus] = None
    location: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    installed_at: Optional[date] = None


class InventoryRead(InventoryBase):
    id: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
