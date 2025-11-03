"""SQLAlchemy model definition for base stations."""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, String, Text, func
from sqlalchemy.orm import relationship

from ..database import Base


class BaseStation(Base):
    """Represents a physical base station used to serve clients."""

    __tablename__ = "base_stations"

    id = Column("base_id", Integer, primary_key=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    clients = relationship("Client", back_populates="base")
    resellers = relationship("Reseller", back_populates="base")
    expenses = relationship("Expense", back_populates="base")
    inventory_items = relationship("InventoryItem", back_populates="base")
    operating_costs = relationship("BaseOperatingCost", back_populates="base")
