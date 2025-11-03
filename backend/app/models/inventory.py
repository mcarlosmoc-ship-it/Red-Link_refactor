"""Models for inventory assets managed by the ISP."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Column, Date, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from ..database import Base


class InventoryStatus(str, enum.Enum):
    """Possible lifecycle statuses for inventory items."""

    ASSIGNED = "assigned"
    AVAILABLE = "available"
    MAINTENANCE = "maintenance"


class InventoryItem(Base):
    """Represents a hardware asset tracked in inventory."""

    __tablename__ = "inventory_items"

    id = Column(
        "inventory_id",
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    asset_tag = Column(String, unique=True, nullable=True)
    brand = Column(String, nullable=False)
    model = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    base_id = Column(Integer, ForeignKey("base_stations.base_id", onupdate="CASCADE"), nullable=False)
    ip_address = Column(String(45), nullable=True)
    status = Column(SAEnum(InventoryStatus, name="inventory_status_enum"), nullable=False)
    location = Column(String, nullable=False)
    client_id = Column(String(36), ForeignKey("clients.client_id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    installed_at = Column(Date, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    base = relationship("BaseStation", back_populates="inventory_items")
    client = relationship("Client", back_populates="inventory_items")
