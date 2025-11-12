"""Business logic for managing client service contracts."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Dict, Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas


class ClientContractError(RuntimeError):
    """Raised when service contract operations cannot be completed."""

    def __init__(self, message: str, *, detail: Optional[object] = None) -> None:
        super().__init__(message)
        self.detail = detail if detail is not None else message


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
            selectinload(models.ClientService.service_plan),
        )

        if client_id:
            query = query.filter(models.ClientService.client_id == client_id)
        if service_type:
            query = query.join(models.ServicePlan).filter(
                models.ServicePlan.category == service_type
            )
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
                selectinload(models.ClientService.service_plan),
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
    def _resolve_service_plan(db: Session, plan_id: int) -> models.ServicePlan:
        plan = db.query(models.ServicePlan).filter(models.ServicePlan.id == plan_id).first()
        if plan is None:
            raise ValueError("Service plan not found")
        if plan.status != models.ServicePlanStatus.ACTIVE:
            raise ValueError("Service plan is inactive")
        return plan

    @classmethod
    def _normalize_payload(
        cls,
        db: Session,
        data: schemas.ClientServiceCreate | schemas.ClientServiceUpdate,
        *,
        client: Optional[models.Client] = None,
        existing: Optional[models.ClientService] = None,
    ) -> tuple[dict, models.ServicePlan, Decimal]:
        payload = data.model_dump(exclude_unset=True, by_alias=True)
        if existing is not None:
            client = client or existing.client

        plan: Optional[models.ServicePlan] = None
        service_identifier = payload.pop("service_id", None)
        if service_identifier is not None:
            plan = cls._resolve_service_plan(db, int(service_identifier))
            payload["service_plan_id"] = plan.id
        elif existing and existing.service_plan is not None:
            plan = existing.service_plan
            payload["service_plan_id"] = existing.service_plan.id
        else:
            raise ValueError("Service plan not found")

        if plan is None:
            raise ValueError("Service plan not found")

        if payload.get("status") is None and existing is None:
            payload["status"] = models.ClientServiceStatus.ACTIVE

        if client and payload.get("base_id") is None and plan.requires_base:
            payload["base_id"] = client.base_id

        if plan.requires_base and payload.get("base_id") is None:
            raise ClientContractError("Este servicio requiere asignar una base.")

        if plan.requires_ip:
            if not payload.get("ip_address"):
                inferred_ip = None
                if existing and existing.ip_address:
                    inferred_ip = existing.ip_address
                elif client and client.ip_address:
                    inferred_ip = client.ip_address
                if inferred_ip:
                    payload.setdefault("ip_address", inferred_ip)
            if not payload.get("ip_address"):
                raise ClientContractError("Este servicio requiere asignar una dirección IP.")

        plan_monthly_price = (
            Decimal(str(plan.monthly_price))
            if plan.monthly_price is not None
            else Decimal("0")
        )
        effective_price = plan_monthly_price

        if payload.get("custom_price") is not None:
            custom_price = Decimal(str(payload["custom_price"]))
            if custom_price < 0:
                raise ClientContractError("El precio personalizado no puede ser negativo.")
            if custom_price == plan.monthly_price:
                payload["custom_price"] = None
                effective_price = plan_monthly_price
            else:
                payload["custom_price"] = custom_price
                effective_price = custom_price
        else:
            payload["custom_price"] = None

        if effective_price <= Decimal("0"):
            payload["billing_day"] = None
            payload.pop("next_billing_date", None)
            payload["next_billing_date"] = None

        return payload, plan, effective_price

    @staticmethod
    def _validate_capacity(
        db: Session,
        plan: models.ServicePlan,
        status: models.ClientServiceStatus,
        *,
        exclude_service_id: Optional[str] = None,
    ) -> None:
        if plan.capacity_type != models.CapacityType.LIMITED:
            return
        limit = plan.capacity_limit or 0
        if limit <= 0:
            raise ClientContractError("El plan no tiene cupos configurados correctamente.")

        query = db.query(func.count(models.ClientService.id)).filter(
            models.ClientService.service_plan_id == plan.id,
            models.ClientService.status == models.ClientServiceStatus.ACTIVE,
        )
        if exclude_service_id:
            query = query.filter(models.ClientService.id != exclude_service_id)

        active_count = query.scalar() or 0
        if status == models.ClientServiceStatus.ACTIVE and active_count >= limit:
            raise ClientContractError("No hay cupos disponibles para este servicio.")

    @classmethod
    def create_service(
        cls, db: Session, data: schemas.ClientServiceCreate
    ) -> models.ClientService:
        client = cls._resolve_client(db, data.client_id)
        payload, plan, effective_price = cls._normalize_payload(db, data, client=client)
        payload["client_id"] = client.id

        if (
            effective_price > Decimal("0")
            and payload.get("next_billing_date") is None
            and payload.get("billing_day")
        ):
            payload["next_billing_date"] = cls._compute_next_billing_date(payload["billing_day"])

        status = payload.get("status", models.ClientServiceStatus.ACTIVE)
        cls._validate_capacity(db, plan, status)

        service = models.ClientService(**payload)

        db.add(service)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ClientContractError(
                "El cliente ya tiene un servicio activo con ese plan."
            ) from exc
        db.refresh(service)
        return service

    @classmethod
    def bulk_create_services(
        cls, db: Session, data: schemas.ClientServiceBulkCreate
    ) -> list[models.ClientService]:
        if not data.client_ids:
            raise ClientContractError("Selecciona al menos un cliente.")

        unique_client_ids: list[str] = []
        seen = set()
        for client_id in data.client_ids:
            normalized = str(client_id)
            if normalized in seen:
                continue
            seen.add(normalized)
            unique_client_ids.append(normalized)

        plan = cls._resolve_service_plan(db, data.service_id)
        target_status = data.status or models.ClientServiceStatus.ACTIVE

        clients_cache: Dict[str, models.Client] = {}

        def _get_client(client_id: str) -> models.Client:
            normalized = str(client_id)
            cached = clients_cache.get(normalized)
            if cached is not None:
                return cached
            client = cls._resolve_client(db, normalized)
            clients_cache[normalized] = client
            return client

        active_assignments = (
            len(unique_client_ids)
            if target_status == models.ClientServiceStatus.ACTIVE
            else 0
        )

        if plan.capacity_type == models.CapacityType.LIMITED:
            current_active = (
                db.query(func.count(models.ClientService.id))
                .filter(
                    models.ClientService.service_plan_id == plan.id,
                    models.ClientService.status == models.ClientServiceStatus.ACTIVE,
                )
                .scalar()
                or 0
            )
            capacity_limit = plan.capacity_limit or 0
            available = capacity_limit - current_active
            if available < 0:
                available = 0

            if target_status == models.ClientServiceStatus.ACTIVE and available < active_assignments:
                overflow_ids = (
                    unique_client_ids if available <= 0 else unique_client_ids[available:]
                )
                failed_clients = []
                for overflow_id in overflow_ids:
                    try:
                        client = _get_client(overflow_id)
                    except ValueError:
                        continue
                    failed_clients.append(
                        {
                            "id": str(client.id),
                            "name": client.full_name,
                        }
                    )

                slot_label = "cupo" if available == 1 else "cupos"
                message = (
                    "No hay cupos disponibles para este servicio."
                    if available <= 0
                    else (
                        f"Solo hay {available} {slot_label} disponible(s) para este plan. "
                        "No se pudo asignar el servicio a todos los clientes seleccionados."
                    )
                )

                detail = {
                    "code": "capacity_limit_exceeded",
                    "message": message,
                    "available_slots": available,
                    "requested_assignments": active_assignments,
                    "capacity_limit": capacity_limit,
                    "failed_clients": failed_clients,
                }

                raise ClientContractError(message, detail=detail)

        created: list[models.ClientService] = []
        base_payload = data.model_dump(
            exclude={"client_ids"}, by_alias=True, exclude_none=True
        )

        try:
            for client_id in unique_client_ids:
                client = _get_client(client_id)

                create_payload = schemas.ClientServiceCreate(
                    client_id=client_id,
                    **base_payload,
                )
                payload, normalized_plan, effective_price = cls._normalize_payload(
                    db, create_payload, client=client
                )
                status = payload.get("status", models.ClientServiceStatus.ACTIVE)

                cls._validate_capacity(
                    db,
                    normalized_plan,
                    status,
                )

                existing_service = (
                    db.query(models.ClientService)
                    .filter(
                        models.ClientService.client_id == client.id,
                        models.ClientService.service_plan_id
                        == normalized_plan.id,
                        models.ClientService.status
                        != models.ClientServiceStatus.CANCELLED,
                    )
                    .first()
                )
                if existing_service is not None:
                    raise ClientContractError(
                        f"{client.full_name} ya tiene este servicio asignado."
                    )

                payload["client_id"] = client.id
                if effective_price <= Decimal("0"):
                    payload.pop("next_billing_date", None)
                service = models.ClientService(**payload)
                db.add(service)
                created.append(service)

            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ClientContractError(
                "No se pudieron asignar los servicios masivamente."
            ) from exc
        except SQLAlchemyError as exc:
            db.rollback()
            raise ClientContractError(
                "No se pudieron asignar los servicios masivamente."
            ) from exc

        for service in created:
            db.refresh(service)
        return created

    @classmethod
    def update_service(
        cls, db: Session, service: models.ClientService, data: schemas.ClientServiceUpdate
    ) -> models.ClientService:
        update_data, plan, effective_price = cls._normalize_payload(
            db, data, client=service.client, existing=service
        )

        status = update_data.get("status", service.status)
        cls._validate_capacity(db, plan, status, exclude_service_id=str(service.id))

        if (
            effective_price > Decimal("0")
            and update_data.get("billing_day")
            and not update_data.get("next_billing_date")
        ):
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
