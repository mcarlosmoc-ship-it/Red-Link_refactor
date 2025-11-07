"""Router exposing reseller, delivery and settlement operations."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..security import require_admin
from ..services import ResellerService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/", response_model=List[schemas.ResellerRead])
def list_resellers(db: Session = Depends(get_db)) -> List[schemas.ResellerRead]:
    return list(ResellerService.list_resellers(db))


@router.post("/", response_model=schemas.ResellerRead, status_code=status.HTTP_201_CREATED)
def create_reseller(reseller_in: schemas.ResellerCreate, db: Session = Depends(get_db)) -> schemas.ResellerRead:
    return ResellerService.create_reseller(db, reseller_in)


@router.post("/{reseller_id}/deliveries", response_model=schemas.ResellerDeliveryRead, status_code=status.HTTP_201_CREATED)
def record_delivery(
    reseller_id: str,
    delivery_in: schemas.ResellerDeliveryCreate,
    db: Session = Depends(get_db),
) -> schemas.ResellerDeliveryRead:
    if delivery_in.reseller_id != reseller_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload reseller_id does not match resource path",
        )
    return ResellerService.record_delivery(db, delivery_in)


@router.post("/{reseller_id}/settlements", response_model=schemas.ResellerSettlementRead, status_code=status.HTTP_201_CREATED)
def record_settlement(
    reseller_id: str,
    settlement_in: schemas.ResellerSettlementCreate,
    db: Session = Depends(get_db),
) -> schemas.ResellerSettlementRead:
    if settlement_in.reseller_id != reseller_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload reseller_id does not match resource path",
        )
    return ResellerService.record_settlement(db, settlement_in)


@router.delete("/{reseller_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reseller(reseller_id: str, db: Session = Depends(get_db)) -> None:
    reseller = ResellerService.get_reseller(db, reseller_id)
    if reseller is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reseller not found")
    ResellerService.delete_reseller(db, reseller)
