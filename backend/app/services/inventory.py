"""Business logic for inventory assets."""

from __future__ import annotations

from typing import Iterable, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas


class InventoryService:
    """Operations to manage inventory items."""

    @staticmethod
    def list_items(
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        base_id: Optional[int] = None,
        status: Optional[models.InventoryStatus] = None,
        search: Optional[str] = None,
        assigned: Optional[bool] = None,
    ) -> Tuple[Iterable[models.InventoryItem], int]:
        query = db.query(models.InventoryItem)

        if base_id is not None:
            query = query.filter(models.InventoryItem.base_id == base_id)
        if status is not None:
            query = query.filter(models.InventoryItem.status == status)
        if assigned is not None:
            if assigned:
                query = query.filter(models.InventoryItem.client_id.isnot(None))
            else:
                query = query.filter(models.InventoryItem.client_id.is_(None))
        if search:
            normalized = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(models.InventoryItem.brand).like(normalized),
                    func.lower(models.InventoryItem.model).like(normalized),
                    func.lower(models.InventoryItem.serial_number).like(normalized),
                    func.lower(models.InventoryItem.asset_tag).like(normalized),
                )
            )

        total = query.count()
        items = (
            query.order_by(models.InventoryItem.brand, models.InventoryItem.model)
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def create_item(db: Session, data: schemas.InventoryCreate) -> models.InventoryItem:
        item = models.InventoryItem(**data.dict())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def get_item(db: Session, item_id: str) -> Optional[models.InventoryItem]:
        return db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()

    @staticmethod
    def update_item(db: Session, item: models.InventoryItem, data: schemas.InventoryUpdate) -> models.InventoryItem:
        update_data = data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def delete_item(db: Session, item: models.InventoryItem) -> None:
        db.delete(item)
        db.commit()
