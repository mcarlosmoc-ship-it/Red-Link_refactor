"""Router exposing CRUD operations for inventory items."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import schemas
from ..models.inventory import InventoryStatus
from ..database import get_db
from ..security import require_admin
from ..services import InventoryService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/", response_model=schemas.InventoryListResponse)
def list_inventory(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of inventory items to skip"),
    limit: int = Query(100, ge=1, le=200, description="Maximum number of inventory items to return"),
    base_id: Optional[int] = Query(None, ge=1, description="Filter by base station"),
    status: Optional[InventoryStatus] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search across brand, model, serial and asset tag"),
    assigned: Optional[bool] = Query(None, description="Filter by assignment state"),
) -> schemas.InventoryListResponse:
    items, total = InventoryService.list_items(
        db,
        skip=skip,
        limit=limit,
        base_id=base_id,
        status=status,
        search=search,
        assigned=assigned,
    )
    return schemas.InventoryListResponse(items=items, total=total, limit=limit, skip=skip)


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
