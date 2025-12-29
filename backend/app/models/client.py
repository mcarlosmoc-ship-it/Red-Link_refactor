"""SQLAlchemy model definitions for clients."""

from __future__ import annotations

import enum
import uuid
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import relationship, synonym

from ..database import Base
from ..db_types import GUID


class ClientType(str, enum.Enum):
    """Enumerated values for the type of client supported by the system."""

    RESIDENTIAL = "residential"
    TOKEN = "token"


class ServiceStatus(str, enum.Enum):
    """Service status options for a client."""

    ACTIVE = "Activo"
    SUSPENDED = "Suspendido"


class Client(Base):
    """Represents a client record stored in the database."""

    __tablename__ = "clients"
    __table_args__ = (
        CheckConstraint(
            "paid_months_ahead >= 0", name="ck_clients_paid_months_non_negative"
        ),
        CheckConstraint("debt_months >= 0", name="ck_clients_debt_months_non_negative"),
    )

    id = Column("client_id", GUID(), primary_key=True, default=uuid.uuid4)
    external_code = Column(String, unique=True, nullable=True)
    client_type = Column(
        Enum(
            ClientType,
            name="client_type_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    full_name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    base_id = Column(
        Integer,
        ForeignKey("base_stations.base_id", onupdate="CASCADE"),
        nullable=True,
    )
    zone_id = synonym("base_id")
    paid_months_ahead = Column(
        Numeric(6, 2),
        nullable=False,
        default=0,
        comment="LEGACY: saldo a favor en meses; no usar para nueva lógica de cobertura",
    )
    debt_months = Column(
        Numeric(6, 2),
        nullable=False,
        default=0,
        comment="LEGACY: adeudo expresado en meses; mantenido solo para historial",
    )
    active_client_plan_id = Column(
        GUID(),
        ForeignKey("client_plans.client_plan_id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    base_station = relationship("BaseStation", back_populates="clients")
    payments = relationship(
        "ServicePayment",
        back_populates="client",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    charges = relationship(
        "ServiceCharge",
        back_populates="client",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    services = relationship(
        "ClientService",
        back_populates="client",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    subscriptions = relationship(
        "Subscription",
        back_populates="client",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    inventory_items = relationship("InventoryItem", back_populates="client")
    contacts = relationship(
        "ClientContact",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    change_log = relationship(
        "ClientChangeLog",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    status_history = relationship(
        "ClientStatusHistory",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    plan_history = relationship(
        "ClientPlan",
        back_populates="client",
        cascade="all, delete-orphan",
        foreign_keys="ClientPlan.client_id",
    )
    active_plan = relationship(
        "ClientPlan",
        foreign_keys=[active_client_plan_id],
        uselist=False,
        post_update=True,
    )
    ledger_entries = relationship(
        "ClientLedgerEntry",
        back_populates="client",
        cascade="all, delete-orphan",
    )
    support_tickets = relationship("SupportTicket", back_populates="client")
    zone = base_station

    @property
    def base(self):
        """Compatibility alias returning the client's zone."""

        return self.base_station

    @base.setter
    def base(self, value):
        self.base_station = value

    @property
    def service_status(self) -> ServiceStatus:
        """Compute the client status from the current service assignments."""

        from .client_service import ClientServiceStatus

        services = list(getattr(self, "services", []) or [])
        has_active = any(service.status == ClientServiceStatus.ACTIVE for service in services)
        return ServiceStatus.ACTIVE if has_active else ServiceStatus.SUSPENDED

    @property
    def monthly_fee(self) -> Decimal | None:
        """Expose the active service monthly fee derived from service plans."""

        from .client_service import ClientServiceStatus, ClientServiceType

        services = list(getattr(self, "services", []) or [])
        active_services = [
            service
            for service in services
            if service.status == ClientServiceStatus.ACTIVE
        ]
        candidates = active_services or services
        if not candidates:
            return None

        preferred_types = {
            ClientServiceType.INTERNET,
            ClientServiceType.HOTSPOT,
        }

        def service_priority(service):
            category = service.service_plan.category if service.service_plan else service.category
            return 0 if category in preferred_types else 1

        prioritized_services = sorted(candidates, key=service_priority)
        for service in prioritized_services:
            price = service.effective_price
            if price is not None:
                return price
        return None


Index(
    "clients_full_name_idx",
    Client.full_name,
    postgresql_using="gin",
    postgresql_ops={"full_name": "gin_trgm_ops"},
)
Index("clients_location_idx", Client.location)
Index("clients_zone_idx", Client.zone_id)
Index("clients_active_plan_idx", Client.active_client_plan_id)
