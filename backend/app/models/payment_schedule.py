"""Models to manage deferred (scheduled) payments."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Column, Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base
from ..db_types import GUID
from .payment import PAYMENT_METHOD_ENUM


class PaymentScheduleStatus(str, enum.Enum):
    """Lifecycle for a scheduled payment."""

    SCHEDULED = "scheduled"
    EXECUTED = "executed"
    CANCELLED = "cancelled"


PAYMENT_SCHEDULE_STATUS_ENUM = SAEnum(
    PaymentScheduleStatus,
    name="payment_schedule_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class PaymentSchedule(Base):
    """Stores payments that should be executed in the future."""

    __tablename__ = "payment_schedules"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    client_service_id = Column(
        GUID(), ForeignKey("client_services.client_service_id", ondelete="CASCADE"), nullable=False
    )
    client_id = Column(GUID(), ForeignKey("clients.client_id", ondelete="CASCADE"), nullable=False)
    execute_on = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    months = Column(Numeric(6, 2), nullable=True)
    method = Column(PAYMENT_METHOD_ENUM, nullable=False)
    note = Column(String(255), nullable=True)
    recorded_by = Column(String(120), nullable=True)
    status = Column(PAYMENT_SCHEDULE_STATUS_ENUM, nullable=False, default=PaymentScheduleStatus.SCHEDULED)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    executed_at = Column(DateTime(timezone=True), nullable=True)
    payment_id = Column(GUID(), ForeignKey("service_payments.payment_id", ondelete="SET NULL"), nullable=True)

    client = relationship("Client", backref="payment_schedules")
    service = relationship("ClientService", backref="payment_schedules")
    payment = relationship("ServicePayment", backref="schedule", uselist=False)

