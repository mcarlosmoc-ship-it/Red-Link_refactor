from __future__ import annotations

from decimal import Decimal
from typing import List

from enum import Enum

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


class StatusFilter(str, Enum):
    """Supported filters for client payment status in the dashboard."""

    ALL = "all"
    PAID = "paid"
    PENDING = "pending"


class DashboardClient(BaseModel):
    """Client information projected for the dashboard list."""

    id: str
    name: str
    location: str
    monthly_fee: Decimal = Field(default=Decimal("0"))
    debt_months: Decimal = Field(default=Decimal("0"))
    paid_months_ahead: Decimal = Field(default=Decimal("0"))
    service_status: str
    client_type: str | None = None


class DashboardMetricsSummary(BaseModel):
    """Aggregated metrics presented in the dashboard summary cards."""

    total_clients: int = Field(..., ge=0)
    paid_clients: int = Field(..., ge=0)
    pending_clients: int = Field(..., ge=0)
    total_debt_amount: Decimal = Field(..., ge=0)
    client_income: Decimal = Field(..., ge=0)
    reseller_income: Decimal = Field(..., ge=0)
    total_expenses: Decimal = Field(..., ge=0)
    internet_costs: Decimal = Field(..., ge=0)
    net_earnings: Decimal


class DashboardMetricsResponse(BaseModel):
    """Full payload consumed by the dashboard view in the frontend."""

    summary: DashboardMetricsSummary
    clients: List[DashboardClient]
    base_costs: dict[str, Decimal] = Field(default_factory=dict)
