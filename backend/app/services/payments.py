"""Business logic for payment operations."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from .billing_periods import BillingPeriodService
from .financial_snapshots import FinancialSnapshotService


class PaymentServiceError(RuntimeError):
    """Raised when payment operations cannot be completed."""


class PaymentService:
    """Operations for reading and recording service payments."""

    @staticmethod
    def list_payments(
        db: Session,
        *,
        client_id: Optional[str] = None,
        client_service_id: Optional[str] = None,
        service_type: Optional[models.ClientServiceType] = None,
        period_key: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        method: Optional[models.PaymentMethod] = None,
        min_amount: Optional[Decimal] = None,
        max_amount: Optional[Decimal] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.ServicePayment], int]:
        query = db.query(models.ServicePayment).options(
            selectinload(models.ServicePayment.client),
            selectinload(models.ServicePayment.service),
        )

        if client_id:
            query = query.filter(models.ServicePayment.client_id == client_id)
        if client_service_id:
            query = query.filter(
                models.ServicePayment.client_service_id == client_service_id
            )
        if service_type:
            query = (
                query.join(models.ServicePayment.service)
                .join(models.ClientService.service_plan)
                .filter(models.ServicePlan.category == service_type)
            )
        if period_key:
            query = query.filter(models.ServicePayment.period_key == period_key)
        if start_date:
            query = query.filter(models.ServicePayment.paid_on >= start_date)
        if end_date:
            query = query.filter(models.ServicePayment.paid_on <= end_date)
        if method:
            query = query.filter(models.ServicePayment.method == method)
        if min_amount is not None:
            query = query.filter(models.ServicePayment.amount >= min_amount)
        if max_amount is not None:
            query = query.filter(models.ServicePayment.amount <= max_amount)

        total = query.count()
        items = (
            query.order_by(
                models.ServicePayment.paid_on.desc(),
                models.ServicePayment.created_at.desc(),
            )
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def _normalize_amount(value: Decimal | float | str) -> Decimal:
        cents = Decimal("0.01")
        return Decimal(value).quantize(cents, rounding=ROUND_HALF_UP)

    @staticmethod
    def _normalize_months(value: Optional[Decimal | float | str]) -> Optional[Decimal]:
        if value is None:
            return None
        cents = Decimal("0.01")
        months = Decimal(value).quantize(cents, rounding=ROUND_HALF_UP)
        if months <= 0:
            raise ValueError("months_paid must be greater than zero")
        return months

    @staticmethod
    def _resolve_service(db: Session, service_id: str) -> models.ClientService:
        service = (
            db.query(models.ClientService)
            .options(selectinload(models.ClientService.client))
            .filter(models.ClientService.id == service_id)
            .first()
        )
        if service is None:
            raise ValueError("Service not found")
        return service

    @classmethod
    def create_payment(
        cls, db: Session, data: schemas.ServicePaymentCreate
    ) -> models.ServicePayment:
        service = cls._resolve_service(db, data.client_service_id)
        client = service.client

        period_key = None
        if data.period_key:
            period_key = BillingPeriodService.ensure_period(db, data.period_key).period_key

        amount = cls._normalize_amount(data.amount)
        months_paid = cls._normalize_months(data.months_paid)

        payment = models.ServicePayment(
            client_service_id=service.id,
            client_id=client.id,
            period_key=period_key,
            paid_on=data.paid_on,
            amount=amount,
            months_paid=months_paid,
            method=data.method,
            note=data.note,
            recorded_by=data.recorded_by,
        )

        if period_key:
            FinancialSnapshotService.apply_payment(db, period_key, amount)

        cls._apply_client_balances(service, client, months_paid or Decimal("0"))

        db.add(payment)
        db.add(client)

        audit_entry = models.PaymentAuditLog(
            payment=payment,
            action=models.PaymentAuditAction.CREATED,
            snapshot={
                "amount": str(amount),
                "months_paid": str(months_paid) if months_paid is not None else None,
                "method": payment.method,
                "paid_on": str(payment.paid_on),
            },
        )
        db.add(audit_entry)

        try:
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise PaymentServiceError("Unable to record payment at this time.") from exc

        db.refresh(payment)
        db.refresh(client)
        return payment

    @staticmethod
    def _apply_client_balances(
        service: models.ClientService, client: models.Client, months_paid: Decimal
    ) -> None:
        if service.category not in {
            models.ClientServiceType.INTERNET,
            models.ClientServiceType.HOTSPOT,
        }:
            return

        current_debt = Decimal(client.debt_months or 0)
        current_ahead = Decimal(client.paid_months_ahead or 0)

        remaining_after_debt = max(Decimal("0"), months_paid - current_debt)
        new_debt = max(Decimal("0"), current_debt - months_paid)
        new_ahead = current_ahead + remaining_after_debt

        client.debt_months = new_debt
        client.paid_months_ahead = new_ahead
        if new_debt <= 0:
            client.service_status = models.ServiceStatus.ACTIVE

    @staticmethod
    def _revert_client_balances(
        service: models.ClientService, client: models.Client, months_paid: Decimal
    ) -> None:
        if service.category not in {
            models.ClientServiceType.INTERNET,
            models.ClientServiceType.HOTSPOT,
        }:
            return

        current_debt = Decimal(client.debt_months or 0)
        current_ahead = Decimal(client.paid_months_ahead or 0)

        months_reverted_from_ahead = min(current_ahead, months_paid)
        new_ahead = current_ahead - months_reverted_from_ahead
        debt_increase = months_paid - months_reverted_from_ahead
        new_debt = current_debt + debt_increase

        client.paid_months_ahead = new_ahead.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        client.debt_months = new_debt.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if client.debt_months > 0:
            client.service_status = models.ServiceStatus.SUSPENDED
        else:
            client.service_status = models.ServiceStatus.ACTIVE

    @classmethod
    def delete_payment(cls, db: Session, payment: models.ServicePayment) -> None:
        service = cls._resolve_service(db, payment.client_service_id)
        client = service.client

        amount = cls._normalize_amount(payment.amount)
        months_paid = cls._normalize_months(payment.months_paid) or Decimal("0")

        audit_entry = models.PaymentAuditLog(
            payment=payment,
            action=models.PaymentAuditAction.DELETED,
            snapshot={
                "amount": str(amount),
                "months_paid": str(payment.months_paid)
                if payment.months_paid is not None
                else None,
                "method": payment.method,
                "paid_on": str(payment.paid_on),
            },
        )

        if payment.period_key:
            FinancialSnapshotService.remove_payment(db, payment.period_key, amount)

        cls._revert_client_balances(service, client, months_paid)

        try:
            db.add(audit_entry)
            db.add(client)
            db.delete(payment)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise PaymentServiceError("Unable to delete payment at this time.") from exc

    @staticmethod
    def get_payment(db: Session, payment_id: str) -> Optional[models.ServicePayment]:
        return (
            db.query(models.ServicePayment)
            .options(selectinload(models.ServicePayment.client))
            .options(selectinload(models.ServicePayment.service))
            .filter(models.ServicePayment.id == payment_id)
            .first()
        )

    @staticmethod
    def total_amount_for_period(db: Session, period_key: str) -> Decimal:
        total = (
            db.query(func.coalesce(func.sum(models.ServicePayment.amount), 0))
            .filter(models.ServicePayment.period_key == period_key)
            .scalar()
        )
        return Decimal(total or 0)

    @staticmethod
    def total_amount_for_day(db: Session, target_date: date) -> Decimal:
        total = (
            db.query(func.coalesce(func.sum(models.ServicePayment.amount), 0))
            .filter(models.ServicePayment.paid_on == target_date)
            .scalar()
        )
        return Decimal(total or 0)
