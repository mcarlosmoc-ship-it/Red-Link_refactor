"""Router for client service contract management."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models.client_service import ClientServiceStatus, ClientServiceType
from ..security import require_admin
from ..services import ClientContractError, ClientContractService


def _build_error_detail(exc: Exception) -> object:
    if isinstance(exc, ClientContractError):
        detail = getattr(exc, "detail", None)
        if detail is not None:
            return detail
    if exc.args:
        return exc.args[0]
    return str(exc)

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/", response_model=schemas.ClientServiceListResponse)
def list_services(
    db: Session = Depends(get_db),
    client_id: Optional[str] = Query(None, description="Filter by client"),
    service_type: Optional[ClientServiceType] = Query(None, description="Filter by type"),
    status: Optional[ClientServiceStatus] = Query(None, description="Filter by status"),
    skip: int = Query(0, ge=0, description="Records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Records to return"),
):
    items, total = ClientContractService.list_services(
        db,
        client_id=client_id,
        service_type=service_type,
        status=status,
        skip=skip,
        limit=limit,
    )
    return schemas.ClientServiceListResponse(
        items=items,
        total=total,
        limit=limit,
        skip=skip,
    )


@router.post("/", response_model=schemas.ClientServiceRead, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: schemas.ClientServiceCreate, db: Session = Depends(get_db)
) -> schemas.ClientServiceRead:
    try:
        return ClientContractService.create_service(db, payload)
    except (ValueError, ClientContractError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=_build_error_detail(exc)
        ) from exc


@router.post(
    "/bulk",
    response_model=List[schemas.ClientServiceRead],
    status_code=status.HTTP_201_CREATED,
)
def bulk_create_services(
    payload: schemas.ClientServiceBulkCreate, db: Session = Depends(get_db)
) -> List[schemas.ClientServiceRead]:
    try:
        return ClientContractService.bulk_create_services(db, payload)
    except (ValueError, ClientContractError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=_build_error_detail(exc)
        ) from exc


@router.post(
    "/bulk-assign",
    response_model=List[schemas.ClientServiceRead],
    status_code=status.HTTP_201_CREATED,
)
def bulk_assign_services(
    payload: schemas.ClientServiceBulkCreate, db: Session = Depends(get_db)
) -> List[schemas.ClientServiceRead]:
    try:
        return ClientContractService.bulk_create_services(db, payload)
    except (ValueError, ClientContractError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=_build_error_detail(exc)
        ) from exc


@router.get("/{service_id}", response_model=schemas.ClientServiceRead)
def get_service(service_id: str, db: Session = Depends(get_db)) -> schemas.ClientServiceRead:
    service = ClientContractService.get_service(db, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    return service


@router.get("/{service_id}/debt", response_model=schemas.ServiceDebtRead)
def get_service_debt(
    service_id: str, db: Session = Depends(get_db)
) -> schemas.ServiceDebtRead:
    service = ClientContractService.get_service(db, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    return schemas.ServiceDebtRead.model_validate(service)


@router.put("/{service_id}/debt", response_model=schemas.ServiceDebtRead)
def update_service_debt(
    service_id: str,
    payload: schemas.ServiceDebtUpdate,
    db: Session = Depends(get_db),
) -> schemas.ServiceDebtRead:
    service = ClientContractService.get_service(db, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")

    try:
        updated = ClientContractService.update_service_debt(db, service, payload)
    except ClientContractError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=_build_error_detail(exc)
        ) from exc

    return schemas.ServiceDebtRead.model_validate(updated)


@router.put("/{service_id}", response_model=schemas.ClientServiceRead)
def update_service(
    service_id: str,
    payload: schemas.ClientServiceUpdate,
    db: Session = Depends(get_db),
) -> schemas.ClientServiceRead:
    service = ClientContractService.get_service(db, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    try:
        return ClientContractService.update_service(db, service, payload)
    except ClientContractError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=_build_error_detail(exc)
        ) from exc


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(service_id: str, db: Session = Depends(get_db)) -> None:
    service = ClientContractService.get_service(db, service_id)
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    ClientContractService.delete_service(db, service)
