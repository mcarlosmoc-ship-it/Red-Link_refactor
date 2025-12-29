"""Models describing service plans and client plan history."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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


class CapacityType(str, enum.Enum):
    """Represents how many clients can use a plan simultaneously."""

    UNLIMITED = "unlimited"
    LIMITED = "limited"


class ServicePlanStatus(str, enum.Enum):
    """Operational status for catalog plans."""

    ACTIVE = "active"
    INACTIVE = "inactive"


class ServicePlan(Base):
    """Catalog of available service plans for clients."""

    __tablename__ = "service_plans"
    __table_args__ = (
        CheckConstraint(
            "capacity_limit IS NULL OR capacity_limit >= 0",
            name="ck_service_plans_capacity_limit_non_negative",
        ),
        CheckConstraint(
            "(capacity_type <> 'limited') OR (capacity_limit IS NOT NULL AND capacity_limit > 0)",
            name="ck_service_plans_capacity_limit_required",
        ),
    )

    id = Column("plan_id", Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    category = Column(
        Enum(
            ClientServiceType,
            name="service_plan_category_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ClientServiceType.INTERNET_PRIVATE,
    )
    download_speed_mbps = Column(Numeric(8, 2), nullable=True)
    upload_speed_mbps = Column(Numeric(8, 2), nullable=True)
    monthly_price = Column(Numeric(10, 2), nullable=False)
    requires_ip = Column(Boolean, nullable=False, default=False, server_default="0")
    requires_base = Column(Boolean, nullable=False, default=False, server_default="0")
    capacity_type = Column(
        Enum(
            CapacityType,
            name="service_plan_capacity_type_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=CapacityType.UNLIMITED,
    )
    capacity_limit = Column(Integer, nullable=True)
    status = Column(
        Enum(
            ServicePlanStatus,
            name="service_plan_status_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ServicePlanStatus.ACTIVE,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client_plans = relationship("ClientPlan", back_populates="service_plan")
    client_services = relationship("ClientService", back_populates="service_plan")
    streaming_accounts = relationship(
        "StreamingAccount",
        back_populates="service_plan",
        cascade="all, delete-orphan",
    )

    @property
    def is_active(self) -> bool:
        """Expose compatibility flag for legacy callers."""

        return self.status == ServicePlanStatus.ACTIVE


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

