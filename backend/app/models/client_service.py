"""Models describing client services and service-specific payments."""

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
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    JSON,
)
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy.orm import foreign, relationship

from ..database import Base
from ..db_types import GUID
from .payment import PAYMENT_METHOD_ENUM


class ClientServiceType(str, enum.Enum):
    """Supported service categories that can be assigned to a client."""

    INTERNET = "internet"
    STREAMING = "streaming"
    HOTSPOT = "hotspot"
    POINT_OF_SALE = "point_of_sale"
    OTHER = "other"


class ClientServiceStatus(str, enum.Enum):
    """Operational status values for client services."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    PENDING = "pending"


class ClientService(Base):
    """Represents a specific service that a client has contracted."""

    __tablename__ = "client_services"
    __table_args__ = (
        UniqueConstraint(
            "client_id",
            "service_type",
            "display_name",
            name="uq_client_services_client_type_name",
        ),
        CheckConstraint(
            "billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 31)",
            name="ck_client_services_billing_day_range",
        ),
        CheckConstraint("price >= 0", name="ck_client_services_price_non_negative"),
    )

    id = Column("client_service_id", GUID(), primary_key=True, default=uuid.uuid4)
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_type = Column(
        Enum(
            ClientServiceType,
            name="client_service_type_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    display_name = Column(String(200), nullable=False)
    status = Column(
        Enum(
            ClientServiceStatus,
            name="client_service_status_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ClientServiceStatus.ACTIVE,
    )
    billing_day = Column(Integer, nullable=True)
    next_billing_date = Column(Date, nullable=True)
    price = Column(Numeric(12, 2), nullable=False, default=0)
    currency = Column(String(3), nullable=False, default="MXN")
    base_id = Column(Integer, ForeignKey("base_stations.base_id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    service_metadata = Column(
        "metadata", JSON().with_variant(SQLiteJSON(), "sqlite"), nullable=True
    )
    service_plan_id = Column(
        Integer,
        ForeignKey("service_plans.plan_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    client = relationship("Client", back_populates="services")
    payments = relationship(
        "ServicePayment",
        back_populates="service",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    streaming_account = relationship(
        "ClientAccount",
        back_populates="client_service",
        uselist=False,
    )
    service_plan = relationship(
        "ServicePlan",
        back_populates="client_services",
    )
    ip_reservations = relationship(
        "BaseIpReservation",
        back_populates="service",
        cascade="all, delete-orphan",
    )


class ServicePayment(Base):
    """Payment record tied to a specific client service."""

    __tablename__ = "service_payments"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_service_payments_amount_non_negative"),
        CheckConstraint(
            "months_paid IS NULL OR months_paid > 0",
            name="ck_service_payments_months_positive",
        ),
    )

    id = Column("payment_id", GUID(), primary_key=True, default=uuid.uuid4)
    client_service_id = Column(
        GUID(),
        ForeignKey("client_services.client_service_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_key = Column(
        String,
        ForeignKey("billing_periods.period_key", ondelete="RESTRICT"),
        nullable=True,
    )
    paid_on = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    months_paid = Column(Numeric(6, 2), nullable=True)
    method = Column(PAYMENT_METHOD_ENUM, nullable=False)
    note = Column(Text, nullable=True)
    recorded_by = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    service = relationship("ClientService", back_populates="payments")
    client = relationship("Client", back_populates="payments")
    billing_period = relationship(
        "BillingPeriod",
        back_populates="payments",
        primaryjoin="BillingPeriod.period_key==foreign(ServicePayment.period_key)",
    )
    audit_trail = relationship(
        "PaymentAuditLog",
        back_populates="payment",
        cascade="all, delete-orphan",
    )


Index("service_payments_client_idx", ServicePayment.client_id)
Index("service_payments_service_idx", ServicePayment.client_service_id)
Index("service_payments_period_idx", ServicePayment.period_key)
Index("service_payments_paid_on_idx", ServicePayment.paid_on)
