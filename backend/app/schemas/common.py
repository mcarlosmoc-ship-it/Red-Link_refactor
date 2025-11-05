"""Shared schema definitions."""

from __future__ import annotations

from typing import Generic, Sequence, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard shape for paginated listings."""

    items: Sequence[T]
    total: int = Field(..., ge=0)
    limit: int = Field(..., ge=1)
    skip: int = Field(..., ge=0)
