"""Models describing service plans and client plan history."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID
from .client_service import ClientServiceType


class ServicePlan(Base):
    """Catalog of available service plans for clients."""

    __tablename__ = "service_plans"

    id = Column("plan_id", Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    service_type = Column(
        Enum(
            ClientServiceType,
            name="service_plan_type_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ClientServiceType.INTERNET_PRIVATE,
    )
    download_speed_mbps = Column(Numeric(8, 2), nullable=True)
    upload_speed_mbps = Column(Numeric(8, 2), nullable=True)
    default_monthly_fee = Column(Numeric(10, 2), nullable=False)
    requires_ip = Column(Boolean, nullable=False, default=False, server_default="0")
    requires_base = Column(Boolean, nullable=False, default=False, server_default="0")
    is_token_plan = Column(Boolean, nullable=False, default=False, server_default="0")
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client_plans = relationship("ClientPlan", back_populates="service_plan")
    client_services = relationship("ClientService", back_populates="service_plan")


class ClientPlan(Base):
    """Tracks the plan assignment history per client."""

    __tablename__ = "client_plans"
    __table_args__ = (
        UniqueConstraint("client_id", "effective_from", name="client_plans_unique_start"),
    )

    id = Column("client_plan_id", GUID(), primary_key=True, default=uuid.uuid4)
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="CASCADE"),
        nullable=False,
    )
    service_plan_id = Column(
        Integer,
        ForeignKey("service_plans.plan_id", ondelete="RESTRICT"),
        nullable=False,
    )
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    monthly_fee = Column(Numeric(10, 2), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    client = relationship(
        "Client",
        back_populates="plan_history",
        foreign_keys="ClientPlan.client_id",
    )
    service_plan = relationship("ServicePlan", back_populates="client_plans")

