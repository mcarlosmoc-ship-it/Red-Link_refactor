"""SQLAlchemy model definitions for client payments."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class PaymentMethod(str, enum.Enum):
    """Supported payment methods."""

    EFECTIVO = "Efectivo"
    TRANSFERENCIA = "Transferencia"
    TARJETA = "Tarjeta"
    REVENDEDOR = "Revendedor"
    OTRO = "Otro"


PAYMENT_METHOD_ENUM = Enum(
    PaymentMethod,
    name="payment_method_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class Payment(Base):
    """Represents a payment made by a client for a billing period."""

    __tablename__ = "legacy_payments"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_payments_amount_non_negative"),
        CheckConstraint("months_paid > 0", name="ck_payments_months_paid_positive"),
    )

    id = Column("payment_id", GUID(), primary_key=True, default=uuid.uuid4)
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
    )
    period_key = Column(
        String,
        ForeignKey("billing_periods.period_key", ondelete="RESTRICT"),
        nullable=False,
    )
    paid_on = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    months_paid = Column(Numeric(6, 2), nullable=False, default=1)
    method = Column(PAYMENT_METHOD_ENUM, nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="payments")
    billing_period = relationship("BillingPeriod", back_populates="payments")
    audit_trail = relationship(
        "PaymentAuditLog",
        back_populates="payment",
        cascade="all, delete-orphan",
    )


Index("legacy_payments_client_idx", Payment.client_id)
Index("legacy_payments_period_idx", Payment.period_key)
Index("legacy_payments_client_period_idx", Payment.client_id, Payment.period_key)
Index("legacy_payments_client_paid_on_idx", Payment.client_id, Payment.paid_on)
Index("legacy_payments_period_paid_on_idx", Payment.period_key, Payment.paid_on)
