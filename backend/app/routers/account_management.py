"""Routers for managing principal accounts, client accounts, and their payments."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..security import AdminIdentity, require_admin
from ..services.account_management import (
    AccountService,
    AccountServiceError,
    ClientAccountLimitReached,
    PrincipalAccountNotFoundError,
)

router = APIRouter()


@router.get(
    "/principal-accounts",
    response_model=schemas.PrincipalAccountListResponse,
)
def list_principal_accounts(
    skip: int = Query(0, ge=0, description="Número de cuentas a omitir"),
    limit: int = Query(50, ge=1, le=200, description="Cantidad máxima de cuentas"),
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.PrincipalAccountListResponse:
    items, total = AccountService.list_principal_accounts(db, skip=skip, limit=limit)
    return schemas.PrincipalAccountListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post(
    "/principal-accounts",
    response_model=schemas.PrincipalAccountRead,
    status_code=status.HTTP_201_CREATED,
)
def create_principal_account(
    payload: schemas.PrincipalAccountCreate,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.PrincipalAccountRead:
    try:
        return AccountService.create_principal_account(db, payload)
    except AccountServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/principal-accounts/{principal_id}",
    response_model=schemas.PrincipalAccountRead,
)
def get_principal_account(
    principal_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.PrincipalAccountRead:
    account = AccountService.get_principal_account(db, principal_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta principal no encontrada")
    return account


@router.put(
    "/principal-accounts/{principal_id}",
    response_model=schemas.PrincipalAccountRead,
)
def update_principal_account(
    principal_id: UUID,
    payload: schemas.PrincipalAccountUpdate,
    db: Session = Depends(get_db),
) -> schemas.PrincipalAccountRead:
    account = AccountService.get_principal_account(db, principal_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta principal no encontrada")
    try:
        return AccountService.update_principal_account(db, account, payload)
    except AccountServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete(
    "/principal-accounts/{principal_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_principal_account(
    principal_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> None:
    account = AccountService.get_principal_account(db, principal_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta principal no encontrada")
    AccountService.delete_principal_account(db, account)


@router.get(
    "/client-accounts",
    response_model=schemas.ClientAccountListResponse,
)
def list_client_accounts(
    skip: int = Query(0, ge=0, description="Número de cuentas a omitir"),
    limit: int = Query(50, ge=1, le=200, description="Cantidad máxima de cuentas"),
    principal_account_id: Optional[UUID] = Query(
        None, description="Filtrar por el identificador de la cuenta principal"
    ),
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.ClientAccountListResponse:
    items, total = AccountService.list_client_accounts(
        db,
        skip=skip,
        limit=limit,
        principal_account_id=principal_account_id,
        actor=current_admin,
    )
    return schemas.ClientAccountListResponse(items=items, total=total, limit=limit, skip=skip)


@router.post(
    "/client-accounts",
    response_model=schemas.ClientAccountRead,
    status_code=status.HTTP_201_CREATED,
)
def create_client_account(
    payload: schemas.ClientAccountCreate,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.ClientAccountRead:
    try:
        return AccountService.create_client_account(db, payload, actor=current_admin)
    except PrincipalAccountNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ClientAccountLimitReached as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except AccountServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/client-accounts/{client_account_id}",
    response_model=schemas.ClientAccountRead,
)
def get_client_account(
    client_account_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.ClientAccountRead:
    account = AccountService.get_client_account(db, client_account_id, actor=current_admin)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta de cliente no encontrada")
    return account


@router.put(
    "/client-accounts/{client_account_id}",
    response_model=schemas.ClientAccountRead,
)
def update_client_account(
    client_account_id: UUID,
    payload: schemas.ClientAccountUpdate,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.ClientAccountRead:
    account = AccountService.get_client_account(db, client_account_id, actor=current_admin)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta de cliente no encontrada")
    try:
        return AccountService.update_client_account(db, account, payload, actor=current_admin)
    except PrincipalAccountNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AccountServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete(
    "/client-accounts/{client_account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_client_account(
    client_account_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> None:
    account = AccountService.get_client_account(db, client_account_id, actor=current_admin)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta de cliente no encontrada")
    AccountService.delete_client_account(db, account)


@router.post(
    "/client-accounts/{client_account_id}/payments",
    response_model=schemas.ServicePaymentRead,
    status_code=status.HTTP_201_CREATED,
)
def register_client_payment(
    client_account_id: UUID,
    payload: schemas.ClientAccountPaymentCreate,
    db: Session = Depends(get_db),
    current_admin: AdminIdentity = Depends(require_admin),
) -> schemas.ClientAccountPaymentRead:
    account = AccountService.get_client_account(db, client_account_id, actor=current_admin)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta de cliente no encontrada")
    try:
        return AccountService.register_payment(db, account, payload, actor=current_admin)
    except AccountServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

