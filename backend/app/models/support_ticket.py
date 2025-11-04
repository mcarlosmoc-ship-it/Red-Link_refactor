"""Support ticket tracking for operational follow-up."""

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


class TicketStatus(str, enum.Enum):
    """Lifecycle states for support tickets."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, enum.Enum):
    """Prioritisation levels for support incidents."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


TICKET_STATUS_ENUM = SAEnum(
    TicketStatus,
    name="support_ticket_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)

TICKET_PRIORITY_ENUM = SAEnum(
    TicketPriority,
    name="support_ticket_priority_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class SupportTicket(Base):
    """Operational support tickets linked to clients and base stations."""

    __tablename__ = "support_tickets"

    id = Column("ticket_id", GUID(), primary_key=True, default=uuid.uuid4)
    client_id = Column(GUID(), ForeignKey("clients.client_id", ondelete="SET NULL"), nullable=True)
    base_id = Column(Integer, ForeignKey("base_stations.base_id", ondelete="SET NULL"), nullable=True)
    inventory_id = Column(
        GUID(),
        ForeignKey("inventory_items.inventory_id", ondelete="SET NULL"),
        nullable=True,
    )
    subject = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(TICKET_STATUS_ENUM, nullable=False, default=TicketStatus.OPEN)
    priority = Column(TICKET_PRIORITY_ENUM, nullable=False, default=TicketPriority.MEDIUM)
    assigned_to = Column(String(120), nullable=True)
    opened_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    resolution = Column(Text, nullable=True)

    client = relationship("Client", back_populates="support_tickets")
    base = relationship("BaseStation", back_populates="support_tickets")
    inventory_item = relationship("InventoryItem", back_populates="support_tickets")

