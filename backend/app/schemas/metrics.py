from __future__ import annotations

from decimal import Decimal
from typing import List

from pydantic import BaseModel, Field


class MetricsOverview(BaseModel):
    total_clients: int = Field(..., ge=0)
    paid_clients: int = Field(..., ge=0)
    pending_clients: int = Field(..., ge=0)
    total_debt_amount: Decimal = Field(..., ge=0)
    client_income: Decimal = Field(..., ge=0)
    reseller_income: Decimal = Field(..., ge=0)
    total_expenses: Decimal = Field(..., ge=0)
    internet_costs: Decimal = Field(..., ge=0)
    net_earnings: Decimal


class CommunityMetrics(BaseModel):
    location: str
    total_clients: int
    pending_clients: int
    debt_amount: Decimal
    payments: Decimal


class MetricsResponse(BaseModel):
    overview: MetricsOverview
    communities: List[CommunityMetrics]
    base_costs: dict[str, Decimal] = Field(default_factory=dict)
