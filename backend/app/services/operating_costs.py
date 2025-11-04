"""Service helpers to manage base operating costs."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Mapping

from sqlalchemy.orm import Session

from .. import models
from .billing_periods import BillingPeriodService


class OperatingCostService:
    """Encapsulates mutations for base operating cost records."""

    @staticmethod
    def update_costs(
        db: Session,
        *,
        period_key: str,
        costs: Mapping[int, Decimal],
    ) -> tuple[str, Dict[str, Decimal]]:
        """Create or update operating costs for the given period.

        Parameters
        ----------
        db:
            Active SQLAlchemy session.
        period_key:
            Billing period identifier in ``YYYY-MM`` format. The period is
            created if it does not already exist.
        costs:
            Mapping of ``base_id`` to the total operating cost for that base.

        Returns
        -------
        tuple
            Normalized period key and a mapping of base identifiers (as
            strings) to the stored Decimal amounts.
        """

        if not period_key:
            raise ValueError("period_key is required")

        period = BillingPeriodService.ensure_period(db, period_key)
        normalized_period = period.period_key

        existing_costs = (
            db.query(models.BaseOperatingCost)
            .filter(models.BaseOperatingCost.period_key == normalized_period)
            .all()
        )
        existing_by_base = {cost.base_id: cost for cost in existing_costs}

        sanitized: Dict[int, Decimal] = {}
        for base_id, raw_value in costs.items():
            if raw_value is None:
                continue

            value = Decimal(raw_value)
            # Persist values with two decimal places to match the database
            # column precision while avoiding binary floating point artifacts.
            normalized_value = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            sanitized[base_id] = normalized_value

            record = existing_by_base.get(base_id)
            if record:
                record.total_cost = normalized_value
            else:
                db.add(
                    models.BaseOperatingCost(
                        base_id=base_id,
                        period_key=normalized_period,
                        total_cost=normalized_value,
                    )
                )

        db.commit()

        refreshed = (
            db.query(models.BaseOperatingCost)
            .filter(models.BaseOperatingCost.period_key == normalized_period)
            .all()
        )

        return normalized_period, {
            str(cost.base_id): Decimal(cost.total_cost or 0).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            for cost in refreshed
        }
