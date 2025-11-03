"""Router containing CRUD operations for clients."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..services import ClientService

router = APIRouter()


@router.get("/", response_model=List[schemas.ClientRead])
def list_clients(db: Session = Depends(get_db)) -> List[schemas.ClientRead]:
    """Return all clients stored in the database."""
    return list(ClientService.list_clients(db))


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
