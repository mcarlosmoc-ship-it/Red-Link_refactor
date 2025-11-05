"""Business logic for expenses."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from .financial_snapshots import FinancialSnapshotService


class ExpenseService:
    """Encapsulates CRUD operations for expenses."""

    @staticmethod
    def list_expenses(
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        base_id: Optional[int] = None,
        category: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        min_amount: Optional[Decimal] = None,
        max_amount: Optional[Decimal] = None,
    ) -> Tuple[Iterable[models.Expense], int]:
        query = db.query(models.Expense)

        if base_id is not None:
            query = query.filter(models.Expense.base_id == base_id)
        if category:
            normalized = category.strip().lower()
            query = query.filter(func.lower(models.Expense.category) == normalized)
        if start_date:
            query = query.filter(models.Expense.expense_date >= start_date)
        if end_date:
            query = query.filter(models.Expense.expense_date <= end_date)
        if min_amount is not None:
            query = query.filter(models.Expense.amount >= min_amount)
        if max_amount is not None:
            query = query.filter(models.Expense.amount <= max_amount)

        total = query.count()
        items = (
            query.order_by(models.Expense.expense_date.desc())
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def create_expense(db: Session, data: schemas.ExpenseCreate) -> models.Expense:
        expense = models.Expense(**data.dict())
        db.add(expense)
        period_key = expense.expense_date.strftime("%Y-%m")
        FinancialSnapshotService.apply_expense(db, period_key, Decimal(expense.amount))
        db.commit()
        db.refresh(expense)
        return expense

    @staticmethod
    def get_expense(db: Session, expense_id: str) -> Optional[models.Expense]:
        return db.query(models.Expense).filter(models.Expense.id == expense_id).first()

    @staticmethod
    def delete_expense(db: Session, expense: models.Expense) -> None:
        db.delete(expense)
        period_key = expense.expense_date.strftime("%Y-%m")
        FinancialSnapshotService.remove_expense(db, period_key, Decimal(expense.amount))
        db.commit()
