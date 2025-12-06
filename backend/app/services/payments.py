"""Business logic for payment operations."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from math import ceil
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

    @classmethod
    def _normalize_method_breakdown(
        cls, data: schemas.ServicePaymentBase
    ) -> tuple[models.PaymentMethod, list[dict] | None]:
        breakdown = None
        method = data.method
        if data.methods:
            breakdown = []
            total = Decimal("0")
            for entry in data.methods:
                normalized_amount = cls._normalize_amount(entry.amount)
                total += normalized_amount
                breakdown.append(
                    {
                        "method": entry.method.value,
                        "amount": str(normalized_amount),
                    }
                )

            if total != cls._normalize_amount(data.amount):
                raise ValueError("La suma de los métodos no coincide con el monto total.")

            if len(data.methods) > 1:
                method = models.PaymentMethod.MIXTO
            elif method is None:
                method = data.methods[0].method

        if method is None:
            raise ValueError("Debes especificar un método de pago.")

        return method, breakdown

    @staticmethod
    def _resolve_service(db: Session, service_id: str) -> models.ClientService:
        service = (
            db.query(models.ClientService)
            .options(selectinload(models.ClientService.client))
            .options(selectinload(models.ClientService.streaming_account))
            .options(selectinload(models.ClientService.service_plan))
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
            cls._ensure_no_duplicate_payment(db, service.id, period_key)

        amount = cls._normalize_amount(data.amount)
        months_paid = cls._normalize_months(data.months_paid)
        if months_paid is None:
            months_paid = cls._infer_months_from_amount(amount, service.effective_price)
        method, breakdown = cls._normalize_method_breakdown(data)

        outstanding_debt_months = Decimal(service.debt_months or 0)
        outstanding_debt_amount = Decimal(service.debt_amount or 0)

        if outstanding_debt_months > Decimal("0"):
            if months_paid is None or months_paid < outstanding_debt_months:
                raise ValueError(
                    "Debes cubrir los meses vencidos antes de registrar meses adelantados."
                )

        if outstanding_debt_amount > Decimal("0") and amount < outstanding_debt_amount:
            raise ValueError("El monto no cubre el adeudo pendiente del servicio.")

        payment = models.ServicePayment(
            client_service_id=service.id,
            client_id=client.id,
            period_key=period_key,
            paid_on=data.paid_on,
            amount=amount,
            months_paid=months_paid,
            method=method,
            method_breakdown=breakdown,
            note=data.note,
            recorded_by=data.recorded_by,
        )

        if period_key:
            FinancialSnapshotService.apply_payment(db, period_key, amount)

        cls._apply_client_balances(service, client, months_paid or Decimal("0"))
        cls._apply_service_debt(service, amount, months_paid)
        cls._update_next_billing(service, data.paid_on, months_paid, amount)

        db.add(payment)
        db.add(client)
        db.add(service)

        audit_entry = models.PaymentAuditLog(
            payment=payment,
            action=models.PaymentAuditAction.CREATED,
            snapshot={
                "amount": str(amount),
                "months_paid": str(months_paid) if months_paid is not None else None,
                "method": payment.method,
                "method_breakdown": breakdown,
                "paid_on": str(payment.paid_on),
                "recorded_by": payment.recorded_by,
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
    def _infer_months_from_amount(
        amount: Decimal, effective_price: Optional[Decimal]
    ) -> Optional[Decimal]:
        if effective_price is None:
            return None
        if Decimal(effective_price) <= 0:
            return None
        months = amount / Decimal(effective_price)
        if months <= 0:
            return None
        cents = Decimal("0.01")
        return months.quantize(cents, rounding=ROUND_HALF_UP)

    @staticmethod
    def _ensure_no_duplicate_payment(
        db: Session, service_id: str, period_key: Optional[str]
    ) -> None:
        if period_key is None:
            return
        exists = (
            db.query(models.ServicePayment)
            .filter(
                models.ServicePayment.client_service_id == service_id,
                models.ServicePayment.period_key == period_key,
            )
            .first()
        )
        if exists:
            raise ValueError(
                "Ya existe un pago registrado para este periodo y servicio."
            )

    @staticmethod
    def has_duplicate_payment(
        db: Session, service_id: str, period_key: Optional[str]
    ) -> bool:
        if period_key is None:
            return False
        return (
            db.query(models.ServicePayment)
            .filter(
                models.ServicePayment.client_service_id == service_id,
                models.ServicePayment.period_key == period_key,
            )
            .first()
            is not None
        )

    @staticmethod
    def _add_months(start: date, months: Decimal | float | int) -> date:
        whole_months = int(ceil(float(months)))
        current_year, current_month = start.year, start.month
        new_month = current_month + whole_months
        new_year = current_year + (new_month - 1) // 12
        normalized_month = ((new_month - 1) % 12) + 1
        last_day = monthrange(new_year, normalized_month)[1]
        return date(new_year, normalized_month, min(start.day, last_day))

    @staticmethod
    def _shift_months(start: date, months_delta: int) -> date:
        month_index = start.month - 1 + months_delta
        year = start.year + month_index // 12
        normalized_month = month_index % 12 + 1
        last_day = monthrange(year, normalized_month)[1]
        return date(year, normalized_month, min(start.day, last_day))

    @classmethod
    def _billing_window(
        cls, service: models.ClientService, reference_date: Optional[date] = None
    ) -> tuple[date, date, str]:
        reference = reference_date or date.today()
        billing_day = service.billing_day or reference.day

        if reference.day < billing_day:
            adjusted_reference = cls._shift_months(reference, -1)
            start = adjusted_reference.replace(
                day=min(billing_day, monthrange(adjusted_reference.year, adjusted_reference.month)[1])
            )
        else:
            start = reference.replace(
                day=min(billing_day, monthrange(reference.year, reference.month)[1])
            )

        next_cycle = cls._add_months(start, 1)
        end = next_cycle - timedelta(days=1)
        period_key = f"{start.year:04d}-{start.month:02d}"
        return start, end, period_key

    @classmethod
    def _update_next_billing(
        cls,
        service: models.ClientService,
        paid_on: date,
        months_paid: Optional[Decimal],
        amount: Decimal,
    ) -> None:
        months_to_apply = months_paid
        if months_to_apply is None:
            months_to_apply = cls._infer_months_from_amount(amount, service.effective_price)

        if months_to_apply is None:
            return

        next_due_date = cls._add_months(paid_on, months_to_apply)
        service.next_billing_date = next_due_date
        if service.streaming_account:
            service.streaming_account.fecha_proximo_pago = next_due_date

    @classmethod
    def current_period_statuses(
        cls,
        db: Session,
        *,
        client_id: Optional[str] = None,
        service_id: Optional[str] = None,
        reference_date: Optional[date] = None,
    ) -> list[schemas.ServicePeriodStatus]:
        query = db.query(models.ClientService).options(
            selectinload(models.ClientService.client),
            selectinload(models.ClientService.service_plan),
        )
        if client_id:
            query = query.filter(models.ClientService.client_id == client_id)
        if service_id:
            query = query.filter(models.ClientService.id == service_id)

        services = query.all()
        statuses: list[schemas.ServicePeriodStatus] = []
        for service in services:
            period_start, period_end, period_key = cls._billing_window(
                service, reference_date
            )
            payment_exists = (
                db.query(models.ServicePayment)
                .filter(
                    models.ServicePayment.client_service_id == service.id,
                    models.ServicePayment.period_key == period_key,
                )
                .first()
                is not None
            )
            if payment_exists:
                status = schemas.PeriodPaymentStatus.PAID
            elif (reference_date or date.today()) > period_end:
                status = schemas.PeriodPaymentStatus.OVERDUE
            else:
                status = schemas.PeriodPaymentStatus.PENDING

            statuses.append(
                schemas.ServicePeriodStatus(
                    client_id=str(service.client_id),
                    client_service_id=str(service.id),
                    period_key=period_key,
                    period_start=period_start,
                    period_end=period_end,
                    status=status,
                )
            )
        return statuses

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
    def _apply_service_debt(
        service: models.ClientService, amount_paid: Decimal, months_paid: Optional[Decimal]
    ) -> None:
        outstanding_amount = Decimal(service.debt_amount or 0)
        outstanding_months = Decimal(service.debt_months or 0)

        if outstanding_amount > 0:
            service.debt_amount = max(Decimal("0"), outstanding_amount - amount_paid)

        if months_paid is not None and outstanding_months > 0:
            service.debt_months = max(Decimal("0"), outstanding_months - months_paid)

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

    @staticmethod
    def _revert_service_debt(
        service: models.ClientService, amount_paid: Decimal, months_paid: Optional[Decimal]
    ) -> None:
        if amount_paid and Decimal(amount_paid) > 0:
            service.debt_amount = (Decimal(service.debt_amount or 0) + amount_paid).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        if months_paid is not None and months_paid > 0:
            service.debt_months = (Decimal(service.debt_months or 0) + months_paid).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

    @classmethod
    def overdue_periods(
        cls,
        db: Session,
        client_service_id: str,
        *,
        reference_date: Optional[date] = None,
        late_fee_rate: Decimal | float | str = Decimal("0"),
        discount_rate: Decimal | float | str = Decimal("0"),
        applied_by: Optional[str] = None,
        applied_role: Optional[str] = None,
    ) -> list[schemas.OverduePeriod]:
        service = cls._resolve_service(db, client_service_id)
        period_start, _, _ = cls._billing_window(service, reference_date)

        debt_months = Decimal(service.debt_months or 0)
        months_overdue = int(ceil(float(debt_months)))
        if months_overdue <= 0:
            return []

        base_amount = Decimal(service.effective_price or 0)
        late_fee = cls._normalize_amount(late_fee_rate)
        discount = cls._normalize_amount(discount_rate)

        overdue_periods: list[schemas.OverduePeriod] = []
        for offset in range(1, months_overdue + 1):
            start = cls._shift_months(period_start, -offset)
            end = cls._add_months(start, 1) - timedelta(days=1)
            period_key = f"{start.year:04d}-{start.month:02d}"
            total = base_amount
            if late_fee > 0:
                total += (base_amount * late_fee).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
            if discount > 0:
                total -= (base_amount * discount).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )

            overdue_periods.append(
                schemas.OverduePeriod(
                    client_service_id=str(service.id),
                    period_key=period_key,
                    period_start=start,
                    period_end=end,
                    late_fee_applied=late_fee,
                    discount_applied=discount,
                    amount_due=base_amount,
                    total_due=total,
                    applied_by=applied_by,
                    applied_role=applied_role,
                )
            )

        return overdue_periods

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
                "method_breakdown": payment.method_breakdown,
                "recorded_by": payment.recorded_by,
            },
        )

        if payment.period_key:
            FinancialSnapshotService.remove_payment(db, payment.period_key, amount)

        cls._revert_client_balances(service, client, months_paid)
        cls._revert_service_debt(service, amount, months_paid)

        try:
            db.add(audit_entry)
            db.add(client)
            db.add(service)
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
