"""Business logic for payment operations."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from .billing_periods import BillingPeriodService


class PaymentServiceError(RuntimeError):
    """Raised when payment operations cannot be completed."""


class PaymentService:
    """Operations for reading and recording client payments."""

    @staticmethod
    def list_payments(
        db: Session,
        *,
        client_id: Optional[str] = None,
        period_key: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Iterable[models.Payment]:
        query = db.query(models.Payment).options(selectinload(models.Payment.client))
        if client_id:
            query = query.filter(models.Payment.client_id == client_id)
        if period_key:
            query = query.filter(models.Payment.period_key == period_key)
        if start_date:
            query = query.filter(models.Payment.paid_on >= start_date)
        if end_date:
            query = query.filter(models.Payment.paid_on <= end_date)
        return query.order_by(models.Payment.paid_on.desc()).all()

    @staticmethod
    def create_payment(db: Session, data: schemas.PaymentCreate) -> models.Payment:
        client = db.query(models.Client).filter(models.Client.id == data.client_id).first()
        if client is None:
            raise ValueError("Client not found")

        period = BillingPeriodService.ensure_period(db, data.period_key)

        cents = Decimal("0.01")

        months_paid = Decimal(data.months_paid).quantize(cents, rounding=ROUND_HALF_UP)
        if months_paid <= 0:
            raise ValueError("months_paid must be greater than zero")

        amount = Decimal(data.amount).quantize(cents, rounding=ROUND_HALF_UP)
        if amount <= 0:
            raise ValueError("amount must be greater than zero")

        current_debt = Decimal(client.debt_months or 0)
        current_ahead = Decimal(client.paid_months_ahead or 0)

        # Apply payment: first cover debt, remaining months become credit ahead
        remaining_after_debt = max(Decimal("0"), months_paid - current_debt)
        new_debt = max(Decimal("0"), current_debt - months_paid)
        new_ahead = current_ahead + remaining_after_debt

        client.debt_months = new_debt
        client.paid_months_ahead = new_ahead
        if new_debt <= 0:
            client.service_status = models.ServiceStatus.ACTIVE

        payment_data = data.model_dump()
        payment_data["amount"] = amount
        payment_data["period_key"] = period.period_key
        payment_data["months_paid"] = months_paid
        payment = models.Payment(**payment_data)
        db.add(payment)
        db.add(client)

        try:
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise PaymentServiceError("Unable to record payment at this time.") from exc

        db.refresh(payment)
        db.refresh(client)
        return payment

    @staticmethod
    def delete_payment(db: Session, payment: models.Payment) -> None:
        db.delete(payment)
        try:
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise PaymentServiceError("Unable to delete payment at this time.") from exc

    @staticmethod
    def get_payment(db: Session, payment_id: str) -> Optional[models.Payment]:
        return db.query(models.Payment).filter(models.Payment.id == payment_id).first()

    @staticmethod
    def total_amount_for_period(db: Session, period_key: str) -> Decimal:
        total = (
            db.query(func.coalesce(func.sum(models.Payment.amount), 0))
            .filter(models.Payment.period_key == period_key)
            .scalar()
        )
        return Decimal(total or 0)

    @staticmethod
    def total_amount_for_day(db: Session, target_date: date) -> Decimal:
        total = (
            db.query(func.coalesce(func.sum(models.Payment.amount), 0))
            .filter(models.Payment.paid_on == target_date)
            .scalar()
        )
        return Decimal(total or 0)
