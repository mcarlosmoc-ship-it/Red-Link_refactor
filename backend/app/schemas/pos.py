from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional, Sequence
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.payment import PaymentMethod
from .common import PaginatedResponse


class PosProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: str = Field(..., min_length=1, max_length=120)
    unit_price: Decimal = Field(..., ge=0)
    sku: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    stock_quantity: Optional[Decimal] = Field(default=None, ge=0)
    is_active: bool = True

    @field_validator("name", "category")
    @classmethod
    def _strip_strings(cls, value: str) -> str:
        return value.strip()

    @field_validator("description", "sku")
    @classmethod
    def _strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class PosProductCreate(PosProductBase):
    pass


class PosProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    category: Optional[str] = Field(default=None, max_length=120)
    unit_price: Optional[Decimal] = Field(default=None, ge=0)
    sku: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    stock_quantity: Optional[Decimal] = Field(default=None, ge=0)
    is_active: Optional[bool] = None

    @field_validator("name", "category", mode="before")
    @classmethod
    def _strip_updatable(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("description", "sku", mode="before")
    @classmethod
    def _strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class PosProductRead(PosProductBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PosProductListResponse(PaginatedResponse[PosProductRead]):
    pass


class PosSaleItemInput(BaseModel):
    product_id: Optional[UUID] = Field(default=None)
    description: Optional[str] = Field(default=None, max_length=255)
    quantity: Decimal = Field(..., gt=0)
    unit_price: Optional[Decimal] = Field(default=None, gt=0)

    @field_validator("description")
    @classmethod
    def _strip_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class PosSaleCreate(BaseModel):
    items: Sequence[PosSaleItemInput]
    payment_method: PaymentMethod
    client_id: Optional[UUID] = None
    client_name: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=500)
    sold_at: Optional[datetime] = None
    discount_amount: Optional[Decimal] = Field(default=Decimal("0"), ge=0)
    tax_amount: Optional[Decimal] = Field(default=Decimal("0"), ge=0)

    @field_validator("client_name", "notes")
    @classmethod
    def _strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class PosSaleItemRead(BaseModel):
    id: int
    product_id: Optional[UUID]
    description: str
    quantity: Decimal
    unit_price: Decimal
    total: Decimal

    model_config = ConfigDict(from_attributes=True)


class PosSaleRead(BaseModel):
    id: UUID
    ticket_number: str
    sold_at: datetime
    client_id: Optional[UUID]
    client_name: Optional[str]
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total: Decimal
    payment_method: PaymentMethod
    notes: Optional[str]
    items: Sequence[PosSaleItemRead]

    model_config = ConfigDict(from_attributes=True)


class PosSaleListResponse(PaginatedResponse[PosSaleRead]):
    pass
