"""Models providing extended contact and status tracking for clients."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import relationship

from ..database import Base
from .client import ServiceStatus


class ContactType(str, enum.Enum):
    """Supported contact channels for a client."""

    EMAIL = "email"
    PHONE = "phone"
    WHATSAPP = "whatsapp"
    OTHER = "other"


CONTACT_TYPE_ENUM = SAEnum(
    ContactType,
    name="client_contact_type_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class ClientContact(Base):
    """Stores additional contact channels per client."""

    __tablename__ = "client_contacts"

    id = Column("contact_id", String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = Column(
        String(36),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_type = Column(CONTACT_TYPE_ENUM, nullable=False)
    value = Column(String(255), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False, server_default="0")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    client = relationship("Client", back_populates="contacts")


STATUS_HISTORY_ENUM = SAEnum(
    ServiceStatus,
    name="client_status_history_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class ClientStatusHistory(Base):
    """Chronological changes for the service status of a client."""

    __tablename__ = "client_status_history"

    id = Column(
        "status_history_id",
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    client_id = Column(
        String(36),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(STATUS_HISTORY_ENUM, nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    changed_by = Column(String(100), nullable=True)
    reason = Column(Text, nullable=True)

    client = relationship("Client", back_populates="status_history")
