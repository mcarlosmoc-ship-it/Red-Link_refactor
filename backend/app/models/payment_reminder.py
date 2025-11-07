"""Models and enumerations to track payment reminder deliveries."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class ReminderType(str, enum.Enum):
    """Classification of reminders sent to client accounts."""

    UPCOMING = "upcoming"
    OVERDUE = "overdue"


REMINDER_TYPE_ENUM = SAEnum(
    ReminderType,
    name="payment_reminder_type_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class ReminderDeliveryStatus(str, enum.Enum):
    """Delivery status reported by the outbound messaging provider."""

    SENT = "sent"
    FAILED = "failed"


REMINDER_STATUS_ENUM = SAEnum(
    ReminderDeliveryStatus,
    name="payment_reminder_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class PaymentReminderLog(Base):
    """Audit log with the outcome of each payment reminder attempt."""

    __tablename__ = "payment_reminder_logs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    client_account_id = Column(
        GUID(), ForeignKey("client_accounts.id", ondelete="CASCADE"), nullable=False
    )
    reminder_type = Column(REMINDER_TYPE_ENUM, nullable=False)
    delivery_status = Column(REMINDER_STATUS_ENUM, nullable=False)
    destination = Column(String(255), nullable=False)
    channel = Column(String(50), nullable=False)
    due_date = Column(Date, nullable=True)
    provider_message_id = Column(String(255), nullable=True)
    response_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    client_account = relationship("ClientAccount", backref="reminder_logs")


Index(
    "payment_reminder_logs_client_idx",
    PaymentReminderLog.client_account_id,
)
Index(
    "payment_reminder_logs_created_at_idx",
    PaymentReminderLog.created_at,
)
Index(
    "payment_reminder_logs_type_idx",
    PaymentReminderLog.reminder_type,
)
