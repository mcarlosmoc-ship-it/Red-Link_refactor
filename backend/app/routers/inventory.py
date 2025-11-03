"""Router exposing CRUD operations for inventory items."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..services import InventoryService

router = APIRouter()


@router.get("/", response_model=List[schemas.InventoryRead])
def list_inventory(db: Session = Depends(get_db)) -> List[schemas.InventoryRead]:
    return list(InventoryService.list_items(db))


@router.post("/", response_model=schemas.InventoryRead, status_code=status.HTTP_201_CREATED)
def create_inventory_item(item_in: schemas.InventoryCreate, db: Session = Depends(get_db)) -> schemas.InventoryRead:
    return InventoryService.create_item(db, item_in)


@router.put("/{item_id}", response_model=schemas.InventoryRead)
def update_inventory_item(
    item_id: str,
    item_in: schemas.InventoryUpdate,
    db: Session = Depends(get_db),
) -> schemas.InventoryRead:
    item = InventoryService.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return InventoryService.update_item(db, item, item_in)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_item(item_id: str, db: Session = Depends(get_db)) -> None:
    item = InventoryService.get_item(db, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    InventoryService.delete_item(db, item)
