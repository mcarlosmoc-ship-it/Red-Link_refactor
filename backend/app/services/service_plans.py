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
        "category": models.ClientServiceType.INTERNET,
        "description": "Plan base de internet residencial",
        "monthly_price": Decimal("300"),
        "status": models.ServicePlanStatus.ACTIVE,
        "requires_ip": True,
        "requires_base": True,
        "capacity_type": models.CapacityType.UNLIMITED,
        "capacity_limit": None,
    },
    {
        "name": "NETFLIX",
        "category": models.ClientServiceType.STREAMING,
        "description": "Servicio de streaming Netflix",
        "monthly_price": Decimal("120"),
        "status": models.ServicePlanStatus.ACTIVE,
        "requires_ip": False,
        "requires_base": False,
        "capacity_type": models.CapacityType.LIMITED,
        "capacity_limit": 5,
    },
    {
        "name": "SPOTIFY",
        "category": models.ClientServiceType.STREAMING,
        "description": "Servicio de streaming Spotify",
        "monthly_price": Decimal("70"),
        "status": models.ServicePlanStatus.ACTIVE,
        "requires_ip": False,
        "requires_base": False,
        "capacity_type": models.CapacityType.LIMITED,
        "capacity_limit": 5,
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
        category: Optional[models.ClientServiceType] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.ServicePlan], int]:
        ServicePlanService.ensure_defaults(db)

        query = db.query(models.ServicePlan)

        if not include_inactive:
            query = query.filter(models.ServicePlan.status == models.ServicePlanStatus.ACTIVE)

        if category:
            query = query.filter(models.ServicePlan.category == category)

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
        ServicePlanService._apply_defaults(payload)
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
        ServicePlanService._apply_defaults(update_data, original=plan)
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
    def _apply_defaults(payload: dict, *, original: Optional[models.ServicePlan] = None) -> None:
        if "category" in payload:
            category = payload.get("category")
        else:
            category = original.category if original else None

        if category == models.ClientServiceType.INTERNET:
            payload.setdefault("requires_ip", True)
            payload.setdefault("requires_base", True)
        elif category == models.ClientServiceType.STREAMING:
            payload.setdefault("requires_ip", False)
            payload.setdefault("requires_base", False)

        if "capacity_type" not in payload and original is not None:
            payload["capacity_type"] = original.capacity_type

        if payload.get("capacity_type") == models.CapacityType.UNLIMITED:
            payload["capacity_limit"] = None
        elif payload.get("capacity_type") == models.CapacityType.LIMITED:
            limit = payload.get("capacity_limit")
            if limit is None:
                raise ServicePlanError("Los planes con cupo limitado requieren un límite definido.")
            if int(limit) <= 0:
                raise ServicePlanError("El cupo debe ser mayor a cero.")
        elif "capacity_type" in payload and payload.get("capacity_type") is not None:
            raise ServicePlanError("Tipo de capacidad no soportado para el plan.")

        if "status" not in payload and original is not None:
            payload["status"] = original.status

    @staticmethod
    def delete_plan(db: Session, plan: models.ServicePlan) -> None:
        db.delete(plan)
        db.commit()
