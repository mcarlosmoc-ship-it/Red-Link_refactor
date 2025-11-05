"""Utility functions to maintain financial snapshot aggregates."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from .. import models


class FinancialSnapshotService:
    """Provide helper methods to keep financial snapshots in sync."""

    @staticmethod
    def _normalize_amount(value: Decimal | float | int | None) -> Decimal:
        return Decimal(str(value or 0))

    @staticmethod
    def _get_snapshot(db: Session, period_key: str) -> models.FinancialSnapshot:
        snapshot = (
            db.query(models.FinancialSnapshot)
            .filter(models.FinancialSnapshot.period_key == period_key)
            .with_for_update(of=models.FinancialSnapshot)
            .first()
        )
        if snapshot is None:
            snapshot = models.FinancialSnapshot(period_key=period_key)
            db.add(snapshot)
            db.flush()
        return snapshot

    @classmethod
    def apply_payment(cls, db: Session, period_key: str, amount: Decimal) -> None:
        snapshot = cls._get_snapshot(db, period_key)
        snapshot.total_income = cls._normalize_amount(snapshot.total_income) + cls._normalize_amount(amount)
        snapshot.net_earnings = cls._normalize_amount(snapshot.total_income) - cls._normalize_amount(
            snapshot.total_expenses,
        )
        db.add(snapshot)

    @classmethod
    def remove_payment(cls, db: Session, period_key: str, amount: Decimal) -> None:
        snapshot = (
            db.query(models.FinancialSnapshot)
            .filter(models.FinancialSnapshot.period_key == period_key)
            .with_for_update(of=models.FinancialSnapshot)
            .first()
        )
        if snapshot is None:
            return
        snapshot.total_income = cls._normalize_amount(snapshot.total_income) - cls._normalize_amount(amount)
        if snapshot.total_income < 0:
            snapshot.total_income = Decimal("0")
        snapshot.net_earnings = cls._normalize_amount(snapshot.total_income) - cls._normalize_amount(
            snapshot.total_expenses,
        )
        db.add(snapshot)

    @classmethod
    def apply_expense(cls, db: Session, period_key: str, amount: Decimal) -> None:
        snapshot = cls._get_snapshot(db, period_key)
        snapshot.total_expenses = cls._normalize_amount(snapshot.total_expenses) + cls._normalize_amount(amount)
        snapshot.net_earnings = cls._normalize_amount(snapshot.total_income) - cls._normalize_amount(
            snapshot.total_expenses,
        )
        db.add(snapshot)

    @classmethod
    def remove_expense(cls, db: Session, period_key: str, amount: Decimal) -> None:
        snapshot = (
            db.query(models.FinancialSnapshot)
            .filter(models.FinancialSnapshot.period_key == period_key)
            .with_for_update(of=models.FinancialSnapshot)
            .first()
        )
        if snapshot is None:
            return
        snapshot.total_expenses = cls._normalize_amount(snapshot.total_expenses) - cls._normalize_amount(amount)
        if snapshot.total_expenses < 0:
            snapshot.total_expenses = Decimal("0")
        snapshot.net_earnings = cls._normalize_amount(snapshot.total_income) - cls._normalize_amount(
            snapshot.total_expenses,
        )
        db.add(snapshot)
