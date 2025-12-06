from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from time import perf_counter
from typing import Any, Iterable, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from .observability import MetricOutcome, ObservabilityService

CENTS = Decimal("0.01")
QUANTITY_STEP = Decimal("0.001")


class PosServiceError(RuntimeError):
    """Raised when a point of sale operation cannot be completed."""


class PosService:
    """Business operations for catalog products and POS sales."""

    @staticmethod
    def list_products(
        db: Session,
        *,
        include_inactive: bool = False,
        search: Optional[str] = None,
        category: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.PosProduct], int]:
        query = db.query(models.PosProduct)

        if not include_inactive:
            query = query.filter(models.PosProduct.is_active.is_(True))

        if search:
            pattern = f"%{search.lower()}%"
            query = query.filter(
                func.lower(models.PosProduct.name).like(pattern)
                | func.lower(models.PosProduct.category).like(pattern)
                | func.lower(func.coalesce(models.PosProduct.sku, "")).like(pattern)
            )

        if category:
            query = query.filter(func.lower(models.PosProduct.category) == category.lower())

        total = query.count()
        items = (
            query.order_by(models.PosProduct.category.asc(), models.PosProduct.name.asc())
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def create_product(db: Session, data: schemas.PosProductCreate) -> models.PosProduct:
        payload = data.model_dump()
        payload["name"] = payload["name"].strip()
        payload["category"] = payload["category"].strip()
        payload["description"] = payload.get("description") or None
        payload["sku"] = payload.get("sku") or None
        product = models.PosProduct(**payload)
        db.add(product)
        try:
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise PosServiceError("No se pudo crear el producto en este momento.") from exc
        db.refresh(product)
        return product

    @staticmethod
    def update_product(
        db: Session,
        product_id: str,
        data: schemas.PosProductUpdate,
    ) -> models.PosProduct:
        product = (
            db.query(models.PosProduct)
            .filter(models.PosProduct.id == product_id)
            .with_for_update()
            .first()
        )
        if product is None:
            raise ValueError("Producto no encontrado")

        update_data = data.model_dump(exclude_unset=True)
        for field in ("name", "category", "description", "sku"):
            if field in update_data and update_data[field] is not None:
                update_data[field] = update_data[field].strip()
                if not update_data[field]:
                    update_data[field] = None

        for key, value in update_data.items():
            setattr(product, key, value)

        try:
            db.add(product)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise PosServiceError("No se pudo actualizar el producto.") from exc

        db.refresh(product)
        return product

    @staticmethod
    def list_sales(
        db: Session,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        payment_method: Optional[models.PaymentMethod] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[Iterable[models.PosSale], int]:
        query = db.query(models.PosSale).options(selectinload(models.PosSale.items))

        if start_date:
            query = query.filter(models.PosSale.sold_at >= start_date)
        if end_date:
            query = query.filter(models.PosSale.sold_at <= end_date)
        if payment_method:
            query = query.filter(models.PosSale.payment_method == payment_method)

        total = query.count()
        items = (
            query.order_by(models.PosSale.sold_at.desc(), models.PosSale.created_at.desc())
            .offset(max(skip, 0))
            .limit(max(limit, 1))
            .all()
        )
        return items, total

    @staticmethod
    def _ensure_client(db: Session, client_id: Optional[str]) -> Optional[models.Client]:
        if not client_id:
            return None
        client = db.query(models.Client).filter(models.Client.id == client_id).first()
        if client is None:
            raise ValueError("Cliente no encontrado")
        return client

    @staticmethod
    def _generate_ticket_number(db: Session, sold_at: datetime) -> str:
        prefix = sold_at.strftime("POS-%Y%m%d")
        count = (
            db.query(func.count(models.PosSale.id))
            .filter(models.PosSale.ticket_number.like(f"{prefix}%"))
            .scalar()
        ) or 0
        return f"{prefix}-{count + 1:03d}"

    @staticmethod
    def _normalize_decimal(value: Decimal, quantum: Decimal) -> Decimal:
        return value.quantize(quantum, rounding=ROUND_HALF_UP)

    @classmethod
    def create_sale(cls, db: Session, data: schemas.PosSaleCreate) -> models.PosSale:
        start = perf_counter()
        item_categories: dict[str, int] = {}

        try:
            if not data.items:
                raise ValueError("La venta debe incluir al menos un artículo")

            sold_at = data.sold_at or datetime.now(timezone.utc)
            client = cls._ensure_client(db, data.client_id)

            line_items: list[dict[str, Any]] = []
            subtotal = Decimal("0")

            for item in data.items:
                quantity = cls._normalize_decimal(Decimal(item.quantity), QUANTITY_STEP)
                if quantity <= 0:
                    raise ValueError("La cantidad debe ser mayor que cero")

                unit_price = None
                description = None
                product: Optional[models.PosProduct] = None
                item_type = "custom"

                if item.product_id:
                    product = (
                        db.query(models.PosProduct)
                        .filter(models.PosProduct.id == str(item.product_id))
                        .with_for_update()
                        .first()
                    )
                    if product is None or not product.is_active:
                        raise ValueError("Producto no disponible")

                    source_price = item.unit_price or product.unit_price
                    unit_price = cls._normalize_decimal(Decimal(source_price), CENTS)
                    description = (item.description or product.name).strip()
                    item_type = (product.category or "desconocido").lower()
                else:
                    if not item.description:
                        raise ValueError(
                            "Los artículos personalizados requieren una descripción"
                        )
                    if not item.unit_price:
                        raise ValueError("Ingresa un precio unitario para el artículo personalizado")

                    unit_price = cls._normalize_decimal(Decimal(item.unit_price), CENTS)
                    description = item.description.strip()

                if unit_price <= 0:
                    raise ValueError("El precio unitario debe ser mayor que cero")

                item_categories[item_type] = item_categories.get(item_type, 0) + 1

                line_total = cls._normalize_decimal(unit_price * quantity, CENTS)
                subtotal += line_total

                line_items.append(
                    {
                        "product": product,
                        "description": description,
                        "quantity": quantity,
                        "unit_price": unit_price,
                        "total": line_total,
                    }
                )

            discount = cls._normalize_decimal(Decimal(data.discount_amount or 0), CENTS)
            tax = cls._normalize_decimal(Decimal(data.tax_amount or 0), CENTS)

            if discount > subtotal:
                raise ValueError("El descuento no puede ser mayor al subtotal")

            total = subtotal - discount + tax
            total = cls._normalize_decimal(total, CENTS)
            if total < 0:
                raise ValueError("El total no puede ser negativo")

            notes = data.notes.strip() if data.notes else None
            client_name = (
                data.client_name.strip()
                if data.client_name
                else (client.name if client else None)
            )

            ticket_number = cls._generate_ticket_number(db, sold_at)

            sale = models.PosSale(
                ticket_number=ticket_number,
                sold_at=sold_at,
                client=client,
                client_name=client_name,
                subtotal=subtotal,
                discount_amount=discount,
                tax_amount=tax,
                total=total,
                payment_method=data.payment_method,
                notes=notes,
            )

            for item in line_items:
                sale_item = models.PosSaleItem(
                    description=item["description"],
                    quantity=item["quantity"],
                    unit_price=item["unit_price"],
                    total=item["total"],
                    product=item["product"],
                )
                sale.items.append(sale_item)

                product = item["product"]
                if product and product.stock_quantity is not None:
                    remaining = cls._normalize_decimal(
                        Decimal(product.stock_quantity) - item["quantity"],
                        QUANTITY_STEP,
                    )
                    if remaining < 0:
                        raise ValueError(
                            f"Inventario insuficiente para {product.name}. Disponible: {product.stock_quantity}"
                        )
                    product.stock_quantity = remaining

            db.add(sale)

            db.commit()
            db.refresh(sale)

            ObservabilityService.record_event(
                db,
                "pos.sale.captured",
                MetricOutcome.SUCCESS,
                duration_ms=(perf_counter() - start) * 1000,
                tags={
                    "has_client": bool(client),
                    "payment_method": str(data.payment_method.value),
                    "item_types": sorted(item_categories.keys()),
                },
                metadata={"ticket_number": ticket_number, "totals": str(total)},
            )

            return sale
        except (ValueError, PosServiceError) as exc:
            ObservabilityService.record_validation_result(
                db,
                "pos.sale.validation_failed",
                outcome=MetricOutcome.REJECTED,
                reason=str(exc),
                tags={
                    "has_client": bool(data.client_id),
                    "payment_method": str(data.payment_method.value),
                    "item_types": sorted(item_categories.keys()),
                },
                duration_ms=(perf_counter() - start) * 1000,
            )
            raise
        except SQLAlchemyError as exc:
            db.rollback()
            ObservabilityService.record_validation_result(
                db,
                "pos.sale.persistence_failed",
                outcome=MetricOutcome.ERROR,
                reason=str(exc),
                tags={
                    "has_client": bool(data.client_id),
                    "payment_method": str(data.payment_method.value),
                    "item_types": sorted(item_categories.keys()),
                },
                duration_ms=(perf_counter() - start) * 1000,
            )
            raise PosServiceError("No se pudo registrar la venta en este momento.") from exc
