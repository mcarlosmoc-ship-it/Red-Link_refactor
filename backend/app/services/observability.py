"""Helpers to persist structured operational metrics and validation results."""

from __future__ import annotations

import logging
import time
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from .. import models

LOGGER = logging.getLogger(__name__)


class MetricOutcome(str):
    SUCCESS = "success"
    REJECTED = "rejected"
    ERROR = "error"


class ObservabilityService:
    """Centralizes recording of operational metrics for dashboards and alerts."""

    @staticmethod
    def record_event(
        db: Session,
        event_type: str,
        outcome: str,
        *,
        duration_ms: float | None = None,
        tags: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        payload = models.OperationalMetricEvent(
            event_type=event_type,
            outcome=outcome,
            duration_ms=Decimal(str(duration_ms)) if duration_ms is not None else None,
            tags=tags or {},
            details=metadata or None,
        )
        ObservabilityService._persist(db, payload)

    @staticmethod
    def record_validation_result(
        db: Session,
        event_type: str,
        *,
        outcome: str,
        reason: str,
        tags: dict[str, Any] | None = None,
        duration_ms: float | None = None,
    ) -> None:
        ObservabilityService.record_event(
            db,
            event_type,
            outcome,
            duration_ms=duration_ms,
            tags={"reason": reason, **(tags or {})},
            metadata={"rejection_reason": reason},
        )

    @staticmethod
    def timed_event(db: Session, event_type: str, *, tags: dict[str, Any] | None = None):
        """Context manager to measure operation durations."""

        class _Timer:
            def __enter__(self):
                self._start = time.perf_counter()
                return self

            def __exit__(self, exc_type, exc, tb):
                duration = (time.perf_counter() - self._start) * 1000
                outcome = MetricOutcome.ERROR if exc else MetricOutcome.SUCCESS
                ObservabilityService.record_event(
                    db,
                    event_type,
                    outcome,
                    duration_ms=duration,
                    tags=tags,
                    metadata={"exception": str(exc)} if exc else None,
                )
                return False

        return _Timer()

    @staticmethod
    def _persist(db: Session, event: models.OperationalMetricEvent) -> None:
        try:
            engine = db.get_bind()
            with Session(bind=engine) as metrics_session:
                metrics_session.add(event)
                metrics_session.commit()
        except Exception:  # pragma: no cover - metrics failures should not break flows
            LOGGER.exception("Failed to persist operational metric event", exc_info=True)
