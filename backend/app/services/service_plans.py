"""Business logic for managing reusable service plans."""

from __future__ import annotations

from decimal import Decimal
from typing import Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas


DEFAULT_SERVICE_PLANS = [
    {
        "name": "Internet mensual",
        "service_type": models.ClientServiceType.INTERNET,
        "description": "Plan base de internet residencial",
        "default_monthly_fee": Decimal("300"),
        "is_active": True,
        "requires_ip": True,
        "requires_base": True,
    },
    {
        "name": "NETFLIX",
        "service_type": models.ClientServiceType.STREAMING,
        "description": "Servicio de streaming Netflix",
        "default_monthly_fee": Decimal("120"),
        "is_active": True,
        "requires_ip": False,
        "requires_base": False,
    },
    {
        "name": "SPOTIFY",
        "service_type": models.ClientServiceType.STREAMING,
        "description": "Servicio de streaming Spotify",
        "default_monthly_fee": Decimal("70"),
        "is_active": True,
        "requires_ip": False,
        "requires_base": False,
    },
]


class ServicePlanError(RuntimeError):
    """Raised when operations on the service plan catalog fail."""


class ServicePlanService:
    """Encapsulates catalog operations for service plans."""

    @staticmethod
    def ensure_defaults(db: Session) -> None:
        existing_names = {
            name for (name,) in db.query(models.ServicePlan.name).all()
        }
        created = False
        for plan in DEFAULT_SERVICE_PLANS:
            if plan["name"] in existing_names:
                continue
            record = models.ServicePlan(**plan)
            db.add(record)
            created = True
        if created:
            db.commit()

    @staticmethod
    def list_plans(
        db: Session,
        *,
        include_inactive: bool = True,
        service_type: Optional[models.ClientServiceType] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.ServicePlan], int]:
        ServicePlanService.ensure_defaults(db)

        query = db.query(models.ServicePlan)

        if not include_inactive:
            query = query.filter(models.ServicePlan.is_active.is_(True))

        if service_type:
            query = query.filter(models.ServicePlan.service_type == service_type)

        if search:
            normalized = f"%{search.strip().lower()}%"
            query = query.filter(func.lower(models.ServicePlan.name).like(normalized))

        total = query.count()
        items = (
            query.order_by(models.ServicePlan.name.asc())
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def get_plan(db: Session, plan_id: int) -> Optional[models.ServicePlan]:
        return db.query(models.ServicePlan).filter(models.ServicePlan.id == plan_id).first()

    @staticmethod
    def create_plan(db: Session, data: schemas.ServicePlanCreate) -> models.ServicePlan:
        payload = data.model_dump()
        payload["name"] = payload["name"].strip()
        ServicePlanService._apply_flag_defaults(payload)
        plan = models.ServicePlan(**payload)
        db.add(plan)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ServicePlanError("Ya existe un servicio mensual con ese nombre.") from exc
        db.refresh(plan)
        return plan

    @staticmethod
    def update_plan(
        db: Session,
        plan: models.ServicePlan,
        data: schemas.ServicePlanUpdate,
    ) -> models.ServicePlan:
        update_data = data.model_dump(exclude_unset=True)
        if "name" in update_data and update_data["name"]:
            update_data["name"] = update_data["name"].strip()
        if "service_type" in update_data:
            ServicePlanService._apply_flag_defaults(update_data)
        for field, value in update_data.items():
            setattr(plan, field, value)
        try:
            db.add(plan)
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise ServicePlanError("Ya existe un servicio mensual con ese nombre.") from exc
        db.refresh(plan)
        return plan

    @staticmethod
    def _apply_flag_defaults(payload: dict) -> None:
        service_type = payload.get("service_type")
        if service_type == models.ClientServiceType.INTERNET:
            payload["requires_ip"] = True
            payload["requires_base"] = True
        elif service_type == models.ClientServiceType.STREAMING:
            payload["requires_ip"] = False
            payload["requires_base"] = False

    @staticmethod
    def delete_plan(db: Session, plan: models.ServicePlan) -> None:
        db.delete(plan)
        db.commit()
