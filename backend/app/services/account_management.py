"""Service layer for principal and client accounts."""

from __future__ import annotations

import logging
import threading
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional, Tuple
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import session_scope

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
        return items, total

    @staticmethod
    def get_client_account(db: Session, client_id: UUID) -> Optional[models.ClientAccount]:
        return (
            db.query(models.ClientAccount)
            .filter(models.ClientAccount.id == client_id)
            .first()
        )

    @staticmethod
    def _resolve_principal_or_raise(
        db: Session, principal_id: UUID
    ) -> models.PrincipalAccount:
        principal = AccountService.get_principal_account(db, principal_id)
        if principal is None:
            raise PrincipalAccountNotFoundError("La cuenta principal no existe.")
        return principal

    @staticmethod
    def _enforce_client_limit(db: Session, principal_id: UUID) -> None:
        count = (
            db.query(func.count(models.ClientAccount.id))
            .filter(models.ClientAccount.principal_account_id == principal_id)
            .scalar()
        )
        if count >= AccountService.CLIENT_LIMIT_PER_PRINCIPAL:
            raise ClientAccountLimitReached(
                "La cuenta principal ya tiene el máximo de cinco clientes registrados."
            )

    @staticmethod
    def create_client_account(
        db: Session, data: schemas.ClientAccountCreate
    ) -> models.ClientAccount:
        principal = AccountService._resolve_principal_or_raise(
            db, data.principal_account_id
        )
        AccountService._enforce_client_limit(db, principal.id)

        payload = data.model_dump()
        fecha_registro: Optional[datetime] = payload.get("fecha_registro")
        if fecha_registro is None:
            fecha_registro = datetime.now(timezone.utc)
        elif fecha_registro.tzinfo is None:
            fecha_registro = fecha_registro.replace(tzinfo=timezone.utc)
        payload["fecha_registro"] = fecha_registro
        payload["principal_account_id"] = principal.id

        payload["fecha_proximo_pago"] = _add_one_month(fecha_registro.date())

        account = models.ClientAccount(**payload)
        db.add(account)
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
    ) -> models.ClientAccount:
        update_data = data.model_dump(exclude_unset=True)
        principal_id = update_data.get("principal_account_id")
        if principal_id is not None:
            AccountService._resolve_principal_or_raise(db, principal_id)
            if principal_id != account.principal_account_id:
                AccountService._enforce_client_limit(db, principal_id)
            update_data["principal_account_id"] = principal_id

        fecha_registro = update_data.get("fecha_registro")
        if isinstance(fecha_registro, datetime) and fecha_registro.tzinfo is None:
            update_data["fecha_registro"] = fecha_registro.replace(tzinfo=timezone.utc)
        for field, value in update_data.items():
            setattr(account, field, value)
        db.add(account)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise AccountServiceError("El correo del cliente ya está registrado.") from exc
        db.refresh(account)
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
    ) -> models.ClientAccountPayment:
        payment = models.ClientAccountPayment(
            client_account_id=account.id, **data.model_dump()
        )
        account.fecha_proximo_pago = _add_one_month(data.fecha_pago)
        db.add(payment)
        db.add(account)
        db.commit()
        db.refresh(payment)
        db.refresh(account)
        return payment

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
                new_status = "suspendido"
            else:
                new_status = "moroso"
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
        now = datetime.now(timezone.utc)
        wait_time = _seconds_until_next_run(now)
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

