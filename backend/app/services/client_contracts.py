"""Business logic for managing client service contracts."""

from __future__ import annotations

from datetime import date
from typing import Iterable, Optional, Tuple

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas


class ClientContractError(RuntimeError):
    """Raised when service contract operations cannot be completed."""


class ClientContractService:
    """Operations to manage `ClientService` resources."""

    @staticmethod
    def list_services(
        db: Session,
        *,
        client_id: Optional[str] = None,
        service_type: Optional[models.ClientServiceType] = None,
        status: Optional[models.ClientServiceStatus] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.ClientService], int]:
        query = db.query(models.ClientService).options(
            selectinload(models.ClientService.client),
            selectinload(models.ClientService.payments),
        )

        if client_id:
            query = query.filter(models.ClientService.client_id == client_id)
        if service_type:
            query = query.filter(models.ClientService.service_type == service_type)
        if status:
            query = query.filter(models.ClientService.status == status)

        total = query.count()
        items = (
            query.order_by(models.ClientService.created_at.desc())
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def get_service(db: Session, service_id: str) -> Optional[models.ClientService]:
        return (
            db.query(models.ClientService)
            .options(
                selectinload(models.ClientService.client),
                selectinload(models.ClientService.payments),
            )
            .filter(models.ClientService.id == service_id)
            .first()
        )

    @staticmethod
    def _resolve_client(db: Session, client_id: str) -> models.Client:
        client = db.query(models.Client).filter(models.Client.id == client_id).first()
        if client is None:
            raise ValueError("Client not found")
        return client

    @staticmethod
    def _normalize_payload(
        data: schemas.ClientServiceCreate | schemas.ClientServiceUpdate,
        *,
        client: Optional[models.Client] = None,
    ) -> dict:
        payload = data.model_dump(exclude_unset=True)
        if "display_name" in payload and payload["display_name"]:
            payload["display_name"] = payload["display_name"].strip()
        if not payload.get("currency"):
            payload["currency"] = "MXN"
        if client and payload.get("base_id") is None:
            payload["base_id"] = client.base_id
        return payload

    @classmethod
    def create_service(
        cls, db: Session, data: schemas.ClientServiceCreate
    ) -> models.ClientService:
        client = cls._resolve_client(db, data.client_id)
        payload = cls._normalize_payload(data, client=client)
        payload["client_id"] = client.id

        if payload.get("next_billing_date") is None and payload.get("billing_day"):
            payload["next_billing_date"] = cls._compute_next_billing_date(payload["billing_day"])

        service = models.ClientService(**payload)

        db.add(service)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ClientContractError("Ya existe un servicio con ese nombre para el cliente.") from exc
        db.refresh(service)
        return service

    @classmethod
    def update_service(
        cls, db: Session, service: models.ClientService, data: schemas.ClientServiceUpdate
    ) -> models.ClientService:
        update_data = cls._normalize_payload(data, client=service.client)

        if update_data.get("billing_day") and not update_data.get("next_billing_date"):
            update_data["next_billing_date"] = cls._compute_next_billing_date(
                update_data["billing_day"], base_date=service.next_billing_date
            )

        for key, value in update_data.items():
            setattr(service, key, value)

        try:
            db.add(service)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise ClientContractError("No se pudo actualizar el servicio.") from exc

        db.refresh(service)
        return service

    @staticmethod
    def delete_service(db: Session, service: models.ClientService) -> None:
        db.delete(service)
        db.commit()

    @staticmethod
    def _compute_next_billing_date(billing_day: int, base_date: Optional[date] = None) -> date:
        today = base_date or date.today()
        target_month = today.month
        target_year = today.year
        if today.day > billing_day:
            if target_month == 12:
                target_year += 1
                target_month = 1
            else:
                target_month += 1
        last_day = ClientContractService._last_day_of_month(target_year, target_month)
        return date(target_year, target_month, min(billing_day, last_day))

    @staticmethod
    def _last_day_of_month(year: int, month: int) -> int:
        if month == 12:
            return 31
        next_month = date(year, month + 1, 1)
        return (next_month - date.resolution).day
