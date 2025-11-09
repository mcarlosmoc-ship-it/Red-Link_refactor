"""Models for managing base IP pools and reservations."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID, INET


class IpReservationStatus(str, enum.Enum):
    """State of a reserved IP address."""

    AVAILABLE = "available"
    RESERVED = "reserved"
    ASSIGNED = "assigned"
    RETIRED = "retired"


class BaseIpPool(Base):
    """Represents a CIDR block allocated to a base station."""

    __tablename__ = "base_ip_pools"
    __table_args__ = (
        UniqueConstraint("base_id", "cidr", name="uq_base_ip_pools_base_cidr"),
    )

    id = Column("pool_id", Integer, primary_key=True, autoincrement=True)
    base_id = Column(
        Integer,
        ForeignKey("base_stations.base_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label = Column(String(120), nullable=False)
    cidr = Column(String(64), nullable=False)
    vlan = Column(String(32), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    base = relationship("BaseStation", back_populates="ip_pools")
    reservations = relationship(
        "BaseIpReservation",
        back_populates="pool",
        cascade="all, delete-orphan",
    )


class BaseIpReservation(Base):
    """Tracks individual IP addresses and their assignment state."""

    __tablename__ = "base_ip_reservations"
    __table_args__ = (
        UniqueConstraint("base_id", "ip_address", name="uq_base_ip_reservations_unique_ip"),
        CheckConstraint(
            "status IN ('available', 'reserved', 'assigned', 'retired')",
            name="ck_base_ip_reservations_status_valid",
        ),
    )

    id = Column("reservation_id", GUID(), primary_key=True, default=uuid.uuid4)
    base_id = Column(
        Integer,
        ForeignKey("base_stations.base_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pool_id = Column(
        Integer,
        ForeignKey("base_ip_pools.pool_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    ip_address = Column(INET(), nullable=False)
    status = Column(
        Enum(
            IpReservationStatus,
            name="ip_reservation_status_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=IpReservationStatus.AVAILABLE,
    )
    service_id = Column(
        GUID(),
        ForeignKey("client_services.client_service_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notes = Column(Text, nullable=True)
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    released_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    pool = relationship("BaseIpPool", back_populates="reservations")
    service = relationship("ClientService", back_populates="ip_reservations")
    base = relationship("BaseStation")


Index("base_ip_reservations_status_idx", BaseIpReservation.status)
Index("base_ip_reservations_service_idx", BaseIpReservation.service_id)
Index("base_ip_reservations_client_idx", BaseIpReservation.client_id)
