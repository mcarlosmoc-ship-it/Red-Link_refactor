"""Aggregated metrics used by dashboard visualisations."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Dict, Iterable, Tuple

from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from .clients import ClientService
from .payments import PaymentService
from .resellers import ResellerService


@dataclass
class _DashboardClient:
    id: str
    full_name: str
    location: str
    monthly_fee: Decimal
    debt_months: Decimal
    paid_months_ahead: Decimal
    service_status: str
    client_type: str | None


class MetricsService:
    """Provides aggregated metrics combining multiple domain entities."""

    @staticmethod
    def _service_effective_price(service: models.ClientService) -> Decimal:
        value = getattr(service, "effective_price", None)
        if value is None:
            if service.custom_price is not None:
                value = service.custom_price
            elif service.service_plan is not None:
                value = service.service_plan.monthly_price
        if value is None:
            return Decimal("0")
        return Decimal(str(value))

    @staticmethod
    def _resolve_client_billing_context(
        client: models.Client,
    ) -> tuple[Decimal, Decimal, Decimal, bool]:
        services = list(getattr(client, "services", []) or [])
        active_services = [
            service
            for service in services
            if service.status == models.ClientServiceStatus.ACTIVE
        ]

        preferred_types = {
            models.ClientServiceType.INTERNET,
            models.ClientServiceType.HOTSPOT,
        }

        def service_priority(service: models.ClientService) -> tuple[int, date]:
            category = None
            if service.service_plan is not None:
                category = service.service_plan.category
            elif hasattr(service, "category") and service.category is not None:
                category = service.category
            priority = 0 if category in preferred_types else 1
            created_at = getattr(service, "created_at", None)
            if isinstance(created_at, datetime):
                return priority, created_at.date()
            if isinstance(created_at, date):
                return priority, created_at
            return priority, date.min

        prioritized_services = sorted(active_services, key=service_priority)

        effective_price = Decimal(str(client.monthly_fee or 0))
        if effective_price < Decimal("0"):
            effective_price = Decimal("0")
        courtesy = effective_price == Decimal("0")

        for service in prioritized_services:
            price = MetricsService._service_effective_price(service)
            if price > Decimal("0"):
                effective_price = price
                courtesy = False
                break
            if price == Decimal("0") and effective_price <= Decimal("0"):
                effective_price = Decimal("0")
                courtesy = True

        debt_months = Decimal(str(client.debt_months or 0))
        service_debt_months = sum(
            Decimal(str(service.debt_months or 0)) for service in active_services
        )
        if service_debt_months > Decimal("0"):
            debt_months = service_debt_months
        ahead_months = Decimal(str(client.paid_months_ahead or 0))

        if courtesy:
            debt_months = Decimal("0")
            ahead_months = Decimal("0")

        return effective_price, debt_months, ahead_months, courtesy

    @staticmethod
    def overview(db: Session, *, period_key: str | None = None) -> Dict[str, Decimal]:
        clients = list(
            db.query(models.Client)
            .options(
                selectinload(models.Client.services).selectinload(
                    models.ClientService.service_plan
                )
            )
            .all()
        )
        total_clients = len(clients)
        paid_clients = 0
        pending_clients = 0
        total_debt_amount = Decimal("0")

        for client in clients:
            effective_price, debt_months, _ahead_months, _courtesy = (
                MetricsService._resolve_client_billing_context(client)
            )
            service_debt_amount = sum(
                Decimal(str(service.debt_amount or 0))
                if Decimal(str(service.debt_amount or 0)) > 0
                else Decimal(str(service.debt_months or 0))
                * MetricsService._service_effective_price(service)
                for service in getattr(client, "services", []) or []
            )
            debt_amount = (
                service_debt_amount
                if service_debt_amount > 0
                else debt_months * effective_price
            )
            if debt_months == Decimal("0"):
                paid_clients += 1
            else:
                pending_clients += 1
                total_debt_amount += debt_amount

        base_cost_breakdown: Dict[str, Decimal] = {}

        if period_key:
            client_income = PaymentService.total_amount_for_period(db, period_key)
            reseller_income = ResellerService.total_settlements_for_period(db, period_key)
            expenses_total = MetricsService._total_expenses_for_period(db, period_key)
            internet_costs, base_cost_breakdown = MetricsService._total_operating_costs_for_period(db, period_key)
            payments_for_period = client_income
        else:
            payments_for_period = sum(
                Decimal(payment.amount or 0)
                for payment in db.query(models.ServicePayment).all()
            )
            client_income = payments_for_period
            reseller_income = ResellerService.total_settlements_for_period(db, period_key=None)
            expenses_total = sum(Decimal(expense.amount or 0) for expense in db.query(models.Expense).all())
            costs = db.query(models.BaseOperatingCost).all()
            for cost in costs:
                base_cost_breakdown[str(cost.base_id)] = base_cost_breakdown.get(str(cost.base_id), Decimal("0")) + Decimal(cost.total_cost or 0)
            internet_costs = sum(base_cost_breakdown.values())

        payments_today = PaymentService.total_amount_for_day(db, date.today())

        net_earnings = client_income + reseller_income - expenses_total - internet_costs

        return {
            "total_clients": total_clients,
            "paid_clients": paid_clients,
            "pending_clients": pending_clients,
            "total_debt_amount": total_debt_amount,
            "client_income": client_income,
            "reseller_income": reseller_income,
            "total_expenses": expenses_total,
            "internet_costs": internet_costs,
            "net_earnings": net_earnings,
            "payments_for_period": payments_for_period,
            "payments_today": payments_today,
            "base_cost_breakdown": base_cost_breakdown,
        }

    @staticmethod
    def community_breakdown(db: Session, *, period_key: str | None = None) -> list[dict]:
        breakdown: Dict[str, Dict[str, Decimal]] = defaultdict(
            lambda: {"total_clients": 0, "pending_clients": 0, "debt_amount": Decimal("0"), "payments": Decimal("0")}
        )
        clients = (
            db.query(models.Client)
            .options(
                selectinload(models.Client.services).selectinload(
                    models.ClientService.service_plan
                )
            )
            .all()
        )
        for client in clients:
            location = client.location or "Desconocido"
            location_metrics = breakdown[location]
            location_metrics["total_clients"] += 1
            effective_price, debt_months, _ahead_months, _courtesy = (
                MetricsService._resolve_client_billing_context(client)
            )
            service_debt_amount = sum(
                Decimal(str(service.debt_amount or 0))
                if Decimal(str(service.debt_amount or 0)) > 0
                else Decimal(str(service.debt_months or 0))
                * MetricsService._service_effective_price(service)
                for service in getattr(client, "services", []) or []
            )
            debt_amount = (
                service_debt_amount
                if service_debt_amount > 0
                else debt_months * effective_price
            )
            if debt_months > Decimal("0"):
                location_metrics["pending_clients"] += 1
            location_metrics["debt_amount"] += debt_amount

        if period_key:
            payments, _payments_total = PaymentService.list_payments(db, period_key=period_key, limit=10_000)
        else:
            payments, _payments_total = PaymentService.list_payments(db, limit=10_000)

        for payment in payments:
            client = payment.client
            if not client:
                continue
            location = client.location or "Desconocido"
            breakdown[location]["payments"] += Decimal(payment.amount or 0)

        return [
            {
                "location": location,
                "total_clients": metrics["total_clients"],
                "pending_clients": metrics["pending_clients"],
                "debt_amount": metrics["debt_amount"],
                "payments": metrics.get("payments", Decimal("0")),
            }
            for location, metrics in breakdown.items()
        ]

    @staticmethod
    def _total_expenses_for_period(db: Session, period_key: str) -> Decimal:
        expenses = db.query(models.Expense).all()
        total = Decimal("0")
        for expense in expenses:
            if expense.expense_date and expense.expense_date.strftime("%Y-%m") != period_key:
                continue
            total += Decimal(expense.amount or 0)
        return total

    @staticmethod
    def _total_operating_costs_for_period(db: Session, period_key: str) -> tuple[Decimal, Dict[str, Decimal]]:
        costs = (
            db.query(models.BaseOperatingCost)
            .filter(models.BaseOperatingCost.period_key == period_key)
            .all()
        )
        breakdown: Dict[str, Decimal] = {}
        total = Decimal("0")
        for cost in costs:
            value = Decimal(cost.total_cost or 0)
            breakdown[str(cost.base_id)] = breakdown.get(str(cost.base_id), Decimal("0")) + value
            total += value
        return total, breakdown

    @staticmethod
    def dashboard(
        db: Session,
        *,
        period_key: str | None = None,
        current_period: str | None = None,
        status_filter: schemas.StatusFilter = schemas.StatusFilter.ALL,
        search: str | None = None,
    ) -> dict:
        """Aggregate dashboard metrics, the `base_costs` breakdown, and project client states."""

        actual_current = current_period or MetricsService._current_period_key()
        target_period = period_key or actual_current
        offset = MetricsService._diff_periods(actual_current, target_period)

        clients, _total = ClientService.list_clients(db, limit=10_000)
        projected_clients = [
            MetricsService._project_client_for_offset(client, offset) for client in clients
        ]

        filtered_clients = MetricsService._filter_clients(projected_clients, status_filter, search)

        summary, base_costs = MetricsService._build_dashboard_summary(
            db,
            projected_clients,
            target_period,
            current_period_key=actual_current,
        )

        return {
            "summary": summary,
            "clients": [MetricsService._serialize_dashboard_client(client) for client in filtered_clients],
            "base_costs": base_costs,
        }

    @staticmethod
    def _current_period_key() -> str:
        today = date.today()
        return f"{today.year}-{today.month:02d}"

    @staticmethod
    def _diff_periods(current_period: str, target_period: str) -> int:
        current_year, current_month = MetricsService._split_period(current_period)
        target_year, target_month = MetricsService._split_period(target_period)
        return (target_year - current_year) * 12 + (target_month - current_month)

    @staticmethod
    def _split_period(period: str) -> Tuple[int, int]:
        try:
            year_str, month_str = period.split("-", maxsplit=1)
            return int(year_str), int(month_str)
        except Exception:  # pragma: no cover - defensive fallback
            today = date.today()
            return today.year, today.month

    @staticmethod
    def _project_client_for_offset(client: models.Client, offset: int) -> _DashboardClient:
        effective_price, debt, ahead, courtesy = MetricsService._resolve_client_billing_context(
            client
        )

        if offset > 0:
            consumed_ahead = min(ahead, Decimal(offset))
            remaining_ahead = ahead - consumed_ahead
            extra_debt = Decimal(offset) - consumed_ahead
            debt = MetricsService._normalize_months(debt + extra_debt)
            ahead = MetricsService._normalize_months(remaining_ahead)
        elif offset < 0:
            months_back = Decimal(abs(offset))
            restored_debt = min(debt, months_back)
            debt = MetricsService._normalize_months(debt - restored_debt)
            recovered_ahead = months_back - restored_debt
            ahead = MetricsService._normalize_months(ahead + recovered_ahead)
        else:
            debt = MetricsService._normalize_months(debt)
            ahead = MetricsService._normalize_months(ahead)

        service_status = (
            models.ServiceStatus.ACTIVE.value
            if debt == Decimal("0")
            else models.ServiceStatus.SUSPENDED.value
        )

        client_type = None
        if hasattr(client.client_type, "value"):
            client_type = client.client_type.value
        elif client.client_type is not None:
            client_type = str(client.client_type)

        monthly_fee = effective_price if effective_price > Decimal("0") else Decimal("0")
        if courtesy:
            debt = Decimal("0")
            ahead = Decimal("0")

        return _DashboardClient(
            id=client.id,
            full_name=client.full_name,
            location=client.location,
            monthly_fee=monthly_fee,
            debt_months=debt,
            paid_months_ahead=ahead,
            service_status=service_status,
            client_type=client_type,
        )

    @staticmethod
    def _normalize_months(value: Decimal) -> Decimal:
        rounded = value.quantize(Decimal("0.0001"))
        return rounded if rounded.copy_abs() >= Decimal("0.0001") else Decimal("0")

    @staticmethod
    def _filter_clients(
        clients: Iterable[_DashboardClient],
        status_filter: schemas.StatusFilter,
        search: str | None,
    ) -> list[_DashboardClient]:
        normalized_search = search.lower().strip() if search else ""

        def matches_status(client: _DashboardClient) -> bool:
            if status_filter == schemas.StatusFilter.PAID:
                return client.debt_months == Decimal("0")
            if status_filter == schemas.StatusFilter.PENDING:
                return client.debt_months > Decimal("0")
            return True

        def matches_search(client: _DashboardClient) -> bool:
            if not normalized_search:
                return True
            name = (client.full_name or "").lower()
            location = (client.location or "").lower()
            return normalized_search in name or normalized_search in location

        return [client for client in clients if matches_status(client) and matches_search(client)]

    @staticmethod
    def _build_dashboard_summary(
        db: Session,
        clients: Iterable[_DashboardClient],
        period_key: str,
        *,
        current_period_key: str,
    ) -> tuple[dict, Dict[str, Decimal]]:
        clients_list = list(clients)

        total_clients = len(clients_list)
        paid_clients = sum(1 for client in clients_list if client.debt_months == Decimal("0"))
        pending_clients = total_clients - paid_clients
        total_debt_amount = sum(
            client.debt_months * client.monthly_fee
            for client in clients_list
        )

        client_income = sum(
            client.monthly_fee
            for client in clients_list
            if client.debt_months == Decimal("0")
        )

        reseller_income = MetricsService._total_reseller_income_for_period(db, period_key)
        expenses_total = MetricsService._total_expenses_for_period(db, period_key)
        internet_costs, base_costs = MetricsService._total_operating_costs_for_period(db, period_key)

        payments_for_period = PaymentService.total_amount_for_period(db, period_key)
        payments_today = Decimal("0")
        if period_key == current_period_key:
            payments_today = PaymentService.total_amount_for_day(db, date.today())

        net_earnings = client_income + reseller_income - expenses_total - internet_costs

        summary = {
            "total_clients": total_clients,
            "paid_clients": paid_clients,
            "pending_clients": pending_clients,
            "total_debt_amount": total_debt_amount,
            "client_income": client_income,
            "reseller_income": reseller_income,
            "total_expenses": expenses_total,
            "internet_costs": internet_costs,
            "net_earnings": net_earnings,
            "payments_for_period": payments_for_period,
            "payments_today": payments_today,
        }

        return summary, base_costs

    @staticmethod
    def _total_reseller_income_for_period(db: Session, period_key: str) -> Decimal:
        total = Decimal("0")
        for reseller in ResellerService.list_resellers(db):
            for settlement in reseller.settlements:
                if not settlement.settled_on:
                    continue
                if settlement.settled_on.strftime("%Y-%m") != period_key:
                    continue
                gain_value = getattr(settlement, "my_gain", None)
                amount_value = gain_value if gain_value is not None else settlement.amount
                total += Decimal(amount_value or 0)
        return total

    @staticmethod
    def _serialize_dashboard_client(client: _DashboardClient) -> dict:
        return {
            "id": client.id,
            "name": client.full_name,
            "location": client.location,
            "monthly_fee": client.monthly_fee,
            "debt_months": client.debt_months,
            "paid_months_ahead": client.paid_months_ahead,
            "service_status": client.service_status,
            "client_type": client.client_type,
        }
