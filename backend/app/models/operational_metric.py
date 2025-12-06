"""Models used to capture operational and validation metrics."""

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, JSON, Numeric, String, func
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from ..database import Base
from ..db_types import GUID


class OperationalMetricEvent(Base):
    """Represents a single operational metric event for observability dashboards."""

    __tablename__ = "operational_metric_events"

    id = Column("event_id", GUID(), primary_key=True, default=uuid.uuid4)
    event_type = Column(String(120), nullable=False, index=True)
    outcome = Column(String(32), nullable=False, index=True)
    duration_ms = Column(Numeric(14, 3), nullable=True)
    tags = Column("labels", JSON().with_variant(SQLiteJSON(), "sqlite"), nullable=False, default=dict)
    details = Column("details", JSON().with_variant(SQLiteJSON(), "sqlite"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
