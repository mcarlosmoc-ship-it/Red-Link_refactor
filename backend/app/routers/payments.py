"""Router exposing payment related operations."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models.client_service import ClientServiceType
from ..models.payment import PaymentMethod
from ..security import require_admin
from ..services import PaymentService, PaymentServiceError

LOGGER = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_admin)])


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
) -> schemas.OverduePeriodListResponse:
    periods = PaymentService.overdue_periods(
        db,
        client_service_id,
        reference_date=reference_date,
        late_fee_rate=late_fee_rate,
        discount_rate=discount_rate,
    )
    return schemas.OverduePeriodListResponse(items=periods)


@router.get("/", response_model=schemas.ServicePaymentListResponse)
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

    items, total = PaymentService.list_payments(
        db,
        client_id=client_id,
        client_service_id=client_service_id,
        service_type=service_type,
        period_key=period_key,
        start_date=start_date,
        end_date=end_date,
        method=method,
        min_amount=min_amount,
        max_amount=max_amount,
        skip=skip,
        limit=limit,
    )
    return schemas.ServicePaymentListResponse(
        items=items, total=total, limit=limit, skip=skip
    )


@router.post(
    "/",
    response_model=schemas.ServicePaymentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    payment_in: schemas.ServicePaymentCreate, db: Session = Depends(get_db)
) -> schemas.ServicePaymentRead:
    """Record a new payment and update client balances."""
    try:
        payment = PaymentService.create_payment(db, payment_in)
        LOGGER.info(
            "Payment created",
            extra={
                "client_id": payment.client_id,
                "client_service_id": payment.client_service_id,
                "payment_id": payment.id,
            },
        )
        return payment
    except (ValueError, PaymentServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{payment_id}", response_model=schemas.ServicePaymentRead)
def get_payment(payment_id: str, db: Session = Depends(get_db)) -> schemas.ServicePaymentRead:
    payment = PaymentService.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: str, db: Session = Depends(get_db)) -> None:
    payment = PaymentService.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    try:
        PaymentService.delete_payment(db, payment)
    except PaymentServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
