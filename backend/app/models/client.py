"""SQLAlchemy model definitions for clients."""

from __future__ import annotations

import enum
import uuid

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
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID, INET


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
        CheckConstraint("monthly_fee >= 0", name="ck_clients_monthly_fee_non_negative"),
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
        nullable=False,
    )
    ip_address = Column(INET(), nullable=True)
    antenna_ip = Column(INET(), nullable=True)
    modem_ip = Column(INET(), nullable=True)
    antenna_model = Column(String, nullable=True)
    modem_model = Column(String, nullable=True)
    monthly_fee = Column(Numeric(10, 2), nullable=False, default=0)
    paid_months_ahead = Column(Numeric(6, 2), nullable=False, default=0)
    debt_months = Column(Numeric(6, 2), nullable=False, default=0)
    active_client_plan_id = Column(
        GUID(),
        ForeignKey("client_plans.client_plan_id", ondelete="SET NULL"),
        nullable=True,
    )
    service_status = Column(
        Enum(
            ServiceStatus,
            name="client_service_status_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ServiceStatus.ACTIVE,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    base = relationship("BaseStation", back_populates="clients")
    payments = relationship(
        "ServicePayment",
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


Index(
    "clients_full_name_idx",
    Client.full_name,
    postgresql_using="gin",
    postgresql_ops={"full_name": "gin_trgm_ops"},
)
Index("clients_location_idx", Client.location)
Index("clients_base_idx", Client.base_id)
Index("clients_active_plan_idx", Client.active_client_plan_id)
Index("clients_base_status_idx", Client.base_id, Client.service_status)
Index(
    "clients_ip_address_unique_idx",
    Client.ip_address,
    unique=True,
    postgresql_where=Client.ip_address.isnot(None),
    sqlite_where=Client.ip_address.isnot(None),
)
Index(
    "clients_antenna_ip_unique_idx",
    Client.antenna_ip,
    unique=True,
    postgresql_where=Client.antenna_ip.isnot(None),
    sqlite_where=Client.antenna_ip.isnot(None),
)
Index(
    "clients_modem_ip_unique_idx",
    Client.modem_ip,
    unique=True,
    postgresql_where=Client.modem_ip.isnot(None),
    sqlite_where=Client.modem_ip.isnot(None),
)
