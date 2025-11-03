"""Router containing CRUD operations for clients."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter()


@router.get("/", response_model=List[schemas.ClientRead])
def list_clients(db: Session = Depends(get_db)) -> List[schemas.ClientRead]:
    """Return all clients stored in the database."""
    return db.query(models.Client).all()


@router.get("/{client_id}", response_model=schemas.ClientRead)
def get_client(client_id: int, db: Session = Depends(get_db)) -> schemas.ClientRead:
    """Retrieve a single client by its identifier."""
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@router.post("/", response_model=schemas.ClientRead, status_code=status.HTTP_201_CREATED)
def create_client(
    client_in: schemas.ClientCreate,
    db: Session = Depends(get_db),
) -> schemas.ClientRead:
    """Create a new client record."""
    client = models.Client(**client_in.dict())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a client if it exists."""
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    db.delete(client)
    db.commit()


@router.put("/{client_id}", response_model=schemas.ClientRead)
def update_client(
    client_id: int,
    client_in: schemas.ClientCreate,
    db: Session = Depends(get_db),
) -> schemas.ClientRead:
    """Update a client's information."""
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    for key, value in client_in.dict().items():
        setattr(client, key, value)

    db.commit()
    db.refresh(client)
    return client
