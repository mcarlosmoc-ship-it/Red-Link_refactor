"""Service layer for principal and client accounts."""

from __future__ import annotations

import logging
import threading
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable, Optional, Tuple
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..models.client_service import ClientServiceStatus, ClientServiceType
from .client_contracts import ClientContractError, ClientContractService
from .payments import PaymentService, PaymentServiceError
from ..models.audit import ClientAccountSecurityAction
from ..database import session_scope
from ..security import AdminIdentity
from .scheduler_monitor import JOB_OVERDUE_MONITOR, SchedulerMonitor

LOGGER = logging.getLogger(__name__)


class AccountServiceError(Exception):
    """Base class for account related errors."""


class PrincipalAccountNotFoundError(AccountServiceError):
    """Raised when attempting to operate on a missing principal account."""


class ClientAccountLimitReached(AccountServiceError):
    """Raised when a principal account has reached the client limit."""


def _add_one_month(base_date: date) -> date:
    """Return the same day on the next month adjusting the day if necessary."""

    year = base_date.year + (base_date.month // 12)
    month = base_date.month % 12 + 1
    last_day = monthrange(year, month)[1]
    return date(year, month, min(base_date.day, last_day))


class AccountService:
    """Operations for managing principal and client accounts."""

    CLIENT_LIMIT_PER_PRINCIPAL = 5
    STREAMING_SERVICE_TYPES = {ClientServiceType.STREAMING}

    @staticmethod
    def _normalize_account_status(
        status: models.ClientAccountStatus | str,
    ) -> models.ClientAccountStatus:
        if isinstance(status, models.ClientAccountStatus):
            return status
        normalized = str(status).strip().lower()
        try:
            return models.ClientAccountStatus(normalized)
        except ValueError as exc:
            raise AccountServiceError("El estatus del cliente no es válido.") from exc

    @staticmethod
    def _ensure_profile(
        db: Session, profile: str
    ) -> str:
        normalized = str(profile).strip()
        if not normalized:
            raise AccountServiceError("El perfil del cliente no puede estar vacío.")
        existing = (
            db.query(models.ClientAccountProfile)
            .filter(models.ClientAccountProfile.profile == normalized)
            .one_or_none()
        )
        if existing is None:
            db.add(models.ClientAccountProfile(profile=normalized))
            db.flush()
        return normalized

    @staticmethod
    def list_principal_accounts(
        db: Session,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[Iterable[models.PrincipalAccount], int]:
        query = db.query(models.PrincipalAccount)
        total = query.count()
        items = (
            query.order_by(models.PrincipalAccount.fecha_alta)
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def get_principal_account(db: Session, principal_id: UUID) -> Optional[models.PrincipalAccount]:
        return (
            db.query(models.PrincipalAccount)
            .filter(models.PrincipalAccount.id == principal_id)
            .first()
        )

    @staticmethod
    def create_principal_account(
        db: Session, data: schemas.PrincipalAccountCreate
    ) -> models.PrincipalAccount:
        account = models.PrincipalAccount(**data.model_dump())
        db.add(account)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise AccountServiceError("El correo principal ya está registrado.") from exc
        db.refresh(account)
        return account

    @staticmethod
    def update_principal_account(
        db: Session,
        account: models.PrincipalAccount,
        data: schemas.PrincipalAccountUpdate,
    ) -> models.PrincipalAccount:
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(account, field, value)
        db.add(account)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise AccountServiceError("El correo principal ya está registrado.") from exc
        db.refresh(account)
        return account

    @staticmethod
    def delete_principal_account(db: Session, account: models.PrincipalAccount) -> None:
        db.delete(account)
        db.commit()

    @staticmethod
    def list_client_accounts(
        db: Session,
        *,
        skip: int = 0,
        limit: int = 50,
        principal_account_id: Optional[UUID] = None,
        actor: Optional[AdminIdentity] = None,
    ) -> Tuple[Iterable[models.ClientAccount], int]:
        query = db.query(models.ClientAccount)
        if principal_account_id is not None:
            query = query.filter(
                models.ClientAccount.principal_account_id == principal_account_id
            )
        total = query.count()
        items = (
            query.order_by(models.ClientAccount.nombre_cliente)
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        AccountService._record_bulk_access_events(db, [item.id for item in items], actor)
        return items, total

    @staticmethod
    def get_client_account(
        db: Session, client_id: UUID, *, actor: Optional[AdminIdentity] = None
    ) -> Optional[models.ClientAccount]:
        account = (
            db.query(models.ClientAccount)
            .filter(models.ClientAccount.id == client_id)
            .first()
        )
        if account is not None:
            AccountService._record_security_event(
                db,
                account.id,
                ClientAccountSecurityAction.DATA_ACCESSED,
                actor,
                context={"operation": "get_client_account"},
            )
        return account

    @staticmethod
    def _resolve_principal_or_raise(
        db: Session, principal_id: UUID
    ) -> models.PrincipalAccount:
        principal = AccountService.get_principal_account(db, principal_id)
        if principal is None:
            raise PrincipalAccountNotFoundError("La cuenta principal no existe.")
        return principal

    @staticmethod
    def _ensure_streaming_service(service: models.ClientService) -> None:
        if service.category not in AccountService.STREAMING_SERVICE_TYPES:
            raise AccountServiceError("El servicio seleccionado no es de streaming.")

    @staticmethod
    def _create_streaming_service(
        db: Session,
        *,
        principal: models.PrincipalAccount,
        client_id: str,
        service_plan: models.ServicePlan,
        profile_name: Optional[str],
        next_billing_date: Optional[date],
    ) -> models.ClientService:
        metadata = {"principal_account_id": str(principal.id)}
        if profile_name:
            metadata["profile_name"] = profile_name
        service_payload = schemas.ClientServiceCreate(
            client_id=client_id,
            service_id=service_plan.id,
            next_billing_date=next_billing_date,
            metadata=metadata,
            status=ClientServiceStatus.ACTIVE,
        )
        try:
            return ClientContractService.create_service(db, service_payload)
        except ClientContractError as exc:
            raise AccountServiceError(str(exc)) from exc

    @staticmethod
    def _pick_streaming_plan(
        db: Session, plan_id: Optional[int]
    ) -> models.ServicePlan:
        plan: Optional[models.ServicePlan]
        if plan_id is not None:
            plan = ClientContractService._resolve_service_plan(db, plan_id)
        else:
            plan = (
                db.query(models.ServicePlan)
                .filter(
                    models.ServicePlan.category == ClientServiceType.STREAMING,
                    models.ServicePlan.status == models.ServicePlanStatus.ACTIVE,
                )
                .order_by(models.ServicePlan.name.asc())
                .first()
            )
        if plan is None or plan.category != ClientServiceType.STREAMING:
            raise AccountServiceError("No se encontró un plan de streaming activo.")
        return plan

    @staticmethod
    def _enforce_client_limit(db: Session, principal: models.PrincipalAccount) -> None:
        max_slots = principal.max_slots or AccountService.CLIENT_LIMIT_PER_PRINCIPAL
        count = (
            db.query(func.count(models.ClientAccount.id))
            .filter(models.ClientAccount.principal_account_id == principal.id)
            .scalar()
        )
        if count >= max_slots:
            raise ClientAccountLimitReached(
                f"La cuenta principal ya tiene el máximo de {max_slots} clientes registrados."
            )

    @staticmethod
    def create_client_account(
        db: Session, data: schemas.ClientAccountCreate, *, actor: Optional[AdminIdentity] = None
    ) -> models.ClientAccount:
        principal = AccountService._resolve_principal_or_raise(
            db, data.principal_account_id
        )
        AccountService._enforce_client_limit(db, principal)

        payload = data.model_dump()
        service_id = payload.pop("client_service_id", None)
        payload.pop("service_type", None)
        service_plan_id = payload.pop("service_id", None)
        fecha_registro: Optional[datetime] = payload.get("fecha_registro")
        if fecha_registro is None:
            fecha_registro = datetime.now(timezone.utc)
        elif fecha_registro.tzinfo is None:
            fecha_registro = fecha_registro.replace(tzinfo=timezone.utc)
        payload["fecha_registro"] = fecha_registro
        payload["principal_account_id"] = principal.id

        payload["fecha_proximo_pago"] = _add_one_month(fecha_registro.date())
        payload["perfil"] = AccountService._ensure_profile(db, payload["perfil"])
        payload["estatus"] = AccountService._normalize_account_status(payload["estatus"])

        streaming_service: Optional[models.ClientService] = None
        client_id_for_service = payload.get("client_id")
        if service_id:
            streaming_service = ClientContractService.get_service(db, service_id)
            if streaming_service is None:
                raise AccountServiceError("El servicio seleccionado no existe.")
            AccountService._ensure_streaming_service(streaming_service)
        elif client_id_for_service:
            service_plan = AccountService._pick_streaming_plan(db, service_plan_id)
            display_name = payload.get("nombre_cliente") or payload.get("correo_cliente")
            display_name = display_name.strip() if display_name else "Streaming"
            streaming_service = AccountService._create_streaming_service(
                db,
                principal=principal,
                client_id=client_id_for_service,
                service_plan=service_plan,
                profile_name=display_name,
                next_billing_date=payload.get("fecha_proximo_pago"),
            )

        if streaming_service is not None:
            payload["client_service_id"] = streaming_service.id
            payload["client_id"] = streaming_service.client_id
            if payload.get("fecha_proximo_pago"):
                streaming_service.next_billing_date = payload["fecha_proximo_pago"]
                db.add(streaming_service)

        account = models.ClientAccount(**payload)
        security_event = models.ClientAccountSecurityEvent(
            client_account=account,
            action=ClientAccountSecurityAction.PASSWORD_CREATED,
            performed_by=actor.username if actor else None,
            context={"operation": "create_client_account"},
        )
        db.add(account)
        db.add(security_event)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise AccountServiceError("El correo del cliente ya está registrado.") from exc
        db.refresh(account)
        return account

    @staticmethod
    def update_client_account(
        db: Session,
        account: models.ClientAccount,
        data: schemas.ClientAccountUpdate,
        *,
        actor: Optional[AdminIdentity] = None,
    ) -> models.ClientAccount:
        update_data = data.model_dump(exclude_unset=True)
        if "perfil" in update_data:
            update_data["perfil"] = AccountService._ensure_profile(
                db, update_data["perfil"]
            )
        if "estatus" in update_data:
            update_data["estatus"] = AccountService._normalize_account_status(
                update_data["estatus"]
            )
        principal_id = update_data.get("principal_account_id")
        principal_for_service: models.PrincipalAccount
        if principal_id is not None:
            new_principal = AccountService._resolve_principal_or_raise(db, principal_id)
            if principal_id != account.principal_account_id:
                AccountService._enforce_client_limit(db, new_principal)
            update_data["principal_account_id"] = principal_id
            principal_for_service = new_principal
        else:
            principal_for_service = AccountService._resolve_principal_or_raise(
                db, account.principal_account_id
            )

        update_data.pop("service_type", None)
        plan_id_for_service = update_data.pop("service_id", None)
        if "client_service_id" in update_data:
            new_service_id = update_data.get("client_service_id")
            client_id_for_service = update_data.get("client_id", account.client_id)
            if new_service_id:
                streaming_service = ClientContractService.get_service(db, new_service_id)
                if streaming_service is None:
                    raise AccountServiceError("El servicio seleccionado no existe.")
                AccountService._ensure_streaming_service(streaming_service)
                update_data["client_id"] = streaming_service.client_id
                next_payment = update_data.get("fecha_proximo_pago")
                if next_payment:
                    streaming_service.next_billing_date = next_payment
                    db.add(streaming_service)
            elif client_id_for_service:
                display_name = (
                    update_data.get("nombre_cliente")
                    or account.nombre_cliente
                    or account.correo_cliente
                    or "Streaming"
                )
                service_plan = AccountService._pick_streaming_plan(db, plan_id_for_service)
                streaming_service = AccountService._create_streaming_service(
                    db,
                    principal=principal_for_service,
                    client_id=client_id_for_service,
                    service_plan=service_plan,
                    profile_name=display_name,
                    next_billing_date=update_data.get("fecha_proximo_pago"),
                )
                update_data["client_service_id"] = streaming_service.id
                update_data["client_id"] = streaming_service.client_id
            else:
                update_data["client_service_id"] = None

        fecha_registro = update_data.get("fecha_registro")
        if isinstance(fecha_registro, datetime) and fecha_registro.tzinfo is None:
            update_data["fecha_registro"] = fecha_registro.replace(tzinfo=timezone.utc)
        password_changed = False
        for field, value in update_data.items():
            setattr(account, field, value)
            if field == "contrasena_cliente":
                password_changed = True
        db.add(account)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise AccountServiceError("El correo del cliente ya está registrado.") from exc
        db.refresh(account)
        if password_changed:
            AccountService._record_security_event(
                db,
                account.id,
                ClientAccountSecurityAction.PASSWORD_CHANGED,
                actor,
                context={"operation": "update_client_account"},
            )
        return account

    @staticmethod
    def delete_client_account(db: Session, account: models.ClientAccount) -> None:
        db.delete(account)
        db.commit()

    @staticmethod
    def register_payment(
        db: Session,
        account: models.ClientAccount,
        data: schemas.ClientAccountPaymentCreate,
        *,
        actor: Optional[AdminIdentity] = None,
    ) -> models.ServicePayment:
        if not account.client_service_id:
            raise AccountServiceError(
                "El cliente no tiene un servicio asociado para registrar pagos."
            )

        try:
            payment_result = PaymentService.create_payment(
                db,
                schemas.ServicePaymentCreate(
                    client_service_id=str(account.client_service_id),
                    paid_on=data.fecha_pago,
                    amount=data.monto,
                    method=models.PaymentMethod(data.metodo_pago),
                    period_key=data.periodo_correspondiente,
                    note=data.notas,
                    recorded_by=actor.username if actor else None,
                ),
            )
            payment = payment_result.payment
        except (ValueError, PaymentServiceError) as exc:
            raise AccountServiceError(str(exc)) from exc

        AccountService._record_security_event(
            db,
            account.id,
            ClientAccountSecurityAction.DATA_ACCESSED,
            actor,
            context={"operation": "register_payment"},
        )
        return payment

    @staticmethod
    def _record_security_event(
        db: Session,
        account_id: UUID,
        action: ClientAccountSecurityAction,
        actor: Optional[AdminIdentity],
        *,
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        event = models.ClientAccountSecurityEvent(
            client_account_id=account_id,
            action=action,
            performed_by=actor.username if actor else None,
            context=context,
        )
        db.add(event)
        db.commit()

    @staticmethod
    def _record_bulk_access_events(
        db: Session, account_ids: Iterable[UUID], actor: Optional[AdminIdentity]
    ) -> None:
        events = [
            models.ClientAccountSecurityEvent(
                client_account_id=account_id,
                action=ClientAccountSecurityAction.DATA_ACCESSED,
                performed_by=actor.username if actor else None,
                context={"operation": "list_client_accounts"},
            )
            for account_id in account_ids
        ]
        if not events:
            return
        db.add_all(events)
        db.commit()

    @staticmethod
    def mark_overdue_accounts(
        db: Session, *, reference_date: Optional[date] = None
    ) -> int:
        reference = reference_date or date.today()
        suspension_threshold = reference - timedelta(days=30)

        query = (
            db.query(models.ClientAccount)
            .filter(models.ClientAccount.fecha_proximo_pago.isnot(None))
            .filter(models.ClientAccount.fecha_proximo_pago < reference)
        )
        updated = 0
        for account in query.all():
            if account.fecha_proximo_pago and account.fecha_proximo_pago <= suspension_threshold:
                new_status = models.ClientAccountStatus.SUSPENDIDO
            else:
                new_status = models.ClientAccountStatus.MOROSO
            if account.estatus != new_status:
                account.estatus = new_status
                db.add(account)
                updated += 1
        if updated:
            db.commit()
        return updated


_overdue_monitor_thread: Optional[threading.Thread] = None
_overdue_monitor_stop = threading.Event()


def _seconds_until_next_run(now: datetime) -> float:
    next_run_date = now.date() + timedelta(days=1)
    next_run = datetime.combine(next_run_date, time.min, tzinfo=now.tzinfo)
    delay = (next_run - now).total_seconds()
    return max(delay, 60.0)


def _overdue_worker() -> None:
    while not _overdue_monitor_stop.is_set():
        try:
            with session_scope() as session:
                updated = AccountService.mark_overdue_accounts(session)
                if updated:
                    LOGGER.info("Updated %s client account statuses due to overdue payments", updated)
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.exception("Failed to process overdue client accounts: %s", exc)
            SchedulerMonitor.record_error(JOB_OVERDUE_MONITOR, str(exc))
        now = datetime.now(timezone.utc)
        wait_time = _seconds_until_next_run(now)
        SchedulerMonitor.record_tick(JOB_OVERDUE_MONITOR)
        _overdue_monitor_stop.wait(wait_time)


def start_overdue_monitor() -> None:
    """Start the background task that marks overdue accounts daily."""

    global _overdue_monitor_thread
    if _overdue_monitor_thread and _overdue_monitor_thread.is_alive():
        return
    _overdue_monitor_stop.clear()
    _overdue_monitor_thread = threading.Thread(target=_overdue_worker, daemon=True)
    _overdue_monitor_thread.start()


def stop_overdue_monitor() -> None:
    """Stop the overdue monitor background task."""

    _overdue_monitor_stop.set()
    if _overdue_monitor_thread and _overdue_monitor_thread.is_alive():
        _overdue_monitor_thread.join(timeout=5)
