from __future__ import annotations

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models.reseller_delivery import DeliverySettlementStatus


class ResellerBase(BaseModel):
    full_name: str = Field(..., description="Name of the reseller")
    base_id: int = Field(..., description="Base station identifier associated with the reseller")
    location: str = Field(..., description="Location or community served by the reseller")


class ResellerCreate(ResellerBase):
    pass


class ResellerDeliveryItemBase(BaseModel):
    voucher_type_id: int = Field(..., description="Voucher type identifier")
    quantity: int = Field(..., ge=0, description="Number of vouchers delivered")


class ResellerDeliveryItemRead(ResellerDeliveryItemBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class ResellerDeliveryBase(BaseModel):
    reseller_id: str
    delivered_on: date
    settlement_status: DeliverySettlementStatus = DeliverySettlementStatus.PENDING
    total_value: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None


class ResellerDeliveryCreate(ResellerDeliveryBase):
    items: List[ResellerDeliveryItemBase]


class ResellerDeliveryRead(ResellerDeliveryBase):
    id: str
    items: List[ResellerDeliveryItemRead]

    model_config = ConfigDict(from_attributes=True)


class ResellerSettlementBase(BaseModel):
    reseller_id: str
    delivery_id: Optional[str] = None
    settled_on: date
    amount: Decimal = Field(..., ge=0)
    notes: Optional[str] = None


class ResellerSettlementCreate(ResellerSettlementBase):
    pass


class ResellerSettlementRead(ResellerSettlementBase):
    id: str

    model_config = ConfigDict(from_attributes=True)


class ResellerRead(ResellerBase):
    id: str
    deliveries: List[ResellerDeliveryRead] = []
    settlements: List[ResellerSettlementRead] = []

    model_config = ConfigDict(from_attributes=True)
