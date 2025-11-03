"""SQLAlchemy model definitions for client payments."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
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


class PaymentMethod(str, enum.Enum):
    """Supported payment methods."""

    EFECTIVO = "Efectivo"
    TRANSFERENCIA = "Transferencia"
    TARJETA = "Tarjeta"
    REVENDEDOR = "Revendedor"
    OTRO = "Otro"


class Payment(Base):
    """Represents a payment made by a client for a billing period."""

    __tablename__ = "payments"

    id = Column(
        "payment_id",
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    client_id = Column(
        String(36),
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
    method = Column(Enum(PaymentMethod, name="payment_method_enum"), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="payments")


Index("payments_client_idx", Payment.client_id)
Index("payments_period_idx", Payment.period_key)
