"""Business logic for payment operations."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from math import ceil
from time import perf_counter
from typing import Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from .billing_periods import BillingPeriodService
from .financial_snapshots import FinancialSnapshotService
from .observability import MetricOutcome, ObservabilityService


class PaymentServiceError(RuntimeError):
    """Raised when payment operations cannot be completed."""


@dataclass
class PaymentRecordResult:
    """Result from creating a payment including its impact summary."""

    payment: models.ServicePayment
    summary: schemas.PaymentCaptureSummary


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
    def _balance_snapshot(
        service: models.ClientService, client: models.Client
    ) -> schemas.PaymentBalanceSnapshot:
        monthly_fee = (
            Decimal(service.effective_price)
            if service.effective_price is not None
            else None
        )
        debt_amount = Decimal(service.debt_amount or 0).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        debt_months = Decimal(service.debt_months or 0).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        credit_months = Decimal(client.paid_months_ahead or 0).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        credit_amount = Decimal("0")
        if monthly_fee is not None:
            credit_amount = (monthly_fee * credit_months).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        return schemas.PaymentBalanceSnapshot(
            monthly_fee=monthly_fee,
            debt_amount=debt_amount,
            debt_months=debt_months,
            credit_months=credit_months,
            credit_amount=credit_amount,
        )

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
    def _resolve_service(
        db: Session, service_id: str, *, for_update: bool = False
    ) -> models.ClientService:
        query = (
            db.query(models.ClientService)
            .options(selectinload(models.ClientService.client))
            .options(selectinload(models.ClientService.streaming_account))
            .options(selectinload(models.ClientService.service_plan))
            .filter(models.ClientService.id == service_id)
        )

        if for_update and getattr(getattr(db, "bind", None), "dialect", None):
            if getattr(db.bind.dialect, "supports_for_update", False):
                query = query.with_for_update()

        service = query.first()
        if service is None:
            raise ValueError("Service not found")
        return service

    @classmethod
    def create_payment(
        cls, db: Session, data: schemas.ServicePaymentCreate
    ) -> PaymentRecordResult:
        start = perf_counter()
        tags: dict[str, object] = {
            "client_service_id": data.client_service_id,
            "has_period_key": bool(data.period_key),
            "payment_method": str(data.method.value),
        }

        try:
            service = cls._resolve_service(db, data.client_service_id, for_update=True)
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

            previous_snapshot = cls._balance_snapshot(service, client)

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

            cls._apply_client_balances(service, client, months_paid or Decimal("0"))
            cls._apply_service_debt(service, amount, months_paid)
            cls._update_next_billing(service, payment.paid_on, months_paid, amount)

            coverage = cls._coverage_range(service, payment.paid_on, months_paid)

            resulting_snapshot = cls._balance_snapshot(service, client)
            summary = cls._build_capture_summary(
                previous=previous_snapshot, resulting=resulting_snapshot, coverage=coverage
            )

            if period_key:
                FinancialSnapshotService.apply_payment(db, period_key, amount)

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
                    "previous_balance": cls._encode_balance_snapshot(previous_snapshot),
                    "resulting_balance": cls._encode_balance_snapshot(resulting_snapshot),
                    "coverage_start": str(summary.coverage_start)
                    if summary.coverage_start
                    else None,
                    "coverage_end": str(summary.coverage_end) if summary.coverage_end else None,
                    "period_key": period_key,
                    "client_id": str(client.id),
                    "client_name": client.full_name,
                    "service_id": str(service.id),
                    "service_name": getattr(service.service_plan, "name", None)
                    or getattr(service, "name", None),
                    "monthly_fee": str(service.effective_price)
                    if service.effective_price is not None
                    else None,
                },
            )
            db.add(audit_entry)

            db.commit()
            db.refresh(payment)

            return PaymentRecordResult(payment=payment, summary=summary)
        except ValueError as exc:
            ObservabilityService.record_validation_result(
                db,
                "payments.validation_failed",
                outcome=MetricOutcome.REJECTED,
                reason=str(exc),
                tags=tags,
                duration_ms=(perf_counter() - start) * 1000,
            )
            raise
        except PaymentServiceError as exc:
            ObservabilityService.record_validation_result(
                db,
                "payments.persistence_failed",
                outcome=MetricOutcome.ERROR,
                reason=str(exc),
                tags=tags,
                duration_ms=(perf_counter() - start) * 1000,
            )
            raise
        except SQLAlchemyError as exc:
            db.rollback()
            ObservabilityService.record_validation_result(
                db,
                "payments.persistence_failed",
                outcome=MetricOutcome.ERROR,
                reason=str(exc),
                tags=tags,
                duration_ms=(perf_counter() - start) * 1000,
            )
            raise PaymentServiceError("Unable to record payment at this time.") from exc

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

    @classmethod
    def suggested_charge(
        cls, db: Session, *, client_id: str, service_id: str
    ) -> schemas.PaymentSuggestedAmount:
        service = cls._resolve_service(db, service_id, for_update=True)
        if str(service.client_id) != str(client_id):
            raise ValueError("Service does not belong to the specified client")

        monthly_fee = (
            Decimal(service.effective_price)
            if service.effective_price is not None
            else None
        )
        pending_amount = Decimal(service.debt_amount or 0)
        credit_amount = Decimal("0")
        if monthly_fee is not None:
            credit_amount = Decimal(service.client.paid_months_ahead or 0) * monthly_fee

        suggested = monthly_fee or Decimal("0")
        suggested += pending_amount
        suggested -= credit_amount

        normalized_suggested = cls._normalize_amount(max(suggested, Decimal("0")))
        normalized_pending = cls._normalize_amount(pending_amount)
        normalized_credit = (
            cls._normalize_amount(credit_amount)
            if credit_amount is not None
            else Decimal("0")
        )

        return schemas.PaymentSuggestedAmount(
            client_id=str(service.client_id),
            client_service_id=str(service.id),
            monthly_fee=monthly_fee,
            pending_amount=normalized_pending,
            credit_amount=normalized_credit,
            suggested_amount=normalized_suggested,
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
    def _coverage_range(
        cls, service: models.ClientService, paid_on: date, months_paid: Decimal | None
    ) -> tuple[Optional[date], Optional[date]]:
        if months_paid is None or months_paid <= 0:
            return None, None

        start, _, _ = cls._billing_window(service, paid_on)
        end = cls._add_months(start, months_paid) - timedelta(days=1)
        return start, end

    @staticmethod
    def _build_capture_summary(
        *,
        previous: schemas.PaymentBalanceSnapshot,
        resulting: schemas.PaymentBalanceSnapshot,
        coverage: tuple[Optional[date], Optional[date]],
    ) -> schemas.PaymentCaptureSummary:
        coverage_start, coverage_end = coverage
        return schemas.PaymentCaptureSummary(
            previous=previous,
            resulting=resulting,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
        )

    @staticmethod
    def _encode_balance_snapshot(snapshot: schemas.PaymentBalanceSnapshot) -> dict:
        return {
            "monthly_fee": str(snapshot.monthly_fee)
            if snapshot.monthly_fee is not None
            else None,
            "debt_amount": str(snapshot.debt_amount),
            "debt_months": str(snapshot.debt_months),
            "credit_months": str(snapshot.credit_months),
            "credit_amount": str(snapshot.credit_amount),
        }

    @classmethod
    def _update_next_billing(
        cls,
        service: models.ClientService,
        paid_on: date,
        months_paid: Optional[Decimal],
        amount: Decimal,
    ) -> None:
        has_outstanding_debt = Decimal(service.debt_amount or 0) > 0 or Decimal(
            service.debt_months or 0
        ) > 0

        if has_outstanding_debt:
            return

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
            .options(selectinload(models.ServicePayment.audit_trail))
            .filter(models.ServicePayment.id == payment_id)
            .first()
        )

    @staticmethod
    def build_receipt(payment: models.ServicePayment) -> str:
        """Return an HTML receipt ready for printing."""

        import html as htmllib

        creation_snapshot = None
        for entry in getattr(payment, "audit_trail", []) or []:
            if (
                getattr(entry, "action", None) == models.PaymentAuditAction.CREATED
                and entry.snapshot
            ):
                creation_snapshot = entry.snapshot
                break

        snapshot = creation_snapshot or {}

        def _esc(value: object, fallback: str = "") -> str:
            return htmllib.escape(str(value if value is not None else fallback))

        def _currency(value: object) -> str:
            return f"${Decimal(value or 0):,.2f}"

        client_name = snapshot.get(
            "client_name", getattr(payment.client, "full_name", "Cliente")
        )
        service_name = snapshot.get(
            "service_name",
            getattr(payment.service, "name", None)
            or getattr(getattr(payment, "service", None), "service_plan", None)
            and payment.service.service_plan.name,
        )
        service_name = service_name or "Servicio"
        monthly_fee = snapshot.get("monthly_fee")

        coverage_start = snapshot.get("coverage_start")
        coverage_end = snapshot.get("coverage_end")
        period_key = snapshot.get("period_key") or payment.period_key

        resulting_balance = snapshot.get("resulting_balance") or {}
        pending_amount = Decimal(resulting_balance.get("debt_amount") or 0)
        credit_amount = Decimal(resulting_balance.get("credit_amount") or 0)

        balance_label = "Saldo al corriente"
        if pending_amount > 0:
            balance_label = f"Saldo pendiente: {_currency(pending_amount)}"
        elif credit_amount > 0:
            balance_label = f"Saldo a favor: {_currency(credit_amount)}"

        coverage_label = "Cobertura no especificada"
        if coverage_start and coverage_end:
            coverage_label = f"{coverage_start} a {coverage_end}"

        receipt_title = "Recibo de pago"

        html_content = f"""
