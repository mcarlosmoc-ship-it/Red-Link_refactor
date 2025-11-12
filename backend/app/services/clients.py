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

    IMPORT_REQUIRED_COLUMNS = {"client_type", "full_name", "location", "zone_id"}
    IMPORT_OPTIONAL_COLUMNS = {
        "external_code",
        "ip_address",
        "antenna_ip",
        "modem_ip",
        "antenna_model",
        "modem_model",
        "monthly_fee",
        "paid_months_ahead",
        "debt_months",
        "service_status",
    }
    IMPORT_DECIMAL_COLUMNS = {"monthly_fee", "paid_months_ahead", "debt_months"}
    IMPORT_TEMPLATE_ROWS = [
        {
            "client_type": "residential",
            "full_name": "Juan Pérez",
            "location": "Centro",
            "zone_id": 1,
            "ip_address": "192.168.10.15",
            "monthly_fee": "350",
            "paid_months_ahead": "0",
            "debt_months": "0",
            "service_status": models.ServiceStatus.ACTIVE.value,
        },
        {
            "client_type": "token",
            "full_name": "Plaza Principal",
            "location": "Centro",
            "zone_id": 1,
            "antenna_ip": "10.0.0.45",
            "modem_ip": "10.0.0.46",
            "antenna_model": "LiteBeam M5",
            "modem_model": "TP-Link",
            "monthly_fee": "0",
            "paid_months_ahead": "0",
            "debt_months": "0",
            "service_status": models.ServiceStatus.ACTIVE.value,
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
    def get_client(db: Session, client_id: str) -> Optional[models.Client]:
        client = (
            db.query(models.Client)
            .options(
                selectinload(models.Client.services)
                .selectinload(models.ClientService.payments)
                .selectinload(models.ClientService.service_plan),
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
                    custom_price=custom_price,
                    notes=service_in.notes,
                    service_metadata=service_in.service_metadata,
                )
                db.add(assignment)

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
            elif client.monthly_fee is None:
                client.monthly_fee = Decimal("0")

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
    def build_import_template() -> str:
        """Return a CSV template that can be offered to end-users."""

        headers = list(
            ClientService.IMPORT_REQUIRED_COLUMNS
            | ClientService.IMPORT_OPTIONAL_COLUMNS
        )
        # Keep the headers ordered for usability.
        ordered_headers = [
            "client_type",
            "full_name",
            "location",
            "zone_id",
            "external_code",
            "ip_address",
            "antenna_ip",
            "modem_ip",
            "antenna_model",
            "modem_model",
            "monthly_fee",
            "paid_months_ahead",
            "debt_months",
            "service_status",
        ]
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=ordered_headers, extrasaction="ignore")
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
            (header or "").strip().lower() for header in reader.fieldnames if header
        }
        header_aliases = set(normalized_headers)
        if "base_id" in normalized_headers:
            header_aliases.add("zone_id")
        missing = ClientService.IMPORT_REQUIRED_COLUMNS - header_aliases
        if missing:
            raise ValueError(
                "Faltan columnas obligatorias: " + ", ".join(sorted(missing))
            )

        zone_ids = {zone_id for (zone_id,) in db.query(models.Zone.id).all()}

        summary = _ImportAccumulator()

        for index, raw_row in enumerate(reader, start=2):
            normalized_row = {
                (key or "").strip().lower(): value for key, value in (raw_row or {}).items()
            }

            if not any(_normalize_string(value) for value in normalized_row.values()):
                continue

            summary.increment_total_rows()

            try:
                payload = ClientService._map_import_row(normalized_row)
                zone_id = payload["zone_id"]
                if zone_id not in zone_ids:
                    raise _RowProcessingError(f"La zona con ID {zone_id} no existe.")
                client_in = schemas.ClientCreate.model_validate(payload)
                ClientService.create_client(db, client_in)
                summary.increment_created()
            except _RowProcessingError as exc:
                summary.register_error(index, str(exc))
            except ValidationError as exc:
                summary.register_error(
                    index,
                    "Datos inválidos en el registro.",
                    ClientService._format_validation_errors(exc),
                )
            except IntegrityError as exc:
                db.rollback()
                summary.register_error(index, ClientService._describe_integrity_error(exc))
            except Exception as exc:  # pragma: no cover - defensive programming
                db.rollback()
                summary.register_error(index, f"Error inesperado: {exc}")

        return summary.build()

    @staticmethod
    def _map_import_row(row: dict[str, Optional[str]]) -> dict:
        payload: dict[str, object] = {}

        for column in ClientService.IMPORT_REQUIRED_COLUMNS:
            if column == "zone_id":
                raw_value = _normalize_string(row.get("zone_id") or row.get("base_id"))
            else:
                raw_value = _normalize_string(row.get(column))

            if raw_value is None:
                raise _RowProcessingError(
                    f"La columna '{column}' es obligatoria y no puede quedar vacía."
                )
            if column == "zone_id":
                try:
                    payload[column] = int(raw_value)
                except ValueError as exc:  # pragma: no cover - validated below
                    raise _RowProcessingError("El ID de la zona debe ser un número entero.") from exc
            else:
                payload[column] = raw_value

        for column in ClientService.IMPORT_OPTIONAL_COLUMNS:
            raw_value = _normalize_string(row.get(column))
            if raw_value is None:
                continue
            if column in ClientService.IMPORT_DECIMAL_COLUMNS:
                payload[column] = _parse_decimal(raw_value)
            else:
                payload[column] = raw_value

        return payload

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
    errors: list[schemas.ClientImportError] = None

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []

    def increment_total_rows(self) -> None:
        self.total_rows += 1

    def increment_created(self) -> None:
        self.created_count += 1

    def register_error(
        self,
        row_number: int,
        message: str,
        field_errors: Optional[dict[str, str]] = None,
    ) -> None:
        self.errors.append(
            schemas.ClientImportError(
                row_number=row_number,
                message=message,
                field_errors=field_errors or {},
            )
        )

    def build(self) -> schemas.ClientImportSummary:
        return schemas.ClientImportSummary(
            total_rows=self.total_rows,
            created_count=self.created_count,
            failed_count=len(self.errors),
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
