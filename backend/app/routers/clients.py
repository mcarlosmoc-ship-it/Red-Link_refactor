"""Router containing CRUD operations for clients."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..models.client import ServiceStatus
from ..database import get_db
from ..services import ClientService

router = APIRouter()


@router.get("/", response_model=schemas.ClientListResponse)
def list_clients(
    skip: int = Query(0, ge=0, description="Number of clients to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of clients to return"),
    search: Optional[str] = Query(None, description="Case-insensitive search by client name"),
    base_id: Optional[int] = Query(None, ge=1, description="Filter by base station"),
    status: Optional[ServiceStatus] = Query(None, description="Filter by service status"),
    db: Session = Depends(get_db),
) -> schemas.ClientListResponse:
    """Return clients with pagination and optional filters."""
    normalized_search = search.strip() if search else None
    items, total = ClientService.list_clients(
        db,
        skip=skip,
        limit=limit,
        search=normalized_search,
        base_id=base_id,
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
    return ClientService.create_client(db, client_in)


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
