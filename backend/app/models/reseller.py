"""SQLAlchemy model definitions for resellers."""

from __future__ import annotations

import uuid

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class Reseller(Base):
    """Represents a reseller that distributes vouchers."""

    __tablename__ = "resellers"

    id = Column("reseller_id", GUID(), primary_key=True, default=uuid.uuid4)
    full_name = Column(String, nullable=False)
    base_id = Column(
        Integer,
        ForeignKey("zones.zone_id", onupdate="CASCADE"),
        nullable=False,
    )
    location = Column(String, nullable=False)
    base = relationship("Zone", back_populates="resellers")
    deliveries = relationship(
        "ResellerDelivery",
        back_populates="reseller",
        cascade="all, delete-orphan",
    )
    settlements = relationship(
        "ResellerSettlement",
        back_populates="reseller",
        cascade="all, delete-orphan",
    )
