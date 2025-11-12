"""SQLAlchemy model definition for coverage zones."""

from __future__ import annotations

from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class Zone(Base):
    """Represents a physical coverage zone used to serve clients."""

    __tablename__ = "zones"

    id = Column("zone_id", Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    notes = Column(Text, nullable=True)

    clients = relationship("Client", back_populates="zone")
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


# Backwards compatibility alias while the rest of the codebase transitions
BaseStation = Zone
