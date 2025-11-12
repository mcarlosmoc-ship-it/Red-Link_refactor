"""Inventory movement history for hardware assets."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class InventoryMovementType(str, enum.Enum):
    """Types of movements tracked for inventory items."""

    TRANSFER = "transfer"
    ASSIGNMENT = "assignment"
    RETURN = "return"
    MAINTENANCE = "maintenance"
    ADJUSTMENT = "adjustment"


MOVEMENT_TYPE_ENUM = SAEnum(
    InventoryMovementType,
    name="inventory_movement_type_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class InventoryMovement(Base):
    """Represents a change in the location or status of an inventory item."""

    __tablename__ = "inventory_movements"

    id = Column("movement_id", GUID(), primary_key=True, default=uuid.uuid4)
    inventory_id = Column(
        GUID(),
        ForeignKey("inventory_items.inventory_id", ondelete="CASCADE"),
        nullable=False,
    )
    movement_type = Column(MOVEMENT_TYPE_ENUM, nullable=False)
    from_base_id = Column(Integer, ForeignKey("zones.zone_id", ondelete="SET NULL"), nullable=True)
    to_base_id = Column(Integer, ForeignKey("zones.zone_id", ondelete="SET NULL"), nullable=True)
    from_client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="SET NULL"),
        nullable=True,
    )
    to_client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="SET NULL"),
        nullable=True,
    )
    performed_by = Column(String(120), nullable=True)
    moved_on = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes = Column(Text, nullable=True)

    inventory_item = relationship("InventoryItem", back_populates="movements")
    from_base = relationship(
        "Zone",
        foreign_keys=[from_base_id],
        back_populates="inventory_movements_from",
    )
    to_base = relationship(
        "Zone",
        foreign_keys=[to_base_id],
        back_populates="inventory_movements_to",
    )
    from_client = relationship("Client", foreign_keys=[from_client_id])
    to_client = relationship("Client", foreign_keys=[to_client_id])

