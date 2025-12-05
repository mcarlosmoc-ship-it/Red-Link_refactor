"""Utilities to reconcile payment data across modules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models


@dataclass(frozen=True)
class CounterMismatch:
    """Represents a difference between two counter sources."""

    key: str
    payments_via_payments: int
    payments_via_services: int


@dataclass(frozen=True)
class PaymentClientMismatch:
    """Represents a payment whose client does not match the service owner."""

    payment_id: str
    client_id: str | None
    client_service_id: str | None
    service_client_id: str | None


@dataclass(frozen=True)
class PaymentConsistencySnapshot:
    """Aggregated inconsistencies detected across modules."""

    client_counters: list[CounterMismatch]
    service_counters: list[CounterMismatch]
    payments_without_service: list[str]
    payments_with_mismatched_client: list[PaymentClientMismatch]
    services_without_client: list[str]


class DataConsistencyService:
    """Data reconciliation helpers to surface integrity issues."""

    @staticmethod
    def _build_counter_map(
        rows: Iterable[tuple[str | None, int]]
    ) -> dict[str, int]:
        return {
            str(key): int(count)
            for key, count in rows
            if key is not None and count is not None
        }

    @classmethod
    def _compare_counters(
        cls, lhs: dict[str, int], rhs: dict[str, int]
    ) -> list[CounterMismatch]:
        mismatches: list[CounterMismatch] = []
        for key in sorted({*lhs.keys(), *rhs.keys()}):
            left_value = lhs.get(key, 0)
            right_value = rhs.get(key, 0)
            if left_value != right_value:
                mismatches.append(
                    CounterMismatch(
                        key=key,
                        payments_via_payments=left_value,
                        payments_via_services=right_value,
                    )
                )
        return mismatches

    @classmethod
    def payment_counters(cls, db: Session) -> PaymentConsistencySnapshot:
        """Compare payment counters grouped by client and service across modules."""

        payments_by_client = cls._build_counter_map(
            db.query(models.ServicePayment.client_id, func.count(models.ServicePayment.id))
            .group_by(models.ServicePayment.client_id)
            .all()
        )

        payments_by_client_via_service = cls._build_counter_map(
            db.query(
                models.Client.id,
                func.count(models.ServicePayment.id),
            )
            .join(models.ClientService, models.ClientService.client_id == models.Client.id)
            .outerjoin(
                models.ServicePayment,
                models.ServicePayment.client_service_id == models.ClientService.id,
            )
            .group_by(models.Client.id)
            .all()
        )

        payments_by_service = cls._build_counter_map(
            db.query(
                models.ServicePayment.client_service_id,
                func.count(models.ServicePayment.id),
            )
            .group_by(models.ServicePayment.client_service_id)
            .all()
        )

        payments_by_service_joined = cls._build_counter_map(
            db.query(
                models.ClientService.id,
                func.count(models.ServicePayment.id),
            )
            .outerjoin(
                models.ServicePayment,
                models.ServicePayment.client_service_id == models.ClientService.id,
            )
            .group_by(models.ClientService.id)
            .all()
        )

        payments_without_service = [
            str(payment_id)
            for (payment_id,) in db.query(models.ServicePayment.id)
            .outerjoin(
                models.ClientService,
                models.ServicePayment.client_service_id == models.ClientService.id,
            )
            .filter(models.ClientService.id.is_(None))
            .all()
        ]

        mismatched_clients = [
            PaymentClientMismatch(
                payment_id=str(payment.id),
                client_id=str(payment.client_id) if payment.client_id else None,
                client_service_id=str(payment.client_service_id)
                if payment.client_service_id
                else None,
                service_client_id=str(service.client_id) if service else None,
            )
            for payment, service in (
                db.query(models.ServicePayment, models.ClientService)
                .outerjoin(
                    models.ClientService,
                    models.ServicePayment.client_service_id == models.ClientService.id,
                )
                .filter(
                    models.ClientService.client_id.isnot(None),
                    models.ClientService.client_id != models.ServicePayment.client_id,
                )
                .all()
            )
        ]

        services_without_client = [
            str(service_id)
            for (service_id,) in db.query(models.ClientService.id)
            .outerjoin(models.Client, models.ClientService.client_id == models.Client.id)
            .filter(models.Client.id.is_(None))
            .all()
        ]

        return PaymentConsistencySnapshot(
            client_counters=cls._compare_counters(
                payments_by_client, payments_by_client_via_service
            ),
            service_counters=cls._compare_counters(
                payments_by_service, payments_by_service_joined
            ),
            payments_without_service=payments_without_service,
            payments_with_mismatched_client=mismatched_clients,
            services_without_client=services_without_client,
        )
