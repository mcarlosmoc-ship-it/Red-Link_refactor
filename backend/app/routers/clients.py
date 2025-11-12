"""Router containing CRUD operations for clients."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import schemas
from ..models.client import ServiceStatus
from ..database import get_db
from ..security import require_admin
from ..services import ClientService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/", response_model=schemas.ClientListResponse)
def list_clients(
    skip: int = Query(0, ge=0, description="Number of clients to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of clients to return"),
    search: Optional[str] = Query(None, description="Case-insensitive search by client name"),
    zone_id: Optional[int] = Query(None, ge=1, description="Filter by coverage zone"),
    base_id: Optional[int] = Query(
        None,
        ge=1,
        description="Deprecated: use zone_id instead",
        include_in_schema=False,
    ),
    status: Optional[ServiceStatus] = Query(None, description="Filter by service status"),
    db: Session = Depends(get_db),
) -> schemas.ClientListResponse:
    """Return clients with pagination and optional filters."""
    normalized_search = search.strip() if search else None
    effective_zone_id = zone_id if zone_id is not None else base_id

    items, total = ClientService.list_clients(
        db,
        skip=skip,
        limit=limit,
        search=normalized_search,
        zone_id=effective_zone_id,
        status=status,
    )
    return schemas.ClientListResponse(items=items, total=total, limit=limit, skip=skip)


@router.get("/{client_id}", response_model=schemas.ClientRead)
def get_client(client_id: str, db: Session = Depends(get_db)) -> schemas.ClientRead:
    """Retrieve a single client by its identifier."""
    client = ClientService.get_client(db, client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@router.post("/", response_model=schemas.ClientRead, status_code=status.HTTP_201_CREATED)
def create_client(
    client_in: schemas.ClientCreate,
    db: Session = Depends(get_db),
) -> schemas.ClientRead:
    """Create a new client record."""
    try:
        return ClientService.create_client(db, client_in)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: str, db: Session = Depends(get_db)) -> None:
    """Delete a client if it exists."""
    client = ClientService.get_client(db, client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    ClientService.delete_client(db, client)


@router.put("/{client_id}", response_model=schemas.ClientRead)
def update_client(
    client_id: str,
    client_in: schemas.ClientUpdate,
    db: Session = Depends(get_db),
) -> schemas.ClientRead:
    """Update a client's information."""
    client = ClientService.get_client(db, client_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return ClientService.update_client(db, client, client_in)


@router.get("/import/template", response_class=StreamingResponse)
def download_client_import_template() -> StreamingResponse:
    """Provide a CSV template with the expected client columns."""

    csv_content = ClientService.build_import_template()
    headers = {
        "Content-Disposition": "attachment; filename=client_import_template.csv",
        "Cache-Control": "no-store",
    }
    return StreamingResponse(iter([csv_content]), media_type="text/csv", headers=headers)


@router.post(
    "/import",
    response_model=schemas.ClientImportSummary,
    status_code=status.HTTP_201_CREATED,
)
def import_clients(
    payload: schemas.ClientImportRequest,
    db: Session = Depends(get_db),
) -> schemas.ClientImportSummary:
    """Accept CSV content (as text) and create client records in bulk."""

    if not payload.content or not payload.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo está vacío.",
        )

    try:
        return ClientService.import_clients_from_csv(db, payload.content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
