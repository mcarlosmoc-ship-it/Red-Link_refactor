"""SQLAlchemy model definition for base stations (coverage zones)."""

from __future__ import annotations

from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship, synonym

from ..database import Base


class BaseStation(Base):
    """Represents a physical coverage base used to serve clients."""

    __tablename__ = "base_stations"

    base_id = Column(Integer, primary_key=True, autoincrement=True)
    id = synonym("base_id")
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    notes = Column(Text, nullable=True)

    clients = relationship("Client", back_populates="base_station")
    resellers = relationship("Reseller", back_populates="base")
    expenses = relationship("Expense", back_populates="base")
    inventory_items = relationship("InventoryItem", back_populates="base")
    operating_costs = relationship("BaseOperatingCost", back_populates="base")
    ip_pools = relationship(
        "BaseIpPool",
        back_populates="base",
        cascade="all, delete-orphan",
    )
    ip_reservations = relationship(
        "BaseIpReservation",
        back_populates="base",
        cascade="all, delete-orphan",
    )
    support_tickets = relationship("SupportTicket", back_populates="base")
    inventory_movements_from = relationship(
        "InventoryMovement",
        back_populates="from_base",
        foreign_keys="InventoryMovement.from_base_id",
    )
    inventory_movements_to = relationship(
        "InventoryMovement",
        back_populates="to_base",
        foreign_keys="InventoryMovement.to_base_id",
    )

    # Backwards-compatibility aliases while the rest of the codebase transitions
    zone_id = synonym("base_id")
    zone = synonym("base_id")


# Backwards compatibility alias while the rest of the codebase transitions
Zone = BaseStation
