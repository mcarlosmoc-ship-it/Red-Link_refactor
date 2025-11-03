"""SQLAlchemy model definitions for clients."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base


class ClientType(str, enum.Enum):
    """Enumerated values for the type of client supported by the system."""

    RESIDENTIAL = "residential"
    TOKEN = "token"


class ServiceStatus(str, enum.Enum):
    """Service status options for a client."""

    ACTIVE = "Activo"
    SUSPENDED = "Suspendido"


class Client(Base):
    """Represents a client record stored in the database."""

    __tablename__ = "clients"

    id = Column(
        "client_id",
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    external_code = Column(String, unique=True, nullable=True)
    client_type = Column(Enum(ClientType, name="client_type_enum"), nullable=False)
    full_name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    base_id = Column(
        Integer,
        ForeignKey("base_stations.base_id", onupdate="CASCADE"),
        nullable=False,
    )
    ip_address = Column(String(45), nullable=True)
    antenna_ip = Column(String(45), nullable=True)
    modem_ip = Column(String(45), nullable=True)
    antenna_model = Column(String, nullable=True)
    modem_model = Column(String, nullable=True)
    monthly_fee = Column(Numeric(10, 2), nullable=False, default=0)
    paid_months_ahead = Column(Numeric(6, 2), nullable=False, default=0)
    debt_months = Column(Numeric(6, 2), nullable=False, default=0)
    service_status = Column(
        Enum(ServiceStatus, name="client_service_status_enum"),
        nullable=False,
        default=ServiceStatus.ACTIVE,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    base = relationship("BaseStation", back_populates="clients")
    payments = relationship(
        "Payment",
        back_populates="client",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    inventory_items = relationship("InventoryItem", back_populates="client")


Index("clients_full_name_idx", Client.full_name)
Index("clients_location_idx", Client.location)
Index("clients_base_idx", Client.base_id)
