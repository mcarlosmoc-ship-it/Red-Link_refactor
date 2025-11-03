"""Business logic for expenses."""

from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from .. import models, schemas


class ExpenseService:
    """Encapsulates CRUD operations for expenses."""

    @staticmethod
    def list_expenses(db: Session) -> Iterable[models.Expense]:
        return db.query(models.Expense).order_by(models.Expense.expense_date.desc()).all()

    @staticmethod
    def create_expense(db: Session, data: schemas.ExpenseCreate) -> models.Expense:
        expense = models.Expense(**data.dict())
        db.add(expense)
        db.commit()
        db.refresh(expense)
        return expense

    @staticmethod
    def get_expense(db: Session, expense_id: str) -> Optional[models.Expense]:
        return db.query(models.Expense).filter(models.Expense.id == expense_id).first()

    @staticmethod
    def delete_expense(db: Session, expense: models.Expense) -> None:
        db.delete(expense)
        db.commit()
