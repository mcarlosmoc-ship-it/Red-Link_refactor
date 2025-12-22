"""SQLAlchemy model definitions for client payments."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import Enum


class PaymentMethod(str, enum.Enum):
    """Supported payment methods."""

    MIXTO = "Mixto"
    EFECTIVO = "Efectivo"
    TRANSFERENCIA = "Transferencia"
    TARJETA = "Tarjeta"
    REVENDEDOR = "Revendedor"
    OTRO = "Otro"


PAYMENT_METHOD_ENUM = Enum(
    PaymentMethod,
    name="payment_method_enum",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
    native_enum=True,
    validate_strings=True,
)
