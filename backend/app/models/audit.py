"""Audit trail models for operational transparency."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class PaymentAuditAction(str, enum.Enum):
    """Actions recorded in the payment audit log."""

    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"


class ClientChangeLog(Base):
    """Represents a change applied to a client record."""

    __tablename__ = "client_change_log"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_name = Column(String, nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    change_source = Column(String, nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="change_log")


class PaymentAuditLog(Base):
    """Stores audit entries for payment operations."""

    __tablename__ = "payment_audit_log"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    payment_id = Column(
        GUID(),
        ForeignKey("legacy_payments.payment_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action = Column(Enum(PaymentAuditAction), nullable=False)
    performed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    performed_by = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    snapshot = Column(JSON, nullable=True)

    payment = relationship("Payment", back_populates="audit_trail")


class ClientAccountSecurityAction(str, enum.Enum):
    """Actions performed on sensitive client account information."""

    PASSWORD_CREATED = "password_created"
    PASSWORD_CHANGED = "password_changed"
    PASSWORD_ACCESSED = "password_accessed"
    DATA_ACCESSED = "data_accessed"


class ClientAccountSecurityEvent(Base):
    """Audit log for sensitive operations over client accounts."""

    __tablename__ = "client_account_security_events"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    client_account_id = Column(
        GUID(),
        ForeignKey("client_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action = Column(Enum(ClientAccountSecurityAction), nullable=False)
    performed_by = Column(String(255), nullable=True)
    context = Column(JSON, nullable=True)
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client_account = relationship("ClientAccount", back_populates="security_events")
