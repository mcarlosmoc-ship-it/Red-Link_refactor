"""Router exposing expense operations."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..security import require_admin
from ..services import ExpenseService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/", response_model=schemas.ExpenseListResponse)
def list_expenses(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of expenses to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of expenses to return"),
    base_id: Optional[int] = Query(None, ge=1, description="Filter by base station"),
    category: Optional[str] = Query(None, description="Filter by expense category"),
    start_date: Optional[date] = Query(None, description="Return expenses on or after this date"),
    end_date: Optional[date] = Query(None, description="Return expenses on or before this date"),
    min_amount: Optional[Decimal] = Query(None, ge=0, description="Minimum expense amount"),
    max_amount: Optional[Decimal] = Query(None, ge=0, description="Maximum expense amount"),
) -> schemas.ExpenseListResponse:
    """Return expenses with pagination and filtering."""

    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )

    if min_amount is not None and max_amount is not None and min_amount > max_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_amount cannot be greater than max_amount",
        )

    items, total = ExpenseService.list_expenses(
        db,
        skip=skip,
        limit=limit,
        base_id=base_id,
        category=category,
        start_date=start_date,
        end_date=end_date,
        min_amount=min_amount,
        max_amount=max_amount,
    )
    return schemas.ExpenseListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post("/", response_model=schemas.ExpenseRead, status_code=status.HTTP_201_CREATED)
def create_expense(expense_in: schemas.ExpenseCreate, db: Session = Depends(get_db)) -> schemas.ExpenseRead:
    return ExpenseService.create_expense(db, expense_in)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: str, db: Session = Depends(get_db)) -> None:
    expense = ExpenseService.get_expense(db, expense_id)
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    ExpenseService.delete_expense(db, expense)
