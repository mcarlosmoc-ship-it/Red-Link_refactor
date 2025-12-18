"""Business logic for managing client service contracts."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from .ip_pools import IpPoolService, IpPoolServiceError
from .observability import MetricOutcome, ObservabilityService


DEFAULT_PLAN_REQUIREMENTS: dict[models.ClientServiceType, dict[str, bool]] = {
    models.ClientServiceType.INTERNET: {
        "requires_ip": True,
        "requires_base": True,
        "requires_credentials": False,
        "requires_equipment": False,
    },
    models.ClientServiceType.HOTSPOT: {
        "requires_ip": True,
        "requires_base": True,
        "requires_credentials": False,
        "requires_equipment": False,
    },
    models.ClientServiceType.STREAMING: {
        "requires_ip": False,
        "requires_base": False,
        "requires_credentials": True,
        "requires_equipment": False,
    },
    models.ClientServiceType.POINT_OF_SALE: {
        "requires_ip": False,
        "requires_base": False,
        "requires_credentials": False,
        "requires_equipment": False,
    },
    models.ClientServiceType.OTHER: {
        "requires_ip": False,
        "requires_base": False,
        "requires_credentials": False,
        "requires_equipment": False,
    },
}


def _resolve_plan_requirements(
    plan: models.ServicePlan, service_metadata: Optional[dict[str, object]] = None
) -> dict[str, bool]:
    metadata = service_metadata or {}

    def _from_metadata(keys: list[str]) -> Optional[bool]:
        for key in keys:
            value = metadata.get(key)
            if isinstance(value, bool):
                return value
        return None

    defaults = DEFAULT_PLAN_REQUIREMENTS.get(
        plan.category, DEFAULT_PLAN_REQUIREMENTS[models.ClientServiceType.OTHER]
    )

    requires_ip = _from_metadata(["requires_ip", "requiresIp"])
    requires_base = _from_metadata(["requires_base", "requiresBase"])
    requires_credentials = _from_metadata(
        ["requires_credentials", "requiresCredentials", "requireCredentials"]
    )
    requires_equipment = _from_metadata(
        ["requires_equipment", "requiresEquipment", "requireEquipment"]
    )

    if requires_ip is None:
        requires_ip = plan.requires_ip
    if requires_base is None:
        requires_base = plan.requires_base
    if requires_credentials is None:
        requires_credentials = defaults["requires_credentials"]
    if requires_equipment is None:
        requires_equipment = defaults["requires_equipment"]

    return {
        "requires_ip": requires_ip,
        "requires_base": requires_base,
        "requires_credentials": requires_credentials,
        "requires_equipment": requires_equipment,
    }


class ClientContractError(RuntimeError):
    """Raised when service contract operations cannot be completed."""

    def __init__(self, message: str, *, detail: Optional[object] = None) -> None:
        super().__init__(message)
        self.detail = detail if detail is not None else message


class ClientContractService:
    """Operations to manage `ClientService` resources."""

    @staticmethod
    def _release_service_reservations(
        db: Session, service: models.ClientService, *, note: Optional[str] = None
    ) -> None:
        reservations = list(service.ip_reservations or [])
        for reservation in reservations:
            IpPoolService.release_reservation(db, reservation, note=note)

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
            selectinload(models.ClientService.ip_reservations),
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
                selectinload(models.ClientService.ip_reservations),
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
    ) -> tuple[
        dict,
        models.ServicePlan,
        Decimal,
        Optional[models.BaseIpReservation],
        Optional[str],
    ]:
        payload = data.model_dump(exclude_unset=True, by_alias=True)
        inventory_item_id = payload.pop("inventory_item_id", None)
        start_date = payload.pop("start_date", None)
        apply_prorate = bool(payload.pop("apply_prorate", True))
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

        service_metadata = payload.get("service_metadata") if isinstance(payload.get("service_metadata"), dict) else None
        requirements = _resolve_plan_requirements(plan, service_metadata)

        ip_reservation_id = payload.pop("ip_reservation_id", None)
        provided_ip = payload.pop("ip_address", None)
        selected_reservation: Optional[models.BaseIpReservation] = None

        if client and payload.get("zone_id") is None and requirements["requires_base"]:
            payload["zone_id"] = client.zone_id

        if requirements["requires_base"] and payload.get("zone_id") is None:
            raise ClientContractError("Este servicio requiere asignar una zona.")

        existing_reservations = (
            existing.ip_reservations if existing and existing.ip_reservations else []
        )
        if requirements["requires_ip"]:
            if ip_reservation_id:
                selected_reservation = IpPoolService.get_reservation(db, ip_reservation_id)
                if selected_reservation is None:
                    raise ClientContractError("No se encontró la reserva de IP solicitada.")
                if selected_reservation.status not in (
                    models.IpReservationStatus.FREE,
                    models.IpReservationStatus.RESERVED,
                ) and selected_reservation.service_id != (existing.id if existing else None):
                    raise ClientContractError(
                        "La IP seleccionada no está disponible para asignar al servicio."
                    )
            elif provided_ip:
                base_id = payload.get("zone_id") or (existing.zone_id if existing else None)
                if base_id is None:
                    raise ClientContractError(
                        "Este servicio requiere asociar una base para reservar la IP."
                    )
                try:
                    reservation_payload = schemas.BaseIpReservationCreate(
                        base_id=base_id, pool_id=None, ip_address=provided_ip
                    )
                    selected_reservation = IpPoolService.create_reservation(
                        db, reservation_payload
                    )
                except IpPoolServiceError as exc:
                    raise ClientContractError(str(exc)) from exc
            elif not existing_reservations:
                try:
                    selected_reservation = IpPoolService.acquire_reservation_for_service(
                        db, base_id=payload["zone_id"]
                    )
                except IpPoolServiceError as exc:
                    raise ClientContractError(str(exc)) from exc

        if requirements["requires_equipment"]:
            antenna_model = payload.get("antenna_model")
            modem_model = payload.get("modem_model")
            if antenna_model is None and existing is not None:
                antenna_model = existing.antenna_model
                payload.setdefault("antenna_model", antenna_model)
            if modem_model is None and existing is not None:
                modem_model = existing.modem_model
                payload.setdefault("modem_model", modem_model)

            has_equipment = bool(
                (antenna_model and str(antenna_model).strip())
                or (modem_model and str(modem_model).strip())
            )
            if not has_equipment:
                raise ClientContractError("Este servicio requiere registrar el equipo instalado.")

        if requirements["requires_credentials"]:
            notes = payload.get("notes")
            if notes is None and existing is not None:
                notes = existing.notes
                if existing.notes:
                    payload.setdefault("notes", existing.notes)
            if notes is None or str(notes).strip() == "":
                raise ClientContractError(
                    "Este servicio requiere registrar credenciales o notas de acceso."
                )

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

        if payload.get("debt_amount") is not None:
            debt_amount = Decimal(str(payload["debt_amount"]))
            if debt_amount < 0:
                raise ClientContractError("El adeudo no puede ser negativo.")
            payload["debt_amount"] = debt_amount

        if payload.get("debt_months") is not None:
            debt_months = Decimal(str(payload["debt_months"]))
            if debt_months < 0:
                raise ClientContractError("Los meses vencidos no pueden ser negativos.")
            payload["debt_months"] = debt_months

        if "debt_notes" in payload:
            raw_notes = payload.get("debt_notes")
            payload["debt_notes"] = raw_notes if raw_notes is not None else None

        billing_day = payload.get("billing_day")
        if start_date and billing_day is None:
            billing_day = start_date.day
            payload["billing_day"] = billing_day

        if effective_price <= Decimal("0"):
            payload["billing_day"] = None
            payload.pop("next_billing_date", None)
            payload["next_billing_date"] = None
            return payload, plan, effective_price, selected_reservation, inventory_item_id

        if start_date and apply_prorate and payload.get("billing_day"):
            billing_day = int(payload["billing_day"])
            next_billing = cls._compute_next_billing_date(
                billing_day, base_date=start_date
            )
            previous_billing = cls._compute_previous_billing_date(
                billing_day, base_date=next_billing
            )
            cycle_days = (next_billing - previous_billing).days
            used_days = (next_billing - start_date).days

            if cycle_days > 0 and 0 < used_days < cycle_days:
                fraction = Decimal(used_days) / Decimal(cycle_days)
                prorated_months = fraction.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                current_debt_months = Decimal(str(payload.get("debt_months") or 0))
                current_debt_amount = Decimal(str(payload.get("debt_amount") or 0))

                payload["debt_months"] = (
                    current_debt_months + prorated_months
                ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                payload["debt_amount"] = (
                    current_debt_amount + effective_price * fraction
                ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                payload["next_billing_date"] = next_billing

        return payload, plan, effective_price, selected_reservation, inventory_item_id

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
        (
            payload,
            plan,
            effective_price,
            reservation,
            inventory_item_id,
        ) = cls._normalize_payload(db, data, client=client)
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
        if reservation:
            try:
                IpPoolService.assign_reservation(
                    db,
                    reservation,
                    service,
                    client_id=client.id,
                    inventory_item_id=inventory_item_id,
                )
            except IpPoolServiceError as exc:
                raise ClientContractError(str(exc)) from exc
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

        pending_assignments: list[
            tuple[models.BaseIpReservation, models.ClientService, str, Optional[str]]
        ] = []
        try:
            for client_id in unique_client_ids:
                client = _get_client(client_id)

                create_payload = schemas.ClientServiceCreate(
                    client_id=client_id,
                    **base_payload,
                )
                (
                    payload,
                    normalized_plan,
                    effective_price,
                    reservation,
                    inventory_item_id,
                ) = cls._normalize_payload(db, create_payload, client=client)
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
                if reservation:
                    pending_assignments.append(
                        (reservation, service, client.id, inventory_item_id)
                    )
                created.append(service)
            db.commit()
            for service in created:
                db.refresh(service)
            for reservation, service, client_id, inventory_item_id in pending_assignments:
                IpPoolService.assign_reservation(
                    db,
                    reservation,
                    service,
                    client_id=client_id,
                    inventory_item_id=inventory_item_id,
                )
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
        previous_plan_id = service.service_plan_id
        previous_status = service.status
        update_data = data.model_dump(exclude_unset=True, by_alias=True)
        inventory_item_id = update_data.pop("inventory_item_id", None)
        (
            update_data,
            plan,
            effective_price,
            reservation,
            normalized_inventory_item,
        ) = cls._normalize_payload(db, data, client=service.client, existing=service)

        if normalized_inventory_item is not None:
            inventory_item_id = normalized_inventory_item

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
        if reservation:
            for existing_reservation in list(service.ip_reservations):
                if existing_reservation.id != reservation.id:
                    IpPoolService.release_reservation(db, existing_reservation)
            IpPoolService.assign_reservation(
                db,
                reservation,
                service,
                client_id=service.client_id,
                inventory_item_id=inventory_item_id,
            )
        elif inventory_item_id and service.ip_reservations:
            primary_reservation = service.ip_reservations[0]
            IpPoolService.assign_reservation(
                db,
                primary_reservation,
                service,
                client_id=service.client_id,
                inventory_item_id=inventory_item_id,
            )

        if (
            previous_status != models.ClientServiceStatus.CANCELLED
            and service.status == models.ClientServiceStatus.CANCELLED
        ):
            cls._release_service_reservations(
                db, service, note="Liberada por cancelación del servicio"
            )

        if previous_plan_id != service.service_plan_id:
            ObservabilityService.record_event(
                db,
                "services.plan_change",
                MetricOutcome.SUCCESS,
                tags={
                    "client_id": str(service.client_id),
                    "client_service_id": str(service.id),
                    "from_plan": previous_plan_id,
                    "to_plan": service.service_plan_id,
                },
            )

        if (
            previous_status != models.ClientServiceStatus.ACTIVE
            and service.status == models.ClientServiceStatus.ACTIVE
        ):
            ObservabilityService.record_event(
                db,
                "services.reconnected",
                MetricOutcome.SUCCESS,
                tags={
                    "client_id": str(service.client_id),
                    "client_service_id": str(service.id),
                    "previous_status": previous_status.value,
                },
            )

        return service

    @staticmethod
    def update_service_debt(
        db: Session, service: models.ClientService, data: schemas.ServiceDebtUpdate
    ) -> models.ClientService:
        update_data = data.model_dump(exclude_unset=True)

        if "debt_amount" in update_data:
            debt_amount = Decimal(str(update_data.get("debt_amount") or 0))
            if debt_amount < 0:
                raise ClientContractError("El adeudo no puede ser negativo.")
            service.debt_amount = debt_amount

        if "debt_months" in update_data:
            debt_months = Decimal(str(update_data.get("debt_months") or 0))
            if debt_months < 0:
                raise ClientContractError("Los meses vencidos no pueden ser negativos.")
            service.debt_months = debt_months

        if "debt_notes" in update_data:
            service.debt_notes = update_data.get("debt_notes")

        try:
            db.add(service)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise ClientContractError("No se pudo actualizar el adeudo del servicio.") from exc

        db.refresh(service)
        return service

    @staticmethod
    def delete_service(db: Session, service: models.ClientService) -> None:
        ClientContractService._release_service_reservations(db, service)
        db.delete(service)
        db.commit()

    @staticmethod
    def contracted_services_summary(
        db: Session, client_id: str
    ) -> schemas.ClientContractsResponse:
        services = (
            db.query(models.ClientService)
            .options(selectinload(models.ClientService.service_plan))
            .filter(models.ClientService.client_id == client_id)
            .all()
        )

        summaries: list[schemas.ContractedServiceSummary] = []
        total_debt_amount = Decimal("0")
        total_debt_months = Decimal("0")
        for service in services:
            period_key = None
            if service.next_billing_date:
                period_key = f"{service.next_billing_date.year:04d}-{service.next_billing_date.month:02d}"

            summary = schemas.ContractedServiceSummary(
                id=str(service.id),
                client_id=str(service.client_id),
                plan_name=service.service_plan.name if service.service_plan else "",
                category=service.service_plan.category
                if service.service_plan
                else models.ClientServiceType.OTHER,
                status=service.status,
                debt_amount=Decimal(service.debt_amount or 0),
                debt_months=Decimal(service.debt_months or 0),
                next_billing_date=service.next_billing_date,
                period_key=period_key,
            )
            total_debt_amount += summary.debt_amount
            total_debt_months += summary.debt_months
            summaries.append(summary)

        return schemas.ClientContractsResponse(
            items=summaries,
            total_debt_amount=total_debt_amount.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ),
            total_debt_months=total_debt_months.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ),
        )

    @classmethod
    def preview_proration(
        cls,
        db: Session,
        service: models.ClientService,
        *,
        start_date: Optional[date] = None,
        target_plan_id: Optional[int] = None,
    ) -> schemas.ProrationPreview:
        reference_plan_id = target_plan_id or service.service_plan_id
        plan = cls._resolve_service_plan(db, reference_plan_id)
        payload = schemas.ClientServiceUpdate(
            service_id=plan.id,
            billing_day=service.billing_day,
            start_date=start_date or date.today(),
            apply_prorate=True,
            custom_price=service.custom_price,
            debt_amount=service.debt_amount,
            debt_months=service.debt_months,
        )

        normalized, _, effective_price, _, _ = cls._normalize_payload(
            db, payload, client=service.client, existing=service
        )

        added_debt_amount = Decimal(normalized.get("debt_amount", service.debt_amount or 0)) - Decimal(
            service.debt_amount or 0
        )
        added_debt_months = Decimal(normalized.get("debt_months", service.debt_months or 0)) - Decimal(
            service.debt_months or 0
        )

        return schemas.ProrationPreview(
            client_service_id=str(service.id),
            applied_plan_id=plan.id,
            effective_price=effective_price,
            next_billing_date=normalized.get("next_billing_date", service.next_billing_date),
            added_debt_amount=added_debt_amount.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ),
            added_debt_months=added_debt_months.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            ),
        )

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
    def _compute_previous_billing_date(
        billing_day: int, base_date: Optional[date] = None
    ) -> date:
        reference = base_date or date.today()
        year = reference.year
        month = reference.month

        if reference.day <= billing_day:
            month -= 1
            if month == 0:
                month = 12
                year -= 1

        last_day = ClientContractService._last_day_of_month(year, month)
        return date(year, month, min(billing_day, last_day))

    @staticmethod
    def _last_day_of_month(year: int, month: int) -> int:
        if month == 12:
            return 31
        next_month = date(year, month + 1, 1)
        return (next_month - date.resolution).day
