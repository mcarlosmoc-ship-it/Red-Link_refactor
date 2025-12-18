"""Router exposing operations for IP pools and reservations."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models.ip_pool import IpReservationStatus
from ..security import require_admin
from ..services import (
    ClientContractService,
    IpPoolService,
    IpPoolServiceError,
)

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("", response_model=schemas.BaseIpPoolListResponse)
def list_pools(
    db: Session = Depends(get_db),
    base_id: Optional[int] = Query(None, description="Filter by base"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> schemas.BaseIpPoolListResponse:
    items, total = IpPoolService.list_pools(db, base_id=base_id, skip=skip, limit=limit)
    return schemas.BaseIpPoolListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post("", response_model=schemas.BaseIpPoolRead, status_code=status.HTTP_201_CREATED)
def create_pool(
    payload: schemas.BaseIpPoolCreate, db: Session = Depends(get_db)
) -> schemas.BaseIpPoolRead:
    try:
        return IpPoolService.create_pool(db, payload)
    except IpPoolServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/{pool_id}", response_model=schemas.BaseIpPoolRead)
def update_pool(
    pool_id: int,
    payload: schemas.BaseIpPoolUpdate,
    db: Session = Depends(get_db),
) -> schemas.BaseIpPoolRead:
    pool = IpPoolService.get_pool(db, pool_id)
    if pool is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    try:
        return IpPoolService.update_pool(db, pool, payload)
    except IpPoolServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{pool_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pool(pool_id: int, db: Session = Depends(get_db)) -> None:
    pool = IpPoolService.get_pool(db, pool_id)
    if pool is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found")
    try:
        IpPoolService.delete_pool(db, pool)
    except IpPoolServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/reservations", response_model=schemas.BaseIpReservationListResponse)
def list_reservations(
    db: Session = Depends(get_db),
    base_id: Optional[int] = Query(None, description="Filter by base"),
    pool_id: Optional[int] = Query(None, description="Filter by pool"),
    status: Optional[IpReservationStatus] = Query(None, description="Filter by status"),
    service_id: Optional[str] = Query(None, description="Filter by client service"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> schemas.BaseIpReservationListResponse:
    items, total = IpPoolService.list_reservations(
        db,
        base_id=base_id,
        pool_id=pool_id,
        status=status,
        service_id=service_id,
        skip=skip,
        limit=limit,
    )
    return schemas.BaseIpReservationListResponse(
        items=items,
        total=total,
        limit=limit,
        skip=skip,
    )


@router.post(
    "/reservations",
    response_model=schemas.BaseIpReservationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_reservation(
    payload: schemas.BaseIpReservationCreate, db: Session = Depends(get_db)
) -> schemas.BaseIpReservationRead:
    try:
        return IpPoolService.create_reservation(db, payload)
    except IpPoolServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/reservations/{reservation_id}", response_model=schemas.BaseIpReservationRead)
def update_reservation(
    reservation_id: str,
    payload: schemas.BaseIpReservationUpdate,
    db: Session = Depends(get_db),
) -> schemas.BaseIpReservationRead:
    reservation = IpPoolService.get_reservation(db, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    try:
        return IpPoolService.update_reservation(db, reservation, payload)
    except IpPoolServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/reservations/{reservation_id}/assign", response_model=schemas.BaseIpReservationRead)
def assign_reservation(
    reservation_id: str,
    *,
    client_service_id: str,
    inventory_item_id: Optional[str] = None,
    db: Session = Depends(get_db),
) -> schemas.BaseIpReservationRead:
    reservation = IpPoolService.get_reservation(db, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    service = ClientContractService.get_service(db, client_service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    try:
        return IpPoolService.assign_reservation(
            db, reservation, service, inventory_item_id=inventory_item_id
        )
    except IpPoolServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/reservations/{reservation_id}/release", response_model=schemas.BaseIpReservationRead)
def release_reservation(
    reservation_id: str, db: Session = Depends(get_db)
) -> schemas.BaseIpReservationRead:
    reservation = IpPoolService.get_reservation(db, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    try:
        return IpPoolService.release_reservation(db, reservation)
    except IpPoolServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: str, db: Session = Depends(get_db)) -> None:
    reservation = IpPoolService.get_reservation(db, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    IpPoolService.delete_reservation(db, reservation)
