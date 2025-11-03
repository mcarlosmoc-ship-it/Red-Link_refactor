"""Business logic for inventory assets."""

from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from .. import models, schemas


class InventoryService:
    """Operations to manage inventory items."""

    @staticmethod
    def list_items(db: Session) -> Iterable[models.InventoryItem]:
        return db.query(models.InventoryItem).order_by(models.InventoryItem.brand).all()

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
