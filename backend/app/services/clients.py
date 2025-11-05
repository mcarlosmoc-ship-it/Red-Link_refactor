"""Business logic related to client resources."""

from __future__ import annotations

from typing import Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas


class ClientService:
    """Encapsulates CRUD operations for clients."""

    @staticmethod
    def list_clients(
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        base_id: Optional[int] = None,
        status: Optional[models.ServiceStatus] = None,
    ) -> Tuple[Iterable[models.Client], int]:
        query = db.query(models.Client)

        if search:
            normalized = f"%{search.lower()}%"
            query = query.filter(func.lower(models.Client.full_name).like(normalized))

        if base_id is not None:
            query = query.filter(models.Client.base_id == base_id)

        if status is not None:
            query = query.filter(models.Client.service_status == status)

        total = query.count()
        items = (
            query.order_by(models.Client.full_name)
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

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
        change_logs = []

        for key, value in update_data.items():
            current_value = getattr(client, key)
            if current_value == value:
                continue
            setattr(client, key, value)
            change_logs.append(
                models.ClientChangeLog(
                    client=client,
                    field_name=key,
                    old_value=None if current_value is None else str(current_value),
                    new_value=None if value is None else str(value),
                    change_source="api",
                )
            )

        db.add(client)
        if change_logs:
            db.add_all(change_logs)
        db.commit()
        db.refresh(client)
        return client

    @staticmethod
    def delete_client(db: Session, client: models.Client) -> None:
        db.delete(client)
        db.commit()
