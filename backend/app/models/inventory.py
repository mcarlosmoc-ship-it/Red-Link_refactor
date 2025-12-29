"""Models for inventory assets managed by the ISP."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID, INET


class InventoryStatus(str, enum.Enum):
    """Possible lifecycle statuses for inventory items."""

    ASSIGNED = "assigned"
    AVAILABLE = "available"
    MAINTENANCE = "maintenance"


INVENTORY_STATUS_ENUM = SAEnum(
    InventoryStatus,
    name="inventory_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class InventoryItem(Base):
    """Represents a hardware asset tracked in inventory."""

    __tablename__ = "inventory_items"
    __table_args__ = (
        CheckConstraint(
            "(status = 'assigned' AND client_id IS NOT NULL) OR "
            "(status <> 'assigned' AND client_id IS NULL)",
            name="ck_inventory_items_assignment_consistency",
        ),
        CheckConstraint(
            "purchase_cost IS NULL OR purchase_cost >= 0",
            name="ck_inventory_items_purchase_cost_non_negative",
        ),
    )

    id = Column("inventory_id", GUID(), primary_key=True, default=uuid.uuid4)
    asset_tag = Column(String, unique=True, nullable=True)
    brand = Column(String, nullable=False)
    model = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    category = Column(String, nullable=True)
    base_id = Column(Integer, ForeignKey("base_stations.base_id", onupdate="CASCADE"), nullable=False)
    ip_address = Column(INET(), nullable=True)
    status = Column(INVENTORY_STATUS_ENUM, nullable=False)
    location = Column(String, nullable=False)
    client_id = Column(GUID(), ForeignKey("clients.client_id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    installed_at = Column(Date, nullable=True)
    purchase_date = Column(Date, nullable=True)
    purchase_cost = Column(Numeric(12, 2), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    base = relationship("BaseStation", back_populates="inventory_items")
    client = relationship("Client", back_populates="inventory_items")
    movements = relationship(
        "InventoryMovement",
        back_populates="inventory_item",
        cascade="all, delete-orphan",
    )
    ip_reservations = relationship(
        "BaseIpReservation", back_populates="inventory_item", cascade="all, delete-orphan"
    )
    support_tickets = relationship("SupportTicket", back_populates="inventory_item")


Index("inventory_base_status_idx", InventoryItem.base_id, InventoryItem.status)
Index(
    "inventory_ip_address_unique_idx",
    InventoryItem.ip_address,
    unique=True,
    postgresql_where=InventoryItem.ip_address.isnot(None),
    sqlite_where=InventoryItem.ip_address.isnot(None),
)
