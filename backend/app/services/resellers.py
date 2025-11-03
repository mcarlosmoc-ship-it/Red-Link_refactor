"""Business logic for reseller operations."""

from __future__ import annotations

from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy.orm import Session, selectinload

from .. import models, schemas


class ResellerService:
    """Operations surrounding resellers, deliveries and settlements."""

    @staticmethod
    def list_resellers(db: Session) -> Iterable[models.Reseller]:
        return (
            db.query(models.Reseller)
            .options(
                selectinload(models.Reseller.deliveries).selectinload(models.ResellerDelivery.items),
                selectinload(models.Reseller.settlements),
            )
            .order_by(models.Reseller.full_name)
            .all()
        )

    @staticmethod
    def get_reseller(db: Session, reseller_id: str) -> Optional[models.Reseller]:
        return (
            db.query(models.Reseller)
            .options(
                selectinload(models.Reseller.deliveries).selectinload(models.ResellerDelivery.items),
                selectinload(models.Reseller.settlements),
            )
            .filter(models.Reseller.id == reseller_id)
            .first()
        )

    @staticmethod
    def create_reseller(db: Session, data: schemas.ResellerCreate) -> models.Reseller:
        reseller = models.Reseller(**data.dict())
        db.add(reseller)
        db.commit()
        db.refresh(reseller)
        return reseller

    @staticmethod
    def record_delivery(db: Session, data: schemas.ResellerDeliveryCreate) -> models.ResellerDelivery:
        delivery = models.ResellerDelivery(
            reseller_id=data.reseller_id,
            delivered_on=data.delivered_on,
            settlement_status=data.settlement_status,
            total_value=data.total_value,
            notes=data.notes,
        )
        db.add(delivery)
        db.flush()

        for item in data.items:
            db.add(
                models.ResellerDeliveryItem(
                    delivery_id=delivery.id,
                    voucher_type_id=item.voucher_type_id,
                    quantity=item.quantity,
                )
            )

        db.commit()
        db.refresh(delivery)
        return delivery

    @staticmethod
    def record_settlement(db: Session, data: schemas.ResellerSettlementCreate) -> models.ResellerSettlement:
        settlement = models.ResellerSettlement(**data.dict())
        db.add(settlement)

        if data.delivery_id:
            delivery = (
                db.query(models.ResellerDelivery)
                .filter(models.ResellerDelivery.id == data.delivery_id)
                .first()
            )
            if delivery:
                delivery.settlement_status = models.DeliverySettlementStatus.SETTLED
                db.add(delivery)

        db.commit()
        db.refresh(settlement)
        return settlement

    @staticmethod
    def delete_reseller(db: Session, reseller: models.Reseller) -> None:
        db.delete(reseller)
        db.commit()

    @staticmethod
    def total_settlements_for_period(db: Session, period_key: str) -> Decimal:
        settlements = db.query(models.ResellerSettlement).all()
        total = Decimal("0")
        for settlement in settlements:
            if period_key:
                if not settlement.settled_on:
                    continue
                if settlement.settled_on.strftime("%Y-%m") != period_key:
                    continue
            total += Decimal(settlement.amount or 0)
        return total
