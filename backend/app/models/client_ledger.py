"""Financial ledger entries for clients."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base


class LedgerEntryType(str, enum.Enum):
    """Types of ledger entries tracked for a client."""

    INVOICE = "invoice"
    PAYMENT = "payment"
    ADJUSTMENT = "adjustment"
    CREDIT = "credit"


LEDGER_ENTRY_TYPE_ENUM = SAEnum(
    LedgerEntryType,
    name="client_ledger_entry_type_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=False,
    validate_strings=True,
)


class ClientLedgerEntry(Base):
    """Represents a financial movement affecting a client's balance."""

    __tablename__ = "client_ledger_entries"

    id = Column("ledger_entry_id", String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = Column(
        String(36),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
    )
    period_key = Column(
        String,
        ForeignKey("billing_periods.period_key", ondelete="SET NULL"),
        nullable=True,
    )
    entry_type = Column(LEDGER_ENTRY_TYPE_ENUM, nullable=False)
    entry_date = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(Text, nullable=True)
    balance_after = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client", back_populates="ledger_entries")
    billing_period = relationship("BillingPeriod", back_populates="ledger_entries")

