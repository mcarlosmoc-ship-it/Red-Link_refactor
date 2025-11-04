"""Custom SQLAlchemy column types for multi-database compatibility."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.dialects import postgresql
from sqlalchemy.types import CHAR, String, TypeDecorator


class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type.

    Stores UUID values as ``UUID`` in PostgreSQL and as 36-character strings
    elsewhere. Values are normalised to strings when read so the existing
    application code can keep treating identifiers as text.
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: Any, dialect):  # type: ignore[override]
        if value is None:
            return value
        if dialect.name == "postgresql":
            if isinstance(value, uuid.UUID):
                return value
            return uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value: Any, dialect):  # type: ignore[override]
        if value is None:
            return value
        return str(value)


class INET(TypeDecorator):
    """Represents IPv4/IPv6 addresses.

    Uses the native ``INET`` type in PostgreSQL and falls back to a sized
    ``String`` column in other engines.
    """

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.INET())
        return dialect.type_descriptor(String(45))

    def process_bind_param(self, value: Any, dialect):  # type: ignore[override]
        if value is None:
            return value
        return str(value)

    def process_result_value(self, value: Any, dialect):  # type: ignore[override]
        if value is None:
            return value
        return str(value)
