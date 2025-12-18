"""Business logic for managing base IP pools and reservations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional, Tuple

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas


class IpPoolServiceError(RuntimeError):
    """Raised when IP pool operations cannot be completed."""


class IpPoolService:
    """Operations for managing IP pool segments and reservations."""

    @staticmethod
    def _record_history(
        db: Session,
        reservation: models.BaseIpReservation,
        action: models.IpAssignmentAction,
        *,
        previous_status: Optional[str] = None,
        note: Optional[str] = None,
    ) -> None:
        entry = models.IpAssignmentHistory(
            reservation=reservation,
            action=action,
            previous_status=previous_status,
            new_status=reservation.status.value,
            service_id=reservation.service_id,
            client_id=reservation.client_id,
            inventory_item_id=reservation.inventory_item_id,
            note=note,
        )
        db.add(entry)

    @staticmethod
    def list_pools(
        db: Session,
        *,
        base_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.BaseIpPool], int]:
        query = db.query(models.BaseIpPool).options(
            selectinload(models.BaseIpPool.reservations)
        )
        if base_id is not None:
            query = query.filter(models.BaseIpPool.base_id == base_id)

        total = query.count()
        items = (
            query.order_by(models.BaseIpPool.base_id, models.BaseIpPool.label)
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def create_pool(db: Session, data: schemas.BaseIpPoolCreate) -> models.BaseIpPool:
        payload = data.model_dump()
        payload["label"] = payload["label"].strip()
        pool = models.BaseIpPool(**payload)
        db.add(pool)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise IpPoolServiceError(
                "Ya existe un segmento con esa CIDR para la base seleccionada."
            ) from exc
        db.refresh(pool)
        return pool

    @staticmethod
    def update_pool(
        db: Session, pool: models.BaseIpPool, data: schemas.BaseIpPoolUpdate
    ) -> models.BaseIpPool:
        update_data = data.model_dump(exclude_unset=True)
        if update_data.get("label"):
            update_data["label"] = update_data["label"].strip()
        for key, value in update_data.items():
            setattr(pool, key, value)
        try:
            db.add(pool)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo actualizar el segmento.") from exc
        db.refresh(pool)
        return pool

    @staticmethod
    def delete_pool(db: Session, pool: models.BaseIpPool) -> None:
        if pool.reservations:
            raise IpPoolServiceError(
                "No se puede eliminar el segmento porque tiene IPs registradas."
            )
        db.delete(pool)
        db.commit()

    @staticmethod
    def get_pool(db: Session, pool_id: int) -> Optional[models.BaseIpPool]:
        return db.query(models.BaseIpPool).filter(models.BaseIpPool.id == pool_id).first()

    @staticmethod
    def list_reservations(
        db: Session,
        *,
        base_id: Optional[int] = None,
        pool_id: Optional[int] = None,
        status: Optional[models.IpReservationStatus] = None,
        service_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 200,
    ) -> Tuple[Iterable[models.BaseIpReservation], int]:
        query = db.query(models.BaseIpReservation).options(
            selectinload(models.BaseIpReservation.pool),
            selectinload(models.BaseIpReservation.service),
            selectinload(models.BaseIpReservation.inventory_item),
        )
        if base_id is not None:
            query = query.filter(models.BaseIpReservation.base_id == base_id)
        if pool_id is not None:
            query = query.filter(models.BaseIpReservation.pool_id == pool_id)
        if status is not None:
            query = query.filter(models.BaseIpReservation.status == status)
        if service_id:
            query = query.filter(models.BaseIpReservation.service_id == service_id)

        total = query.count()
        items = (
            query.order_by(models.BaseIpReservation.ip_address)
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def create_reservation(
        db: Session, data: schemas.BaseIpReservationCreate
    ) -> models.BaseIpReservation:
        payload = data.model_dump()
        reservation = models.BaseIpReservation(**payload)
        db.add(reservation)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise IpPoolServiceError("La IP ya está registrada para esa base.") from exc
        db.refresh(reservation)
        return reservation

    @staticmethod
    def get_reservation(db: Session, reservation_id: str) -> Optional[models.BaseIpReservation]:
        return (
            db.query(models.BaseIpReservation)
            .options(selectinload(models.BaseIpReservation.service))
            .filter(models.BaseIpReservation.id == reservation_id)
            .first()
        )

    @staticmethod
    def assign_reservation(
        db: Session,
        reservation: models.BaseIpReservation,
        service: models.ClientService,
        *,
        client_id: Optional[str] = None,
        inventory_item_id: Optional[str] = None,
    ) -> models.BaseIpReservation:
        previous_status = reservation.status.value
        reservation.status = models.IpReservationStatus.IN_USE
        reservation.service_id = service.id
        reservation.client_id = client_id or service.client_id
        reservation.inventory_item_id = inventory_item_id or reservation.inventory_item_id
        reservation.assigned_at = datetime.now(timezone.utc)
        reservation.released_at = None
        try:
            db.add(reservation)
            IpPoolService._record_history(
                db,
                reservation,
                models.IpAssignmentAction.ASSIGN,
                previous_status=previous_status,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo asignar la IP.") from exc
        db.refresh(reservation)
        return reservation

    @staticmethod
    def release_reservation(
        db: Session, reservation: models.BaseIpReservation
    ) -> models.BaseIpReservation:
        previous_status = reservation.status.value
        reservation.status = models.IpReservationStatus.QUARANTINE
        reservation.service_id = None
        reservation.client_id = None
        reservation.inventory_item_id = None
        reservation.released_at = datetime.now(timezone.utc)
        try:
            db.add(reservation)
            IpPoolService._record_history(
                db,
                reservation,
                models.IpAssignmentAction.RELEASE,
                previous_status=previous_status,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo liberar la IP.") from exc
        db.refresh(reservation)
        return reservation

    @staticmethod
    def update_reservation(
        db: Session, reservation: models.BaseIpReservation, data: schemas.BaseIpReservationUpdate
    ) -> models.BaseIpReservation:
        update_data = data.model_dump(exclude_unset=True)
        previous_status = reservation.status.value
        new_status = update_data.get("status", reservation.status)

        if "inventory_item_id" in update_data:
            reservation.inventory_item_id = update_data["inventory_item_id"]
        if "service_id" in update_data:
            reservation.service_id = update_data["service_id"]
        if "client_id" in update_data:
            reservation.client_id = update_data["client_id"]
        if "notes" in update_data:
            reservation.notes = update_data["notes"]

        action: Optional[models.IpAssignmentAction] = None
        if "status" in update_data:
            reservation.status = new_status
            if new_status == models.IpReservationStatus.FREE:
                reservation.service_id = None
                reservation.client_id = None
                reservation.inventory_item_id = None
                reservation.assigned_at = None
                reservation.released_at = datetime.now(timezone.utc)
                action = models.IpAssignmentAction.RELEASE
            elif new_status == models.IpReservationStatus.RESERVED:
                reservation.assigned_at = None
                reservation.released_at = None
                action = models.IpAssignmentAction.RESERVE
            elif new_status == models.IpReservationStatus.IN_USE:
                action = models.IpAssignmentAction.ASSIGN
            elif new_status == models.IpReservationStatus.QUARANTINE:
                reservation.released_at = datetime.now(timezone.utc)
                action = models.IpAssignmentAction.QUARANTINE
        try:
            db.add(reservation)
            if previous_status != reservation.status.value:
                IpPoolService._record_history(
                    db,
                    reservation,
                    action or models.IpAssignmentAction.RESERVE,
                    previous_status=previous_status,
                )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo actualizar la IP.") from exc
        db.refresh(reservation)
        return reservation

    @staticmethod
    def delete_reservation(db: Session, reservation: models.BaseIpReservation) -> None:
        db.delete(reservation)
        db.commit()
