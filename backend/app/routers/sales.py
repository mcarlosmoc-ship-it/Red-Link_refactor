"""Router exposing point of sale operations."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models.payment import PaymentMethod
from ..security import require_admin
from ..services import PosService, PosServiceError

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/products", response_model=schemas.PosProductListResponse)
def list_products(
    db: Session = Depends(get_db),
    include_inactive: bool = Query(
        False,
        description="Include inactive products in the listing",
    ),
    search: Optional[str] = Query(None, description="Filter by name, SKU or category"),
    category: Optional[str] = Query(None, description="Filter by category"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Maximum number of records to return"),
) -> schemas.PosProductListResponse:
    items, total = PosService.list_products(
        db,
        include_inactive=include_inactive,
        search=search,
        category=category,
        skip=skip,
        limit=limit,
    )
    return schemas.PosProductListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post(
    "/products",
    response_model=schemas.PosProductRead,
    status_code=status.HTTP_201_CREATED,
)
def create_product(product_in: schemas.PosProductCreate, db: Session = Depends(get_db)) -> schemas.PosProductRead:
    try:
        return PosService.create_product(db, product_in)
    except PosServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/products/{product_id}", response_model=schemas.PosProductRead)
def update_product(
    product_id: str,
    product_in: schemas.PosProductUpdate,
    db: Session = Depends(get_db),
) -> schemas.PosProductRead:
    try:
        return PosService.update_product(db, product_id, product_in)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PosServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/transactions", response_model=schemas.PosSaleListResponse)
def list_sales(
    db: Session = Depends(get_db),
    start_date: Optional[datetime] = Query(
        None,
        description="Return sales on or after this date",
    ),
    end_date: Optional[datetime] = Query(
        None,
        description="Return sales on or before this date",
    ),
    payment_method: Optional[PaymentMethod] = Query(
        None, description="Filter sales by payment method"
    ),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Maximum number of records to return"),
) -> schemas.PosSaleListResponse:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date no puede ser posterior a end_date",
        )

    items, total = PosService.list_sales(
        db,
        start_date=start_date,
        end_date=end_date,
        payment_method=payment_method,
        skip=skip,
        limit=limit,
    )
    return schemas.PosSaleListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post(
    "/transactions",
    response_model=schemas.PosSaleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_sale(sale_in: schemas.PosSaleCreate, db: Session = Depends(get_db)) -> schemas.PosSaleRead:
    try:
        return PosService.create_sale(db, sale_in)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PosServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
