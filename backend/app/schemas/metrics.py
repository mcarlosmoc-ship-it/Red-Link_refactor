from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Mapping

from enum import Enum

from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


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
    payments_for_period: Decimal = Field(..., ge=0)
    payments_today: Decimal = Field(..., ge=0)


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
    DUE_SOON = "due_soon"


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
    payments_for_period: Decimal = Field(..., ge=0)
    payments_today: Decimal = Field(..., ge=0)


class DashboardMetricsResponse(BaseModel):
    """Full payload consumed by the dashboard view in the frontend."""

    summary: DashboardMetricsSummary
    clients: List[DashboardClient]
    base_costs: dict[str, Decimal] = Field(default_factory=dict)


class BaseCostUpdateRequest(BaseModel):
    """Payload used to update base operating costs for a billing period."""

    period_key: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    costs: Dict[int, Decimal] = Field(default_factory=dict)

    @field_validator("costs", mode="before")
    @classmethod
    def _normalize_cost_keys(cls, value: Mapping[str, Decimal] | None) -> Mapping[int, Decimal]:
        if value is None:
            return {}

        normalized: Dict[int, Decimal] = {}
        for raw_key, amount in value.items():
            if raw_key is None:
                continue

            key_str = str(raw_key)
            if key_str.startswith("base"):
                key_str = key_str[4:]

            try:
                base_id = int(key_str)
            except (TypeError, ValueError):  # pragma: no cover - defensive
                continue

            normalized[base_id] = amount

        return normalized


class BaseCostUpdateResponse(BaseModel):
    """Response returned after persisting base operating costs."""

    period_key: str
    costs: dict[str, Decimal] = Field(default_factory=dict)


class SchedulerJobHealth(BaseModel):
    enabled: bool
    last_tick: datetime | None = None
    recent_errors: List[str] = Field(default_factory=list)


class SchedulerHealthResponse(BaseModel):
    jobs: Dict[str, SchedulerJobHealth] = Field(default_factory=dict)
