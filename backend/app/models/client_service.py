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
    func,
    JSON,
    nullslast,
    select,
)
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy.orm import column_property, relationship, synonym

from ..database import Base
from ..db_types import GUID, INET
from .payment import PAYMENT_METHOD_ENUM
from .ip_pool import BaseIpReservation


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
        CheckConstraint(
            "billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 31)",
            name="ck_client_services_billing_day_range",
        ),
        CheckConstraint(
            "custom_price IS NULL OR custom_price >= 0",
            name="ck_client_services_custom_price_non_negative",
        ),
        CheckConstraint(
            "debt_amount >= 0",
            name="ck_client_services_debt_amount_non_negative",
        ),
        CheckConstraint(
            "debt_months >= 0",
            name="ck_client_services_debt_months_non_negative",
        ),
        CheckConstraint(
            "abono_monto >= 0",
            name="ck_client_services_abono_monto_non_negative",
        ),
    )

    id = Column("client_service_id", GUID(), primary_key=True, default=uuid.uuid4)
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_plan_id = Column(
        Integer,
        ForeignKey("service_plans.plan_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
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
    custom_price = Column(Numeric(12, 2), nullable=True)
    zone_id = Column(
        Integer,
        ForeignKey("zones.zone_id", ondelete="SET NULL"),
        nullable=True,
    )
    base_id = synonym("zone_id")
    ip_address = Column(INET(), nullable=True)
    antenna_ip = Column(INET(), nullable=True)
    modem_ip = Column(INET(), nullable=True)
    antenna_model = Column(String, nullable=True)
    modem_model = Column(String, nullable=True)
    debt_amount = Column(Numeric(12, 2), nullable=False, default=0)
    debt_months = Column(
        Numeric(6, 2),
        nullable=False,
        default=0,
        comment="LEGACY: adeudo en meses; mantener para historial, no usar en nuevas reglas",
    )
    debt_notes = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    service_metadata = Column(
        "metadata", JSON().with_variant(SQLiteJSON(), "sqlite"), nullable=True
    )
    vigente_hasta_periodo = Column(Text, nullable=True)
    abono_periodo = Column(Text, nullable=True)
    abono_monto = Column(Numeric(12, 2), nullable=False, default=0)
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
    primary_ip_address = column_property(
        select(BaseIpReservation.ip_address)
        .where(BaseIpReservation.service_id == id)
        .order_by(nullslast(BaseIpReservation.assigned_at).desc())
        .limit(1)
        .scalar_subquery()
    )

    @property
    def category(self) -> ClientServiceType | None:
        """Expose the plan category associated with the service."""

        return self.service_plan.category if self.service_plan else None

    @property
    def ip_reservation_id(self):
        """Return the identifier of the primary IP reservation linked to the service."""

        if self.ip_reservations:
            return self.ip_reservations[0].id
        return None

    @property
    def effective_price(self):
        """Price to charge for the service, using custom price when available."""

        if self.custom_price is not None:
            return self.custom_price
        if self.service_plan:
            return self.service_plan.monthly_price
        return None


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
    months_paid = Column(
        Numeric(6, 2),
        nullable=True,
        comment="LEGACY: meses capturados; se conserva solo para compatibilidad",
    )
    method = Column(PAYMENT_METHOD_ENUM, nullable=False)
    method_breakdown = Column(
        JSON().with_variant(SQLiteJSON(), "sqlite"), nullable=True
    )
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
Index(
    "client_services_ip_unique_idx",
    ClientService.ip_address,
    unique=True,
    postgresql_where=ClientService.ip_address.isnot(None),
    sqlite_where=ClientService.ip_address.isnot(None),
)
Index(
    "client_services_antenna_ip_unique_idx",
    ClientService.antenna_ip,
    unique=True,
    postgresql_where=ClientService.antenna_ip.isnot(None),
    sqlite_where=ClientService.antenna_ip.isnot(None),
)
Index(
    "client_services_modem_ip_unique_idx",
    ClientService.modem_ip,
    unique=True,
    postgresql_where=ClientService.modem_ip.isnot(None),
    sqlite_where=ClientService.modem_ip.isnot(None),
)
