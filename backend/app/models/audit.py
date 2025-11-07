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
