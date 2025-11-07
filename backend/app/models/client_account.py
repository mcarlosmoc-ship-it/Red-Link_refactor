"""Models for managing principal and client accounts."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from ..database import Base
from ..db_types import GUID


class PrincipalAccount(Base):
    """Primary account that owns one or more client accounts."""

    __tablename__ = "principal_accounts"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email_principal = Column(String(255), nullable=False, unique=True)
    nota = Column(Text, nullable=True)
    fecha_alta = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

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
    correo_cliente = Column(String(255), nullable=False, unique=True)
    contrasena_cliente = Column(String(255), nullable=False)
    perfil = Column(String(100), nullable=False)
    nombre_cliente = Column(String(255), nullable=False)
    fecha_registro = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    fecha_proximo_pago = Column(Date, nullable=True)
    estatus = Column(String(100), nullable=False)

    principal_account = relationship("PrincipalAccount", back_populates="client_accounts")
    payments = relationship(
        "ClientAccountPayment",
        back_populates="client_account",
        cascade="all, delete-orphan",
    )


Index("client_accounts_fecha_proximo_pago_idx", ClientAccount.fecha_proximo_pago)
Index("client_accounts_estatus_idx", ClientAccount.estatus)


class ClientAccountPayment(Base):
    """Payment information tied to a client account."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("monto >= 0", name="ck_account_payments_monto_non_negative"),
        CheckConstraint(
            "metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Revendedor', 'Otro')",
            name="ck_account_payments_metodo_pago",
        ),
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
    metodo_pago = Column(String(50), nullable=False)
    notas = Column(Text, nullable=True)

    client_account = relationship("ClientAccount", back_populates="payments")
