"""Router exposing payment related operations."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..services import PaymentService

router = APIRouter()


@router.get("/", response_model=List[schemas.PaymentRead])
def list_payments(
    client_id: Optional[str] = Query(default=None, description="Filter by client identifier"),
    period_key: Optional[str] = Query(default=None, description="Filter by billing period"),
    db: Session = Depends(get_db),
) -> List[schemas.PaymentRead]:
    """Return payments optionally filtered by client or period."""
    return list(PaymentService.list_payments(db, client_id=client_id, period_key=period_key))


@router.post("/", response_model=schemas.PaymentRead, status_code=status.HTTP_201_CREATED)
def create_payment(payment_in: schemas.PaymentCreate, db: Session = Depends(get_db)) -> schemas.PaymentRead:
    """Record a new payment and update client balances."""
    try:
        return PaymentService.create_payment(db, payment_in)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{payment_id}", response_model=schemas.PaymentRead)
def get_payment(payment_id: str, db: Session = Depends(get_db)) -> schemas.PaymentRead:
    payment = PaymentService.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: str, db: Session = Depends(get_db)) -> None:
    payment = PaymentService.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    PaymentService.delete_payment(db, payment)
