"""Business logic related to client resources."""

from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from .. import models, schemas


class ClientService:
    """Encapsulates CRUD operations for clients."""

    @staticmethod
    def list_clients(db: Session) -> Iterable[models.Client]:
        return db.query(models.Client).order_by(models.Client.full_name).all()

    @staticmethod
    def get_client(db: Session, client_id: str) -> Optional[models.Client]:
        return db.query(models.Client).filter(models.Client.id == client_id).first()

    @staticmethod
    def create_client(db: Session, data: schemas.ClientCreate) -> models.Client:
        client = models.Client(**data.dict())
        db.add(client)
        db.commit()
        db.refresh(client)
        return client

    @staticmethod
    def update_client(db: Session, client: models.Client, data: schemas.ClientUpdate) -> models.Client:
        update_data = data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(client, key, value)
        db.add(client)
        db.commit()
        db.refresh(client)
        return client

    @staticmethod
    def delete_client(db: Session, client: models.Client) -> None:
        db.delete(client)
        db.commit()
