"""Service layer for deferred (scheduled) payments."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Iterable, Optional, Tuple

from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from .payments import PaymentService


class PaymentScheduleServiceError(RuntimeError):
    """Raised when a payment schedule operation cannot be completed."""


class PaymentScheduleService:
    """Operations to create, list and execute deferred payments."""

    @staticmethod
    def list_schedules(
        db: Session,
        *,
        status: Optional[models.PaymentScheduleStatus] = None,
        client_id: Optional[str] = None,
        execute_on_or_after: Optional[date] = None,
        execute_on_or_before: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.PaymentSchedule], int]:
        query = db.query(models.PaymentSchedule).options(
            selectinload(models.PaymentSchedule.client),
            selectinload(models.PaymentSchedule.service),
        )

        if status:
            query = query.filter(models.PaymentSchedule.status == status)
        if client_id:
            query = query.filter(models.PaymentSchedule.client_id == client_id)
        if execute_on_or_after:
            query = query.filter(models.PaymentSchedule.execute_on >= execute_on_or_after)
        if execute_on_or_before:
            query = query.filter(models.PaymentSchedule.execute_on <= execute_on_or_before)

        total = query.count()
        items = (
            query.order_by(models.PaymentSchedule.execute_on.asc(), models.PaymentSchedule.created_at.asc())
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def create_schedule(db: Session, payload: schemas.PaymentScheduleCreate) -> models.PaymentSchedule:
        service = (
            db.query(models.ClientService)
            .options(selectinload(models.ClientService.client))
            .filter(models.ClientService.id == payload.client_service_id)
            .first()
        )
        if service is None:
            raise ValueError("Service not found for deferred payment")

        normalized_amount = PaymentService._normalize_amount(payload.amount)
        normalized_months = PaymentService._normalize_months(payload.months)

        schedule = models.PaymentSchedule(
            client_service_id=service.id,
            client_id=service.client_id,
            execute_on=payload.execute_on,
            amount=normalized_amount,
            months=normalized_months,
            method=payload.method,
            note=payload.note,
            recorded_by=payload.recorded_by,
            status=models.PaymentScheduleStatus.SCHEDULED,
        )
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        return schedule

    @staticmethod
    def execute_schedule(
        db: Session, schedule_id: str, *, paid_on: Optional[date] = None
    ) -> models.PaymentSchedule:
        schedule = db.query(models.PaymentSchedule).get(schedule_id)
        if schedule is None:
            raise ValueError("Payment schedule not found")

        if schedule.status != models.PaymentScheduleStatus.SCHEDULED:
            raise PaymentScheduleServiceError("Solo se pueden ejecutar pagos programados pendientes")

        paid_date = paid_on or schedule.execute_on or date.today()
        payment_payload = schemas.ServicePaymentCreate(
            client_service_id=str(schedule.client_service_id),
            paid_on=paid_date,
            amount=Decimal(schedule.amount),
            months_paid=schedule.months,
            method=schedule.method,
            note=schedule.note,
            recorded_by=schedule.recorded_by if hasattr(schedule, "recorded_by") else None,
        )
        payment = PaymentService.create_payment(db, payment_payload)

        schedule.status = models.PaymentScheduleStatus.EXECUTED
        schedule.executed_at = datetime.utcnow()
        schedule.payment_id = payment.id
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        return schedule

    @staticmethod
    def cancel_schedule(db: Session, schedule_id: str) -> models.PaymentSchedule:
        schedule = db.query(models.PaymentSchedule).get(schedule_id)
        if schedule is None:
            raise ValueError("Payment schedule not found")
        if schedule.status != models.PaymentScheduleStatus.SCHEDULED:
            raise PaymentScheduleServiceError("Solo se pueden cancelar pagos pendientes")

        schedule.status = models.PaymentScheduleStatus.CANCELLED
        schedule.executed_at = datetime.utcnow()
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        return schedule

