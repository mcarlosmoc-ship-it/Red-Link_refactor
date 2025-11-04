"""Router exposing aggregated dashboard metrics."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..services import MetricsService

router = APIRouter()


@router.get("/overview", response_model=schemas.MetricsResponse)
def get_metrics_overview(
    period_key: str | None = Query(default=None, description="Billing period key in YYYY-MM format"),
    db: Session = Depends(get_db),
) -> schemas.MetricsResponse:
    overview = MetricsService.overview(db, period_key=period_key)
    communities = MetricsService.community_breakdown(db, period_key=period_key)
    base_costs = overview.pop("base_cost_breakdown", {})
    return schemas.MetricsResponse(
        overview=schemas.MetricsOverview(**overview),
        communities=[schemas.CommunityMetrics(**item) for item in communities],
        base_costs=base_costs,
    )


@router.get("/dashboard", response_model=schemas.DashboardMetricsResponse)
def get_dashboard_metrics(
    period_key: str | None = Query(default=None, description="Billing period key in YYYY-MM format"),
    current_period: str | None = Query(
        default=None,
        description="Current billing period key in YYYY-MM format, used to project client status",
    ),
    status_filter: schemas.StatusFilter = Query(default=schemas.StatusFilter.ALL),
    search: str | None = Query(default=None, description="Free text search applied to client name or location"),
    db: Session = Depends(get_db),
) -> schemas.DashboardMetricsResponse:
    """Return dashboard metrics, the `base_costs` breakdown, and the filtered client list."""

    payload = MetricsService.dashboard(
        db,
        period_key=period_key,
        current_period=current_period,
        status_filter=status_filter,
        search=search,
    )
    return schemas.DashboardMetricsResponse(**payload)
