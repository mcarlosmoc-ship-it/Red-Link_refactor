"""Service helpers to manage billing periods."""

from __future__ import annotations

from calendar import monthrange
from datetime import date

from sqlalchemy.orm import Session

from .. import models


class BillingPeriodService:
    """Utility helpers to ensure billing periods exist when needed."""

    @staticmethod
    def ensure_period(db: Session, period_key: str) -> models.BillingPeriod:
        """Return an existing period or create it if missing.

        The `period_key` is normalized to the YYYY-MM format before storing it. The
        period boundaries are inferred from the key (first and last day of the
        month).
        """

        normalized_key, starts_on, ends_on = BillingPeriodService._normalize_period(period_key)

        period = (
            db.query(models.BillingPeriod)
            .filter(models.BillingPeriod.period_key == normalized_key)
            .first()
        )
        if period:
            updated = False
            if period.starts_on != starts_on:
                period.starts_on = starts_on
                updated = True
            if period.ends_on != ends_on:
                period.ends_on = ends_on
                updated = True
            if updated:
                db.add(period)
                db.flush()
            return period

        period = models.BillingPeriod(
            period_key=normalized_key,
            starts_on=starts_on,
            ends_on=ends_on,
        )
        db.add(period)
        db.flush()
        return period

    @staticmethod
    def _normalize_period(period_key: str) -> tuple[str, date, date]:
        if not period_key:
            raise ValueError("period_key is required")

        try:
            year_str, month_str = period_key.split("-", maxsplit=1)
            year = int(year_str)
            month = int(month_str)
        except Exception as exc:  # pragma: no cover - defensive
            raise ValueError("Invalid period key format, expected YYYY-MM") from exc

        if month < 1 or month > 12:
            raise ValueError("Invalid period key format, expected YYYY-MM")

        starts_on = date(year, month, 1)
        _, last_day = monthrange(year, month)
        ends_on = date(year, month, last_day)
        normalized_key = f"{year:04d}-{month:02d}"
        return normalized_key, starts_on, ends_on
