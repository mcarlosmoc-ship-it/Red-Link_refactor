"""Models for managing principal and client accounts."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship, synonym

from ..database import Base
from ..db_types import GUID
from ..security import decrypt_client_password, encrypt_client_password
from .payment import PAYMENT_METHOD_ENUM


class ClientAccountStatus(str, enum.Enum):
    """Allowed status values for client accounts."""

    ACTIVO = "activo"
    SUSPENDIDO = "suspendido"
    MOROSO = "moroso"


CLIENT_ACCOUNT_STATUS_ENUM = SAEnum(
    ClientAccountStatus,
    name="client_account_status_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    validate_strings=True,
)


class PrincipalAccount(Base):
    """Primary account that owns one or more client accounts."""

    __tablename__ = "principal_accounts"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email_principal = Column(String(255), nullable=False, unique=True)
    nota = Column(Text, nullable=True)
    fecha_alta = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    max_slots = Column(Integer, nullable=False, default=5)

    client_accounts = relationship(
        "ClientAccount",
        back_populates="principal_account",
        cascade="all, delete-orphan",
    )


class ClientAccount(Base):
    """Individual client account associated with a principal account."""

    __tablename__ = "client_accounts"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    principal_account_id = Column(
        GUID(),
        ForeignKey("principal_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_id = Column(
        GUID(),
        ForeignKey("clients.client_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    client_service_id = Column(
        GUID(),
        ForeignKey("client_services.client_service_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    correo_cliente = Column(String(255), nullable=False, unique=True)
    contrasena_cliente_encrypted = Column("contrasena_cliente", String(255), nullable=False)
    perfil = Column(
        String(100),
        ForeignKey("client_account_profiles.profile", ondelete="RESTRICT"),
        nullable=False,
    )
    nombre_cliente = Column(String(255), nullable=False)
    fecha_registro = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    fecha_proximo_pago = Column(Date, nullable=True)
    estatus = Column(CLIENT_ACCOUNT_STATUS_ENUM, nullable=False)

    principal_account = relationship("PrincipalAccount", back_populates="client_accounts")
    security_events = relationship(
        "ClientAccountSecurityEvent",
        back_populates="client_account",
        cascade="all, delete-orphan",
    )
    payments = relationship(
        "ClientAccountPayment",
        back_populates="client_account",
        cascade="all, delete-orphan",
    )
    client_service = relationship("ClientService", back_populates="streaming_account")
    client = relationship("Client")
    profile_ref = relationship("ClientAccountProfile", back_populates="client_accounts")


Index("client_accounts_fecha_proximo_pago_idx", ClientAccount.fecha_proximo_pago)
Index("client_accounts_estatus_idx", ClientAccount.estatus)


class ClientAccountProfile(Base):
    """Catalog of account profiles for streaming clients."""

    __tablename__ = "client_account_profiles"

    profile = Column(String(100), primary_key=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client_accounts = relationship(
        "ClientAccount",
        back_populates="profile_ref",
    )


def _get_password(instance: "ClientAccount") -> str:
    encrypted = instance.contrasena_cliente_encrypted
    return decrypt_client_password(encrypted) if encrypted else ""


def _set_password(instance: "ClientAccount", value: str) -> None:
    if value is None:
        raise ValueError("Client password cannot be null")
    instance.contrasena_cliente_encrypted = encrypt_client_password(value)


ClientAccount.contrasena_cliente = synonym(
    "contrasena_cliente_encrypted",
    descriptor=property(_get_password, _set_password),
)


class ClientAccountPayment(Base):
    """Payment information tied to a client account."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("monto >= 0", name="ck_account_payments_monto_non_negative"),
    )

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    client_account_id = Column(
        GUID(),
        ForeignKey("client_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    monto = Column(Numeric(12, 2), nullable=False)
    fecha_pago = Column(Date, nullable=False)
    periodo_correspondiente = Column(String(20), nullable=True)
    metodo_pago = Column(PAYMENT_METHOD_ENUM, nullable=False)
    notas = Column(Text, nullable=True)

    client_account = relationship("ClientAccount", back_populates="payments")
