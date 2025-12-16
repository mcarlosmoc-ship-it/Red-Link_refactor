"""Router exposing payment related operations."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from .. import models, schemas
from ..database import get_db
from ..models.client_service import ClientServiceType
from ..models.payment import PaymentMethod
from ..security import require_admin
from ..services import BillingPeriodService, PaymentService, PaymentServiceError
from ..services.payment_schedules import (
    PaymentScheduleService,
    PaymentScheduleServiceError,
)

LOGGER = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_admin)])


def _validate_period_key(raw_period: Optional[str]) -> Optional[str]:
    """Normalize and validate a period key.

    Only accepts keys in the YYYY-MM format with a month between 01 and 12.
    Returns a trimmed, normalized key or raises HTTPException 400 when invalid.
    """

    if raw_period is None:
        return None

    sanitized_period = raw_period.strip()
    if not sanitized_period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid period key format, expected YYYY-MM",
        )

    if not BillingPeriodService.VALID_PERIOD_PATTERN.match(sanitized_period):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid period key format, expected YYYY-MM",
        )

    try:
        normalized_period, _, _ = BillingPeriodService._normalize_period(
            sanitized_period
        )
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid period key format, expected YYYY-MM",
        ) from exc

    return normalized_period


def _parse_period_range(raw_period: Optional[str]) -> tuple[Optional[str], Optional[date], Optional[date]]:
    """Convert a YYYY-MM string into an inclusive month range.

    Returns ``(normalized_key, month_start, month_end)`` or ``(None, None, None)``
    when the input is missing. Raises ``HTTPException`` with a 400 status code
    when the format is invalid.
    """

    normalized_period = _validate_period_key(raw_period)
    if normalized_period is None:
        return None, None, None

    _, month_start, month_end = BillingPeriodService._normalize_period(normalized_period)
    return normalized_period, month_start, month_end


@router.get(
    "/periods/status",
    response_model=schemas.ServicePeriodStatusListResponse,
    summary="Estatus de mensualidades vigentes",
)
def list_current_period_status(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Query(None, description="Filtrar por cliente"),
    client_service_id: Optional[str] = Query(
        None, description="Filtrar por servicio específico"
    ),
    reference_date: Optional[date] = Query(
        None, description="Fecha de referencia para calcular el estado"
    ),
) -> schemas.ServicePeriodStatusListResponse:
    statuses = PaymentService.current_period_statuses(
        db,
        client_id=client_id,
        service_id=client_service_id,
        reference_date=reference_date,
    )
    return schemas.ServicePeriodStatusListResponse(items=statuses, total=len(statuses))


@router.get(
    "/periods/overdue",
    response_model=schemas.OverduePeriodListResponse,
    summary="Periodos vencidos con recargos/bonificaciones",
)
def list_overdue_periods(
    client_service_id: str = Query(..., description="Servicio para calcular adeudos"),
    db: Session = Depends(get_db),
    reference_date: Optional[date] = Query(
        None, description="Fecha de referencia para la deuda"
    ),
    late_fee_rate: Decimal = Query(
        Decimal("0"), ge=0, description="Porcentaje de recargo por mora (0.05 = 5%)"
    ),
    discount_rate: Decimal = Query(
        Decimal("0"), ge=0, description="Descuento por rol o promoción (0.10 = 10%)"
    ),
    applied_by: Optional[str] = Query(
        None, description="Usuario o rol que aplica ajustes"
    ),
    applied_role: Optional[str] = Query(
        None, description="Rol asociado a recargos/bonificaciones"
    ),
) -> schemas.OverduePeriodListResponse:
    periods = PaymentService.overdue_periods(
        db,
        client_service_id,
        reference_date=reference_date,
        late_fee_rate=late_fee_rate,
        discount_rate=discount_rate,
        applied_by=applied_by,
        applied_role=applied_role,
    )
    return schemas.OverduePeriodListResponse(items=periods)


@router.get(
    "/duplicates/check",
    response_model=schemas.PaymentDuplicateCheck,
    summary="Verifica si existe un pago registrado para el periodo",
)
def validate_duplicate_payment(
    client_service_id: str = Query(..., description="Servicio a validar"),
    period_key: str = Query(..., description="Periodo de facturación"),
    db: Session = Depends(get_db),
) -> schemas.PaymentDuplicateCheck:
    exists = PaymentService.has_duplicate_payment(db, client_service_id, period_key)
    return schemas.PaymentDuplicateCheck(
        client_service_id=client_service_id, period_key=period_key, exists=exists
    )


@router.get("", response_model=schemas.ServicePaymentListResponse)
def list_payments(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Query(None, description="Filter by client identifier"),
    client_service_id: Optional[str] = Query(
        None, description="Filter by the specific client service"
    ),
    service_type: Optional[ClientServiceType] = Query(
        None, description="Filter by service type"
    ),
    period_key: Optional[str] = Query(None, description="Filter by billing period"),
    start_date: Optional[date] = Query(None, description="Return payments on or after this date"),
    end_date: Optional[date] = Query(None, description="Return payments on or before this date"),
    period: Optional[str] = Query(
        None, description="Filter payments by paid_on month using YYYY-MM"
    ),
    method: Optional[PaymentMethod] = Query(None, description="Filter by payment method"),
    min_amount: Optional[Decimal] = Query(None, ge=0, description="Minimum amount threshold"),
    max_amount: Optional[Decimal] = Query(None, ge=0, description="Maximum amount threshold"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of records to return"),
) -> schemas.ServicePaymentListResponse:
    """Return payments with pagination and advanced filters."""

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

    try:
        normalized_period = _validate_period_key(period_key)
    except HTTPException as exc:
        LOGGER.warning(
            "Rejecting payments request due to invalid period_key",  # pragma: no cover - logging
            extra={"period_key": period_key},
        )
        raise exc

    try:
        _, month_start, month_end = _parse_period_range(period or period_key)
    except HTTPException as exc:
        LOGGER.warning(
            "Rejecting payments request due to invalid period",  # pragma: no cover - logging
            extra={"period": period, "period_key": period_key},
        )
        raise exc

    if period is not None and (start_date is not None or end_date is not None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot combine period with explicit start_date or end_date",
        )

    if month_start and month_end:
        start_date = month_start
        end_date = month_end

    try:
        items, total = PaymentService.list_payments(
            db,
            client_id=client_id,
            client_service_id=client_service_id,
            service_type=service_type,
            period_key=normalized_period,
            start_date=start_date,
            end_date=end_date,
            method=method,
            min_amount=min_amount,
            max_amount=max_amount,
            skip=skip,
            limit=limit,
        )
    except (PaymentServiceError, SQLAlchemyError) as exc:
        LOGGER.exception(
            "Failed to list payments",
            exc_info=exc,
            extra={
                "period_key": normalized_period,
                "period_range": period,
                "start_date": str(start_date) if start_date else None,
                "end_date": str(end_date) if end_date else None,
                "limit": limit,
                "skip": skip,
            },
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "No se pudieron cargar los pagos. Inténtalo de nuevo más tarde."},
        )
    except Exception as exc:  # pragma: no cover - defensive
        LOGGER.exception("Unexpected failure listing payments", exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "No se pudieron cargar los pagos. Inténtalo de nuevo más tarde."},
        )
    return schemas.ServicePaymentListResponse(
        items=items, total=total, limit=limit, skip=skip
    )


@router.post(
    "",
    response_model=schemas.ServicePaymentWithSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    payment_in: schemas.ServicePaymentCreate, db: Session = Depends(get_db)
) -> schemas.ServicePaymentWithSummary:
    """Record a new payment and update client balances."""
    try:
        result = PaymentService.create_payment(db, payment_in)
        LOGGER.info(
            "Payment created",
            extra={
                "client_id": result.payment.client_id,
                "client_service_id": result.payment.client_service_id,
                "payment_id": result.payment.id,
            },
        )
        payment_payload = schemas.ServicePaymentRead.model_validate(result.payment).model_dump()
        return schemas.ServicePaymentWithSummary(
            **payment_payload, summary=result.summary
        )
    except (ValueError, PaymentServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{payment_id}", response_model=schemas.ServicePaymentRead)
def get_payment(payment_id: str, db: Session = Depends(get_db)) -> schemas.ServicePaymentRead:
    payment = PaymentService.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


@router.get(
    "/{payment_id}/receipt",
    response_class=HTMLResponse,
    summary="Recibo imprimible del pago",
)
def print_receipt(payment_id: str, db: Session = Depends(get_db)):
    payment = PaymentService.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    receipt = PaymentService.build_receipt(payment)
    return HTMLResponse(content=receipt)


@router.get("/schedules", response_model=schemas.PaymentScheduleListResponse)
def list_payment_schedules(
    db: Session = Depends(get_db),
    status: Optional[models.PaymentScheduleStatus] = Query(None, description="Filtrar por estatus"),
    client_id: Optional[str] = Query(None, description="Cliente asociado"),
    execute_on_or_after: Optional[date] = Query(None, description="Fecha mínima programada"),
    execute_on_or_before: Optional[date] = Query(None, description="Fecha máxima programada"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> schemas.PaymentScheduleListResponse:
    items, total = PaymentScheduleService.list_schedules(
        db,
        status=status,
        client_id=client_id,
        execute_on_or_after=execute_on_or_after,
        execute_on_or_before=execute_on_or_before,
        skip=skip,
        limit=limit,
    )
    return schemas.PaymentScheduleListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post(
    "/schedules",
    response_model=schemas.PaymentScheduleRead,
    status_code=status.HTTP_201_CREATED,
    summary="Programar cobro diferido",
)
def create_payment_schedule(
    payload: schemas.PaymentScheduleCreate, db: Session = Depends(get_db)
) -> schemas.PaymentScheduleRead:
    try:
        schedule = PaymentScheduleService.create_schedule(db, payload)
        return schedule
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except SQLAlchemyError as exc:  # pragma: no cover - defensive
        LOGGER.exception("Failed to create payment schedule", exc_info=exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo programar el pago diferido.",
        ) from exc


@router.post(
    "/schedules/{schedule_id}/execute",
    response_model=schemas.PaymentScheduleRead,
    summary="Ejecutar pago diferido",
)
def execute_payment_schedule(
    schedule_id: str,
    paid_on: Optional[date] = Query(None, description="Fecha efectiva del pago"),
    db: Session = Depends(get_db),
) -> schemas.PaymentScheduleRead:
    try:
        schedule = PaymentScheduleService.execute_schedule(db, schedule_id, paid_on=paid_on)
        return schedule
    except (ValueError, PaymentScheduleServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/schedules/{schedule_id}/cancel",
    response_model=schemas.PaymentScheduleRead,
    summary="Cancelar pago diferido",
)
def cancel_payment_schedule(schedule_id: str, db: Session = Depends(get_db)) -> schemas.PaymentScheduleRead:
    try:
        schedule = PaymentScheduleService.cancel_schedule(db, schedule_id)
        return schedule
    except (ValueError, PaymentScheduleServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: str, db: Session = Depends(get_db)) -> None:
    payment = PaymentService.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    try:
        PaymentService.delete_payment(db, payment)
    except PaymentServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
