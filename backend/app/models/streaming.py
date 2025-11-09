"""Models for managing streaming platform accounts and slots."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship, synonym

from ..database import Base
from ..db_types import GUID
from ..security import decrypt_client_password, encrypt_client_password


class StreamingPlatform(str, enum.Enum):
    """Supported streaming platforms."""

    NETFLIX = "netflix"
    SPOTIFY = "spotify"
    OTHER = "other"


class StreamingAccount(Base):
    """Streaming account credentials tied to a specific service plan."""

    __tablename__ = "streaming_accounts"
    __table_args__ = (
        UniqueConstraint("email", name="uq_streaming_accounts_email"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    platform = Column(
        Enum(
            StreamingPlatform,
            name="streaming_platform_enum",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    email = Column(String(255), nullable=False)
    password_encrypted = Column("password", String(255), nullable=False)
    service_plan_id = Column(
        Integer,
        ForeignKey("service_plans.plan_id", ondelete="SET NULL"),
        nullable=True,
    )
    total_slots = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    slots = relationship(
        "StreamingSlot",
        back_populates="account",
        cascade="all, delete-orphan",
    )
    service_plan = relationship("ServicePlan", back_populates="streaming_accounts")


class StreamingSlot(Base):
    """Represents an assignable slot within a streaming account."""

    __tablename__ = "streaming_slots"
    __table_args__ = (
        UniqueConstraint(
            "streaming_account_id",
            "slot_label",
            name="uq_streaming_slots_account_label",
        ),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    streaming_account_id = Column(
        GUID(),
        ForeignKey("streaming_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    slot_label = Column(String(120), nullable=False)
    is_assigned = Column(Boolean, nullable=False, default=False, server_default="0")
    client_service_id = Column(
        GUID(),
        ForeignKey("client_services.client_service_id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    account = relationship("StreamingAccount", back_populates="slots")
    client_service = relationship("ClientService")


def _get_password(instance: "StreamingAccount") -> str:
    encrypted = instance.password_encrypted
    return decrypt_client_password(encrypted) if encrypted else ""


def _set_password(instance: "StreamingAccount", value: str) -> None:
    if value is None:
        raise ValueError("Streaming account password cannot be null")
    instance.password_encrypted = encrypt_client_password(value)


StreamingAccount.password = synonym(
    "password_encrypted",
    descriptor=property(_get_password, _set_password),
)
