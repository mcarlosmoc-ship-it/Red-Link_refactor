"""Business logic for managing base IP pools and reservations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional, Tuple

from sqlalchemy import func
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
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
        source: Optional[str] = None,
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
            actor_id=actor_id,
            actor_role=actor_role,
            source=source,
        )
        db.add(entry)

    @staticmethod
    def _find_available_reservation(
        db: Session,
        *,
        base_id: int,
        pool_id: Optional[int] = None,
    ) -> models.BaseIpReservation:
        query = db.query(models.BaseIpReservation).filter(
            models.BaseIpReservation.base_id == base_id,
            models.BaseIpReservation.status.in_(
                [models.IpReservationStatus.FREE, models.IpReservationStatus.RESERVED]
            ),
        )
        if pool_id:
            query = query.filter(models.BaseIpReservation.pool_id == pool_id)

        reservation = query.order_by(models.BaseIpReservation.ip_address).first()
        if reservation is None:
            raise IpPoolServiceError(
                "No hay IPs disponibles para la base o pool seleccionado."
            )
        return reservation

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
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
        source: Optional[str] = None,
    ) -> models.BaseIpReservation:
        if reservation.status == models.IpReservationStatus.IN_USE and (
            reservation.service_id not in (None, service.id)
        ):
            raise IpPoolServiceError("La IP seleccionada ya está asignada a otro servicio.")

        if reservation.base_id != service.zone_id:
            raise IpPoolServiceError(
                "La IP seleccionada pertenece a una base distinta a la del servicio."
            )

        previous_status = reservation.status.value
        reservation.status = models.IpReservationStatus.IN_USE
        reservation.service_id = service.id
        reservation.client_id = client_id or service.client_id
        reservation.inventory_item_id = inventory_item_id or reservation.inventory_item_id
        reservation.assigned_at = datetime.now(timezone.utc)
        reservation.released_at = None
        service.ip_address = reservation.ip_address
        try:
            db.add(reservation)
            db.add(service)
            IpPoolService._record_history(
                db,
                reservation,
                models.IpAssignmentAction.ASSIGN,
                previous_status=previous_status,
                actor_id=actor_id,
                actor_role=actor_role,
                source=source,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo asignar la IP.") from exc
        db.refresh(reservation)
        db.refresh(service)
        return reservation

    @staticmethod
    def release_reservation(
        db: Session,
        reservation: models.BaseIpReservation,
        *,
        note: Optional[str] = None,
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
        source: Optional[str] = None,
    ) -> models.BaseIpReservation:
        previous_status = reservation.status.value
        linked_service = reservation.service
        reservation.status = models.IpReservationStatus.QUARANTINE
        reservation.service_id = None
        reservation.client_id = None
        reservation.inventory_item_id = None
        reservation.released_at = datetime.now(timezone.utc)
        if linked_service is not None:
            linked_service.ip_address = None
        try:
            db.add(reservation)
            if linked_service is not None:
                db.add(linked_service)
            IpPoolService._record_history(
                db,
                reservation,
                models.IpAssignmentAction.RELEASE,
                previous_status=previous_status,
                note=note,
                actor_id=actor_id,
                actor_role=actor_role,
                source=source,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo liberar la IP.") from exc
        db.refresh(reservation)
        return reservation

    @staticmethod
    def release_quarantined_reservation(
        db: Session,
        reservation: models.BaseIpReservation,
        *,
        note: Optional[str] = None,
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
        source: Optional[str] = None,
    ) -> models.BaseIpReservation:
        if reservation.status != models.IpReservationStatus.QUARANTINE:
            raise IpPoolServiceError("La IP no está en cuarentena.")

        previous_status = reservation.status.value
        reservation.status = models.IpReservationStatus.FREE
        reservation.assigned_at = None
        reservation.released_at = datetime.now(timezone.utc)
        reservation.service_id = None
        reservation.client_id = None
        reservation.inventory_item_id = None
        try:
            db.add(reservation)
            IpPoolService._record_history(
                db,
                reservation,
                models.IpAssignmentAction.RELEASE,
                previous_status=previous_status,
                note=note,
                actor_id=actor_id,
                actor_role=actor_role,
                source=source,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo liberar la IP en cuarentena.") from exc
        db.refresh(reservation)
        return reservation

    @staticmethod
    def acquire_reservation_for_service(
        db: Session,
        *,
        base_id: int,
        pool_id: Optional[int] = None,
    ) -> models.BaseIpReservation:
        return IpPoolService._find_available_reservation(db, base_id=base_id, pool_id=pool_id)

    @staticmethod
    def run_hygiene(
        db: Session,
        *,
        quarantine_grace_hours: int = 24,
    ) -> schemas.IpHygieneRunResult:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=max(quarantine_grace_hours, 0))
        quarantined: list[str] = []
        released: list[str] = []
        freed: list[str] = []

        inconsistent = (
            db.query(models.BaseIpReservation)
            .filter(
                models.BaseIpReservation.status == models.IpReservationStatus.IN_USE,
                models.BaseIpReservation.service_id.is_(None),
            )
            .all()
        )
        for reservation in inconsistent:
            previous_status = reservation.status.value
            reservation.status = models.IpReservationStatus.QUARANTINE
            reservation.released_at = now
            reservation.inventory_item_id = None
            reservation.client_id = None
            IpPoolService._record_history(
                db,
                reservation,
                models.IpAssignmentAction.QUARANTINE,
                previous_status=previous_status,
                note="Liberada por higiene (servicio inexistente)",
                source="hygiene",
            )
            quarantined.append(str(reservation.id))

        db.flush()

        stale_quarantine = (
            db.query(models.BaseIpReservation)
            .filter(models.BaseIpReservation.status == models.IpReservationStatus.QUARANTINE)
            .filter(
                (models.BaseIpReservation.released_at.is_(None))
                | (models.BaseIpReservation.released_at <= cutoff)
            )
            .all()
        )
        for reservation in stale_quarantine:
            previous_status = reservation.status.value
            reservation.status = models.IpReservationStatus.FREE
            reservation.assigned_at = None
            reservation.released_at = now
            reservation.service_id = None
            reservation.inventory_item_id = None
            reservation.client_id = None
            IpPoolService._record_history(
                db,
                reservation,
                models.IpAssignmentAction.RELEASE,
                previous_status=previous_status,
                note="Liberada por higiene",
                source="hygiene",
            )
            freed.append(str(reservation.id))

        try:
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise IpPoolServiceError("No se pudo ejecutar la higiene de IPs.") from exc

        usage_by_pool, usage_by_base = IpPoolService._usage_report(db)
        return schemas.IpHygieneRunResult(
            quarantined=quarantined,
            released=released,
            freed=freed,
            usage_by_pool=usage_by_pool,
            usage_by_base=usage_by_base,
        )

    @staticmethod
    def usage_report(db: Session) -> schemas.IpUsageReport:
        usage_by_pool, usage_by_base = IpPoolService._usage_report(db)
        return schemas.IpUsageReport(
            usage_by_pool=usage_by_pool, usage_by_base=usage_by_base
        )

    @staticmethod
    def summary_by_base(db: Session) -> schemas.IpPoolSummaryResponse:
        rows = (
            db.query(
                models.BaseIpReservation.base_id,
                models.BaseIpReservation.status,
                func.count(models.BaseIpReservation.id),
            )
            .group_by(models.BaseIpReservation.base_id, models.BaseIpReservation.status)
            .all()
        )

        summary: dict[int, dict[str, int]] = {}
        for base_id, status, count in rows:
            stats = summary.setdefault(
                base_id,
                {"total": 0, "free": 0, "reserved": 0, "in_use": 0, "quarantine": 0},
            )
            stats["total"] += count
            stats[status.value] = stats.get(status.value, 0) + count

        items = [
            schemas.IpPoolSummaryItem(
                base_id=base_id,
                total=stats["total"],
                free=stats.get(models.IpReservationStatus.FREE.value, 0),
                reserved=stats.get(models.IpReservationStatus.RESERVED.value, 0),
                in_use=stats.get(models.IpReservationStatus.IN_USE.value, 0),
                quarantine=stats.get(models.IpReservationStatus.QUARANTINE.value, 0),
            )
            for base_id, stats in sorted(summary.items())
        ]
        return schemas.IpPoolSummaryResponse(items=items)

    @staticmethod
    def _usage_report(
        db: Session,
    ) -> tuple[list[schemas.IpUsageBreakdown], list[schemas.IpUsageBreakdown]]:
        pool_rows = (
            db.query(
                models.BaseIpReservation.pool_id,
                models.BaseIpReservation.base_id,
                models.BaseIpPool.label,
                models.BaseIpReservation.status,
                func.count(models.BaseIpReservation.id),
            )
            .join(models.BaseIpPool, models.BaseIpPool.id == models.BaseIpReservation.pool_id, isouter=True)
            .group_by(
                models.BaseIpReservation.pool_id,
                models.BaseIpReservation.base_id,
                models.BaseIpPool.label,
                models.BaseIpReservation.status,
            )
            .all()
        )

        base_rows = (
            db.query(
                models.BaseIpReservation.base_id,
                models.BaseIpReservation.status,
                func.count(models.BaseIpReservation.id),
            )
            .group_by(models.BaseIpReservation.base_id, models.BaseIpReservation.status)
            .all()
        )

        def _collapse(rows, include_pool: bool) -> list[schemas.IpUsageBreakdown]:
            accum: dict[tuple[Optional[int], int], dict[str, int]] = {}
            labels: dict[tuple[Optional[int], int], Optional[str]] = {}
            for row in rows:
                if include_pool:
                    pool_id, base_id, label, status, count = row
                    key = (pool_id, base_id)
                    labels[key] = label
                else:
                    base_id, status, count = row
                    key = (None, base_id)
                stats = accum.setdefault(key, {"total": 0, "free": 0, "reserved": 0, "in_use": 0, "quarantine": 0})
                stats["total"] += count
                stats[status.value] = stats.get(status.value, 0) + count
            breakdown: list[schemas.IpUsageBreakdown] = []
            for key, stats in accum.items():
                pool_id, base_id = key
                breakdown.append(
                    schemas.IpUsageBreakdown(
                        base_id=base_id,
                        pool_id=pool_id,
                        pool_label=labels.get(key) if include_pool else None,
                        total=stats["total"],
                        free=stats.get(models.IpReservationStatus.FREE.value, 0),
                        reserved=stats.get(models.IpReservationStatus.RESERVED.value, 0),
                        in_use=stats.get(models.IpReservationStatus.IN_USE.value, 0),
                        quarantine=stats.get(models.IpReservationStatus.QUARANTINE.value, 0),
                    )
                )
            return sorted(breakdown, key=lambda entry: (entry.base_id, entry.pool_id or 0))

        return _collapse(pool_rows, True), _collapse(base_rows, False)

    @staticmethod
    def update_reservation(
        db: Session,
        reservation: models.BaseIpReservation,
        data: schemas.BaseIpReservationUpdate,
        *,
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
        source: Optional[str] = None,
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
                    actor_id=actor_id,
                    actor_role=actor_role,
                    source=source,
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