<!DOCTYPE html>
<html lang=\"es\">
<head>
  <meta charset=\"utf-8\" />
  <title>{_esc(receipt_title)}</title>
  <style>
    body {{ font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; }}
    .receipt {{ max-width: 520px; margin: 24px auto; padding: 24px; background: white; border-radius: 12px; box-shadow: 0 10px 30px rgba(15,23,42,0.12); }}
    .header {{ display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }}
    .title {{ font-size: 20px; font-weight: 700; }}
    .meta {{ color: #475569; font-size: 13px; }}
    .section {{ margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }}
    .row {{ display: flex; justify-content: space-between; margin: 6px 0; font-size: 14px; }}
    .label {{ color: #475569; }}
    .value {{ font-weight: 600; color: #0f172a; text-align: right; }}
    .highlight {{ font-size: 18px; color: #0f172a; font-weight: 700; }}
  </style>
</head>
<body>
  <div class=\"receipt\">
    <div class=\"header\">
      <div>
        <div class=\"title\">{_esc(receipt_title)}</div>
        <div class=\"meta\">Pago ID: {_esc(payment.id)}</div>
      </div>
      <div class=\"meta\">{_esc(payment.paid_on)}</div>
    </div>

    <div class=\"section\">
      <div class=\"row\"><span class=\"label\">Cliente</span><span class=\"value\">{_esc(client_name)}</span></div>
      <div class=\"row\"><span class=\"label\">Servicio</span><span class=\"value\">{_esc(service_name)}</span></div>
      <div class=\"row\"><span class=\"label\">Periodo</span><span class=\"value\">{_esc(period_key or '—')}</span></div>
    </div>

    <div class=\"section\">
      <div class=\"row\"><span class=\"label\">Monto</span><span class=\"value highlight\">{_currency(payment.amount)}</span></div>
      <div class=\"row\"><span class=\"label\">Método</span><span class=\"value\">{_esc(snapshot.get('method', payment.method))}</span></div>
      <div class=\"row\"><span class=\"label\">Meses cubiertos</span><span class=\"value\">{_esc(payment.months_paid or snapshot.get('months_paid') or 'N/D')}</span></div>
      <div class=\"row\"><span class=\"label\">Cobertura</span><span class=\"value\">{_esc(coverage_label)}</span></div>
      {f"<div class=\\\"row\\\"><span class=\\\"label\\\">Tarifa mensual</span><span class=\\\"value\\\">{_currency(monthly_fee)}</span></div>" if monthly_fee is not None else ''}
    </div>

    <div class=\"section\">
      <div class=\"row\"><span class=\"label\">{_esc(balance_label)}</span><span class=\"value\"></span></div>
      {f"<div class=\\\"row\\\"><span class=\\\"label\\\">Nota</span><span class=\\\"value\\\">{_esc(payment.note)}</span></div>" if payment.note else ''}
    </div>
  </div>
  <script>
    window.onload = () => {{
      window.print();
      setTimeout(() => window.close(), 300);
    }};
  </script>
</body>
</html>
"""

        return html_content

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
