"""Router exposing expense operations."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..services import ExpenseService

router = APIRouter()


@router.get("/", response_model=List[schemas.ExpenseRead])
def list_expenses(db: Session = Depends(get_db)) -> List[schemas.ExpenseRead]:
    """Return expenses ordered by most recent date."""
    return list(ExpenseService.list_expenses(db))


@router.post("/", response_model=schemas.ExpenseRead, status_code=status.HTTP_201_CREATED)
def create_expense(expense_in: schemas.ExpenseCreate, db: Session = Depends(get_db)) -> schemas.ExpenseRead:
    return ExpenseService.create_expense(db, expense_in)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: str, db: Session = Depends(get_db)) -> None:
    expense = ExpenseService.get_expense(db, expense_id)
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    ExpenseService.delete_expense(db, expense)
