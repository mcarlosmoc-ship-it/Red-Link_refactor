"""Business logic related to client resources."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Iterable, Optional, Tuple

from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas


class ClientService:
    """Encapsulates CRUD operations for clients."""

    COLUMN_ALIASES = {
        "nombre": "full_name",
        "name": "full_name",
        "direccion": "location",
        "zona": "zone_id",
        "base": "zone_id",
        "tipo_cliente": "client_type",
        "codigo_externo": "external_code",
        "custom_price": "service_custom_price",
        "precio_personalizado": "service_custom_price",
        "dia_corte": "service_billing_day",
        "estado_servicio": "service_status",
        "ip_principal": "service_ip_address",
        "ip_antena": "service_antenna_ip",
        "ip_modem": "service_modem_ip",
        "router_model": "service_modem_model",
        "comentarios": "service_notes",
        "coordenadas": "coordinates",
        "telefono": "contact_phone",
        "email": "contact_email",
        "service_plan_id": "service_plan",
        "service_base_id": "service_zone_id",
        "base_id": "zone_id",
    }

    CLIENT_REQUIRED_COLUMNS = {
        "client_type",
        "full_name",
        "location",
        "zone_id",
    }
    CLIENT_OPTIONAL_COLUMNS = {
        "external_code",
        "monthly_fee",
        "paid_months_ahead",
        "debt_months",
        "client_service_status",
    }
    SERVICE_OPTIONAL_COLUMNS = {
        "service_plan_price",
        "service_status",
        "service_billing_day",
        "service_zone_id",
        "service_ip_address",
        "service_antenna_ip",
        "service_modem_ip",
        "service_antenna_model",
        "service_modem_model",
        "service_custom_price",
        "service_notes",
    }
    SERVICE_REQUIRED_COLUMNS = {"service_plan"}
    IMPORT_DECIMAL_COLUMNS = {
        "monthly_fee",
        "paid_months_ahead",
        "debt_months",
        "service_plan_price",
        "service_custom_price",
    }
    IMPORT_TEMPLATE_ORDER = [
        "external_code",
        "nombre",
        "direccion",
        "telefono",
        "zona",
        "tipo_cliente",
        "paid_months_ahead",
        "debt_months",
        "service_plan",
        "custom_price",
        "dia_corte",
        "estado_servicio",
        "ip_principal",
        "ip_antena",
        "ip_modem",
        "router_model",
        "email",
        "coordenadas",
        "comentarios",
    ]
    OPTIONAL_TEMPLATE_COLUMNS = {
        "email",
        "coordenadas",
        "comentarios",
        "paid_months_ahead",
        "debt_months",
    }
    IMPORT_TEMPLATE_ROWS = [
        {
            "external_code": "CLI-001",
            "nombre": "Juan Pérez",
            "direccion": "Centro",
            "telefono": "555-1234",
            "zona": 1,
            "tipo_cliente": "residential",
            "paid_months_ahead": "1",
            "debt_months": "0",
            "service_plan": "Plan Básico",
            "custom_price": "350",
            "estado_servicio": models.ClientServiceStatus.ACTIVE.value,
            "dia_corte": 1,
            "ip_principal": "10.0.0.10",
            "ip_antena": "10.0.0.11",
            "ip_modem": "10.0.0.12",
            "router_model": "Router AC",
            "email": "juan@example.com",
            "comentarios": "Cliente residencial con IP fija",
        },
        {
            "external_code": "CLI-001",
            "nombre": "Juan Pérez",
            "direccion": "Centro",
            "telefono": "555-1234",
            "zona": 1,
            "tipo_cliente": "residential",
            "paid_months_ahead": "1",
            "debt_months": "0",
            "service_plan": "Plan Fibra",
            "custom_price": "480",
            "estado_servicio": models.ClientServiceStatus.ACTIVE.value,
            "dia_corte": 15,
            "router_model": "ONT",
        },
        {
            "external_code": "CLI-002",
            "nombre": "Plaza Principal",
            "direccion": "Centro",
            "telefono": "555-5678",
            "zona": 2,
            "tipo_cliente": "token",
            "paid_months_ahead": "0",
            "debt_months": "2",
            "service_plan": "Hotspot diario",
            "custom_price": "120",
            "estado_servicio": models.ClientServiceStatus.PENDING.value,
            "dia_corte": 20,
            "ip_principal": "10.0.1.5",
            "coordenadas": "-16.5,-68.15",
        },
    ]

    @staticmethod
    def list_clients(
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        zone_id: Optional[int] = None,
        status: Optional[models.ServiceStatus] = None,
    ) -> Tuple[Iterable[models.Client], int]:
        query = (
            db.query(models.Client)
            .options(
                selectinload(models.Client.services).selectinload(
                    models.ClientService.service_plan
                ),
                selectinload(models.Client.zone),
            )
        )

        if search:
            normalized = f"%{search.lower()}%"
            query = query.filter(func.lower(models.Client.full_name).like(normalized))

        if zone_id is not None:
            query = query.filter(models.Client.zone_id == zone_id)

        if status is not None:
            query = query.filter(models.Client.service_status == status)

        total = query.count()
        items = (
            query.order_by(models.Client.full_name)
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def _normalize_header(header: Optional[str]) -> str:
        normalized = (header or "").strip().lower()
        return ClientService.COLUMN_ALIASES.get(normalized, normalized)

    @staticmethod
    def get_client(db: Session, client_id: str) -> Optional[models.Client]:
        client = (
            db.query(models.Client)
            .options(
                selectinload(models.Client.services).selectinload(
                    models.ClientService.payments
                ),
                selectinload(models.Client.services).selectinload(
                    models.ClientService.service_plan
                ),
                selectinload(models.Client.payments),
                selectinload(models.Client.zone),
            )
            .filter(models.Client.id == client_id)
            .first()
        )
        if client is not None:
            client.recent_payments = ClientService._recent_payments(db, client.id)
        return client

    @staticmethod
    def create_client(db: Session, data: schemas.ClientCreate) -> models.Client:
        client_payload = data.model_dump(exclude={"services"})
        services_payload = [
            service_in for service_in in data.services if service_in.service_id is not None
        ]

        client = models.Client(**client_payload)
        db.add(client)

        try:
            db.flush()

            effective_prices: list[Decimal] = []

            for service_in in services_payload:
                plan_id = service_in.service_id
                plan = db.get(models.ServicePlan, plan_id)
                if plan is None:
                    raise ValueError(f"Service plan {plan_id} does not exist")

                custom_price = service_in.custom_price
                status = service_in.status or models.ClientServiceStatus.ACTIVE
                zone_id = (
                    service_in.zone_id
                    if service_in.zone_id is not None
                    else client.zone_id
                )

                billing_day = service_in.billing_day
                if billing_day is None:
                    billing_day = 1

                assignment = models.ClientService(
                    client=client,
                    service_plan=plan,
                    status=status,
                    billing_day=billing_day,
                    next_billing_date=service_in.next_billing_date,
                    zone_id=zone_id,
                    ip_address=service_in.ip_address,
                    antenna_ip=service_in.antenna_ip,
                    modem_ip=service_in.modem_ip,
                    antenna_model=service_in.antenna_model,
                    modem_model=service_in.modem_model,
                    custom_price=custom_price,
                    notes=service_in.notes,
                    service_metadata=service_in.service_metadata,
                )
                db.add(assignment)
                db.flush()

                price_reference = custom_price
                if price_reference is None and plan.monthly_price is not None:
                    price_reference = plan.monthly_price
                if price_reference is not None:
                    effective_prices.append(
                        price_reference
                        if isinstance(price_reference, Decimal)
                        else Decimal(str(price_reference))
                    )

            if effective_prices:
                client.monthly_fee = effective_prices[0]

            db.commit()
        except Exception:
            db.rollback()
            raise

        created_client = ClientService.get_client(db, client.id)
        if created_client is None:
            client.recent_payments = ClientService._recent_payments(db, client.id)
            return client
        return created_client

    @staticmethod
    def update_client(db: Session, client: models.Client, data: schemas.ClientUpdate) -> models.Client:
        update_data = data.dict(exclude_unset=True)
        change_logs = []

        for key, value in update_data.items():
            current_value = getattr(client, key)
            if current_value == value:
                continue
            setattr(client, key, value)
            change_logs.append(
                models.ClientChangeLog(
                    client=client,
                    field_name=key,
                    old_value=None if current_value is None else str(current_value),
                    new_value=None if value is None else str(value),
                    change_source="api",
                )
            )

        db.add(client)
        if change_logs:
            db.add_all(change_logs)
        db.commit()
        db.refresh(client)
        return client

    @staticmethod
    def delete_client(db: Session, client: models.Client) -> None:
        db.delete(client)
        db.commit()

    @staticmethod
    def _recent_payments(db: Session, client_id: str, limit: int = 5) -> list[models.ServicePayment]:
        return (
            db.query(models.ServicePayment)
            .options(
                selectinload(models.ServicePayment.service),
                selectinload(models.ServicePayment.client),
            )
            .filter(models.ServicePayment.client_id == client_id)
            .order_by(models.ServicePayment.paid_on.desc())
            .limit(limit)
            .all()
        )

    @staticmethod
    def build_import_template(columns: Iterable[str] | None = None) -> str:
        """Return a CSV template that can be offered to end-users."""

        allowed_columns = set(ClientService.IMPORT_TEMPLATE_ORDER)
        selected_columns = {
            (column or "").strip().lower()
            for column in columns or allowed_columns
            if (column or "").strip()
        }
        headers = [
            column
            for column in ClientService.IMPORT_TEMPLATE_ORDER
            if column in selected_columns
            or column not in ClientService.OPTIONAL_TEMPLATE_COLUMNS
        ]
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for row in ClientService.IMPORT_TEMPLATE_ROWS:
            writer.writerow(row)
        return buffer.getvalue()

    @staticmethod
    def import_clients_from_csv(db: Session, content: str) -> schemas.ClientImportSummary:
        """Create clients from a CSV payload and return a summary of the operation."""

        reader = csv.DictReader(io.StringIO(content))
        if not reader.fieldnames:
            raise ValueError("El archivo no contiene encabezados.")

        normalized_headers = {
            ClientService._normalize_header(header) for header in reader.fieldnames if header
        }
        header_aliases = set(normalized_headers)

        required_columns = (
            ClientService.CLIENT_REQUIRED_COLUMNS | ClientService.SERVICE_REQUIRED_COLUMNS
        )
        missing = required_columns - header_aliases
        if missing:
            raise ValueError(
                "Faltan columnas obligatorias: " + ", ".join(sorted(missing))
            )

        zone_ids = {zone_id for (zone_id,) in db.query(models.Zone.id).all()}
        service_plans = {
            (plan.name or "").strip().lower(): plan
            for plan in db.query(models.ServicePlan)
            .filter(models.ServicePlan.status == models.ServicePlanStatus.ACTIVE)
            .all()
        }
        ip_catalog = ClientService._collect_existing_ips(db)

        summary = _ImportAccumulator()
        pending_reservations: dict[str, set[str]] = {}
        parsed_rows: list[dict] = []

        for index, raw_row in enumerate(reader, start=2):
            normalized_row = {
                ClientService._normalize_header(key): value
                for key, value in (raw_row or {}).items()
            }

            if not any(_normalize_string(value) for value in normalized_row.values()):
                continue

            summary.increment_total_rows()

            try:
                row_payload, reservations = ClientService._map_flat_import_row(
                    db,
                    normalized_row,
                    service_plans,
                    zone_ids,
                    ClientService._merge_ip_sets(ip_catalog, pending_reservations),
                )
                row_payload["row_number"] = index
                row_payload["reservations"] = reservations
                parsed_rows.append(row_payload)
            except _RowProcessingError as exc:
                summary.register_error(
                    index,
                    str(exc),
                    client_name=_normalize_string(normalized_row.get("full_name")),
                )
            except ValidationError as exc:
                summary.register_error(
                    index,
                    "Datos inválidos en el registro.",
                    ClientService._format_validation_errors(exc),
                    client_name=_normalize_string(normalized_row.get("full_name")),
                )
            except IntegrityError as exc:
                db.rollback()
                summary.register_error(
                    index,
                    ClientService._describe_integrity_error(exc),
                    client_name=_normalize_string(normalized_row.get("full_name")),
                )
            except Exception as exc:  # pragma: no cover - defensive programming
                db.rollback()
                summary.register_error(
                    index,
                    f"Error inesperado: {exc}",
                    client_name=_normalize_string(normalized_row.get("full_name")),
                )

        clients_by_key: dict[str, dict] = {}
        for row in parsed_rows:
            try:
                key = ClientService._build_client_key(row["client_payload"])
                bucket = clients_by_key.setdefault(
                    key,
                    {
                        "client_payload": row["client_payload"],
                        "services": [],
                        "row_numbers": [],
                        "reservations": {},
                    },
                )
                ClientService._assert_consistent_client_data(
                    bucket["client_payload"], row["client_payload"]
                )
                bucket["services"].append(row["service_payload"])
                bucket["row_numbers"].append(row["row_number"])
                ClientService._reserve_ips(bucket["reservations"], row["reservations"])
                ClientService._reserve_ips(pending_reservations, row["reservations"])
            except _RowProcessingError as exc:
                summary.register_error(
                    row["row_number"],
                    str(exc),
                    client_name=row["client_payload"].get("full_name"),
                )

        for bucket in clients_by_key.values():
            payload = dict(bucket["client_payload"])
            payload["services"] = bucket["services"]
            try:
                client_in = schemas.ClientCreate.model_validate(payload)
                ClientService.create_client(db, client_in)
                ClientService._reserve_ips(ip_catalog, bucket["reservations"])
                summary.register_client_success(
                    bucket["row_numbers"],
                    bucket["client_payload"].get("full_name"),
                    len(bucket["services"]),
                )
            except ValidationError as exc:
                summary.register_group_error(
                    bucket["row_numbers"],
                    "Datos inválidos en el registro.",
                    ClientService._format_validation_errors(exc),
                    client_name=bucket["client_payload"].get("full_name"),
                )
            except IntegrityError as exc:
                db.rollback()
                summary.register_group_error(
                    bucket["row_numbers"],
                    ClientService._describe_integrity_error(exc),
                    client_name=bucket["client_payload"].get("full_name"),
                )
            except Exception as exc:  # pragma: no cover - defensive programming
                db.rollback()
                summary.register_group_error(
                    bucket["row_numbers"],
                    f"Error inesperado: {exc}",
                    client_name=bucket["client_payload"].get("full_name"),
                )

        return summary.build()

    @staticmethod
    def _map_flat_import_row(
        db: Session,
        row: dict[str, Optional[str]],
        service_plans: dict[str, models.ServicePlan],
        zone_ids: set[int],
        known_ips: dict[str, set[str]],
    ) -> tuple[dict, dict[str, set[str]]]:
        client_payload = ClientService._extract_client_fields(row, zone_ids)
        service_payload = ClientService._extract_service_row(
            db, row, client_payload, service_plans, zone_ids
        )
        ip_reservations = ClientService._validate_ip_uniqueness(
            [service_payload], known_ips
        )
        return {
            "client_payload": client_payload,
            "service_payload": service_payload,
        }, ip_reservations

    @staticmethod
    def _extract_client_fields(
        row: dict[str, Optional[str]], zone_ids: set[int]
    ) -> dict:
        payload: dict[str, object] = {}

        for column in ClientService.CLIENT_REQUIRED_COLUMNS:
            raw_value = _normalize_string(row.get(column))
            if raw_value is None:
                raise _RowProcessingError(
                    f"La columna '{column}' es obligatoria y no puede quedar vacía."
                )
            if column == "zone_id":
                try:
                    payload[column] = int(raw_value)
                except ValueError as exc:
                    raise _RowProcessingError("El ID de la zona debe ser un número entero.") from exc
            else:
                payload[column] = raw_value

        if payload["zone_id"] not in zone_ids:
            raise _RowProcessingError(
                f"La zona con ID {payload['zone_id']} no existe."
            )

        for column in ClientService.CLIENT_OPTIONAL_COLUMNS:
            raw_value = _normalize_string(row.get(column))
            if raw_value is None:
                continue
            if column in ClientService.IMPORT_DECIMAL_COLUMNS:
                payload[column] = _parse_decimal(raw_value)
            elif column == "client_service_status":
                try:
                    payload["service_status"] = models.ServiceStatus(raw_value)
                except ValueError as exc:
                    valid_statuses = ", ".join(status.value for status in models.ServiceStatus)
                    raise _RowProcessingError(
                        f"El estado del cliente debe ser uno de: {valid_statuses}."
                    ) from exc
            else:
                payload[column] = raw_value

        return payload

    @staticmethod
    def _extract_service_row(
        db: Session,
        row: dict[str, Optional[str]],
        client_payload: dict[str, object],
        service_plans: dict[str, models.ServicePlan],
        zone_ids: set[int],
    ) -> dict[str, object]:
        plan_name = _normalize_string(row.get("service_plan"))
        if not plan_name:
            raise _RowProcessingError("La columna 'service_plan' es obligatoria.")

        price_raw = _normalize_string(row.get("service_plan_price"))
        plan_price = _parse_decimal(price_raw) if price_raw is not None else Decimal("0")
        plan = ClientService._resolve_or_create_plan(db, service_plans, plan_name, plan_price)

        status_raw = _normalize_string(row.get("service_status"))
        status = models.ClientServiceStatus.ACTIVE
        if status_raw:
            try:
                status = models.ClientServiceStatus(status_raw)
            except ValueError as exc:
                valid_statuses = ", ".join(status.value for status in models.ClientServiceStatus)
                raise _RowProcessingError(
                    f"El estado del servicio debe ser uno de: {valid_statuses}."
                ) from exc

        billing_day_raw = _normalize_string(row.get("service_billing_day"))
        billing_day = None
        if billing_day_raw is not None:
            try:
                billing_day = int(billing_day_raw)
            except ValueError as exc:
                raise _RowProcessingError(
                    "El día de cobro del servicio debe ser un número entero."
                ) from exc
            if not 1 <= billing_day <= 31:
                raise _RowProcessingError(
                    "El día de cobro del servicio debe estar entre 1 y 31."
                )

        zone_raw = _normalize_string(row.get("service_zone_id") or row.get("service_base_id"))
        zone_id = client_payload.get("zone_id")
        if zone_raw is not None:
            try:
                zone_id = int(zone_raw)
            except ValueError as exc:
                raise _RowProcessingError(
                    "La base/zona del servicio debe ser un número entero."
                ) from exc
        if zone_id is not None and zone_id not in zone_ids:
            raise _RowProcessingError(
                f"La base/zona del servicio no existe (ID {zone_id})."
            )

        ip_address = _normalize_string(row.get("service_ip_address"))
        antenna_ip = _normalize_string(row.get("service_antenna_ip"))
        modem_ip = _normalize_string(row.get("service_modem_ip"))
        antenna_model = _normalize_string(row.get("service_antenna_model"))
        modem_model = _normalize_string(row.get("service_modem_model"))
        custom_price_raw = _normalize_string(row.get("service_custom_price"))
        custom_price = (
            _parse_decimal(custom_price_raw) if custom_price_raw is not None else None
        )
        notes = _normalize_string(row.get("service_notes"))

        if plan.requires_ip and ip_address is None:
            raise _RowProcessingError(
                f"El plan '{plan.name}' requiere IP asignada para el servicio."
            )
        if plan.requires_base and zone_id is None:
            raise _RowProcessingError(
                f"El plan '{plan.name}' requiere una base/zona para el servicio."
            )

        return {
            "service_id": plan.id,
            "status": status,
            "billing_day": billing_day,
            "zone_id": zone_id,
            "ip_address": ip_address,
            "antenna_ip": antenna_ip,
            "modem_ip": modem_ip,
            "antenna_model": antenna_model,
            "modem_model": modem_model,
            "custom_price": custom_price,
            "notes": notes,
        }

    @staticmethod
    def _resolve_or_create_plan(
        db: Session,
        service_plans: dict[str, models.ServicePlan],
        plan_name: str,
        plan_price: Decimal,
    ) -> models.ServicePlan:
        key = plan_name.lower()
        plan = service_plans.get(key)
        if plan is None:
            plan = models.ServicePlan(
                name=plan_name,
                monthly_price=plan_price,
                status=models.ServicePlanStatus.ACTIVE,
                category=models.ClientServiceType.INTERNET,
            )
            db.add(plan)
            db.flush()
            service_plans[key] = plan
        elif plan.status != models.ServicePlanStatus.ACTIVE:
            raise _RowProcessingError(
                f"El plan '{plan_name}' existe pero está inactivo."
            )
        return plan

    @staticmethod
    def _build_client_key(payload: dict[str, object]) -> str:
        if payload.get("external_code"):
            return f"external:{str(payload['external_code']).lower()}"
        return f"name:{str(payload.get('full_name', '')).lower()}|{str(payload.get('location', '')).lower()}"

    @staticmethod
    def _assert_consistent_client_data(existing: dict, incoming: dict) -> None:
        for key, value in incoming.items():
            if key == "services":
                continue
            if existing.get(key) is None and value is not None:
                existing[key] = value
            elif value is not None and existing.get(key) != value:
                raise _RowProcessingError(
                    f"Los datos del cliente no coinciden con filas anteriores (columna {key})."
                )

    @staticmethod
    def _merge_ip_sets(*catalogs: dict[str, set[str]]) -> dict[str, set[str]]:
        merged: dict[str, set[str]] = {}
        for catalog in catalogs:
            for field, values in (catalog or {}).items():
                merged.setdefault(field, set()).update(values)
        return merged

    @staticmethod
    def _collect_existing_ips(db: Session) -> dict[str, set[str]]:
        def _fetch(column) -> set[str]:
            return {
                str(value)
                for (value,) in db.query(column)
                .filter(column.isnot(None))
                .all()
                if value is not None
            }

        return {
            "ip_address": _fetch(models.ClientService.ip_address),
            "antenna_ip": _fetch(models.ClientService.antenna_ip),
            "modem_ip": _fetch(models.ClientService.modem_ip),
        }

    @staticmethod
    def _validate_ip_uniqueness(
        services: list[dict[str, object]],
        known_ips: dict[str, set[str]],
    ) -> dict[str, set[str]]:
        row_reservations: dict[str, set[str]] = {
            "ip_address": set(),
            "antenna_ip": set(),
            "modem_ip": set(),
        }

        for service in services:
            for field in row_reservations.keys():
                ip_value = service.get(field)
                if ip_value is None:
                    continue
                ip_text = str(ip_value)
                if ip_text in known_ips.get(field, set()):
                    raise _RowProcessingError(
                        f"La IP {ip_text} ya está asignada a otro servicio ({field})."
                    )
                if ip_text in row_reservations[field]:
                    raise _RowProcessingError(
                        f"La IP {ip_text} se repite en varios servicios del archivo ({field})."
                    )
                row_reservations[field].add(ip_text)

        return row_reservations

    @staticmethod
    def _reserve_ips(
        known_ips: dict[str, set[str]],
        reservations: dict[str, set[str]],
    ) -> None:
        for field, values in reservations.items():
            if field not in known_ips:
                known_ips[field] = set()
            known_ips[field].update(values)

    @staticmethod
    def _format_validation_errors(exc: ValidationError) -> dict[str, str]:
        grouped: dict[str, list[str]] = {}
        for error in exc.errors():
            location = [part for part in error.get("loc", []) if part != "__root__"]
            key = ".".join(str(part) for part in location) or "general"
            message = error.get("msg") or "Dato inválido"
            grouped.setdefault(key, []).append(message)
        return {field: "; ".join(messages) for field, messages in grouped.items()}

    @staticmethod
    def _describe_integrity_error(error: IntegrityError) -> str:
        message = str(getattr(error, "orig", error))
        if "UNIQUE" in message.upper():
            return "El registro contiene valores duplicados que ya existen en la base de datos."
        return "No se pudo guardar el cliente por una restricción de base de datos."


@dataclass
class _ImportAccumulator:
    total_rows: int = 0
    created_count: int = 0
    service_created_count: int = 0
    errors: list[schemas.ClientImportError] = None
    row_summaries: list[schemas.ClientImportRowSummary] = None

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []
        if self.row_summaries is None:
            self.row_summaries = []

    def increment_total_rows(self) -> None:
        self.total_rows += 1

    def register_client_success(
        self,
        row_numbers: list[int],
        client_name: Optional[str],
        services_created: int,
    ) -> None:
        self.created_count += 1
        self.service_created_count += services_created
        for row_number in row_numbers:
            self.row_summaries.append(
                schemas.ClientImportRowSummary(
                    row_number=row_number,
                    client_name=client_name,
                    services_created=1,
                    status="created",
                )
            )

    def register_error(
        self,
        row_number: int,
        message: str,
        field_errors: Optional[dict[str, str]] = None,
        client_name: Optional[str] = None,
    ) -> None:
        self.errors.append(
            schemas.ClientImportError(
                row_number=row_number,
                message=message,
                field_errors=field_errors or {},
            )
        )
        self.row_summaries.append(
            schemas.ClientImportRowSummary(
                row_number=row_number,
                client_name=client_name,
                services_created=0,
                status="error",
                error_message=message,
            )
        )

    def register_group_error(
        self,
        row_numbers: list[int],
        message: str,
        field_errors: Optional[dict[str, str]] = None,
        client_name: Optional[str] = None,
    ) -> None:
        for row_number in row_numbers:
            self.register_error(row_number, message, field_errors, client_name)

    def build(self) -> schemas.ClientImportSummary:
        return schemas.ClientImportSummary(
            total_rows=self.total_rows,
            created_count=self.created_count,
            service_created_count=self.service_created_count,
            failed_count=len(self.errors),
            row_summaries=self.row_summaries,
            errors=self.errors,
        )


class _RowProcessingError(Exception):
    """Raised when an import row cannot be processed due to invalid data."""


def _normalize_string(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        candidate = value.strip()
    else:  # pragma: no cover - csv reader always returns strings
        candidate = str(value).strip()
    return candidate or None


def _parse_decimal(raw_value: str) -> Decimal:
    candidate = raw_value.replace(",", ".")
    try:
        return Decimal(candidate)
    except InvalidOperation as exc:  # pragma: no cover - validated via pydantic
        raise _RowProcessingError(
            f"El valor '{raw_value}' debe ser un número válido."
        ) from exc
