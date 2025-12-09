"""API router for the service plan catalog."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models.client_service import ClientServiceType
from ..security import require_admin
from ..services import ServicePlanError, ServicePlanService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("", response_model=schemas.ServicePlanListResponse)
def list_service_plans(
    db: Session = Depends(get_db),
    category: Optional[ClientServiceType] = Query(None, description="Filter by category"),
    include_inactive: bool = Query(True, description="Include inactive plans"),
    search: Optional[str] = Query(None, description="Filter by name"),
    skip: int = Query(0, ge=0, description="Records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Records to return"),
) -> schemas.ServicePlanListResponse:
    items, total = ServicePlanService.list_plans(
        db,
        include_inactive=include_inactive,
        category=category,
        search=search,
        skip=skip,
        limit=limit,
    )
    return schemas.ServicePlanListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post("", response_model=schemas.ServicePlanRead, status_code=status.HTTP_201_CREATED)
def create_service_plan(
    payload: schemas.ServicePlanCreate, db: Session = Depends(get_db)
) -> schemas.ServicePlanRead:
    try:
        return ServicePlanService.create_plan(db, payload)
    except ServicePlanError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{plan_id}", response_model=schemas.ServicePlanRead)
def get_service_plan(plan_id: int, db: Session = Depends(get_db)) -> schemas.ServicePlanRead:
    plan = ServicePlanService.get_plan(db, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service plan not found")
    return plan


@router.put("/{plan_id}", response_model=schemas.ServicePlanRead)
def update_service_plan(
    plan_id: int,
    payload: schemas.ServicePlanUpdate,
    db: Session = Depends(get_db),
) -> schemas.ServicePlanRead:
    plan = ServicePlanService.get_plan(db, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service plan not found")
    try:
        return ServicePlanService.update_plan(db, plan, payload)
    except ServicePlanError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service_plan(plan_id: int, db: Session = Depends(get_db)) -> None:
    plan = ServicePlanService.get_plan(db, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service plan not found")
    ServicePlanService.delete_plan(db, plan)
