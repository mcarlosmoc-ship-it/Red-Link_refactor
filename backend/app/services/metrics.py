"""Aggregated metrics used by dashboard visualisations."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Dict

from sqlalchemy.orm import Session

from .. import models
from .payments import PaymentService
from .resellers import ResellerService


class MetricsService:
    """Provides aggregated metrics combining multiple domain entities."""

    @staticmethod
    def overview(db: Session, *, period_key: str | None = None) -> Dict[str, Decimal]:
        clients = list(db.query(models.Client).all())
        total_clients = len(clients)
        paid_clients = sum(1 for client in clients if Decimal(client.debt_months or 0) == 0)
        pending_clients = total_clients - paid_clients

        total_debt_amount = sum(
            Decimal(client.debt_months or 0) * Decimal(client.monthly_fee or 0)
            for client in clients
        )

        base_cost_breakdown: Dict[str, Decimal] = {}

        if period_key:
            client_income = PaymentService.total_amount_for_period(db, period_key)
            reseller_income = ResellerService.total_settlements_for_period(db, period_key)
            expenses_total = MetricsService._total_expenses_for_period(db, period_key)
            internet_costs, base_cost_breakdown = MetricsService._total_operating_costs_for_period(db, period_key)
        else:
            client_income = sum(Decimal(payment.amount or 0) for payment in db.query(models.Payment).all())
            reseller_income = ResellerService.total_settlements_for_period(db, period_key=None)
            expenses_total = sum(Decimal(expense.amount or 0) for expense in db.query(models.Expense).all())
            costs = db.query(models.BaseOperatingCost).all()
            for cost in costs:
                base_cost_breakdown[str(cost.base_id)] = base_cost_breakdown.get(str(cost.base_id), Decimal("0")) + Decimal(cost.total_cost or 0)
            internet_costs = sum(base_cost_breakdown.values())

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
            "base_cost_breakdown": base_cost_breakdown,
        }

    @staticmethod
    def community_breakdown(db: Session, *, period_key: str | None = None) -> list[dict]:
        breakdown: Dict[str, Dict[str, Decimal]] = defaultdict(
            lambda: {"total_clients": 0, "pending_clients": 0, "debt_amount": Decimal("0"), "payments": Decimal("0")}
        )
        clients = db.query(models.Client).all()
        for client in clients:
            location = client.location or "Desconocido"
            location_metrics = breakdown[location]
            location_metrics["total_clients"] += 1
            debt_months = Decimal(client.debt_months or 0)
            if debt_months > 0:
                location_metrics["pending_clients"] += 1
            location_metrics["debt_amount"] += debt_months * Decimal(client.monthly_fee or 0)

        if period_key:
            payments = PaymentService.list_payments(db, period_key=period_key)
        else:
            payments = PaymentService.list_payments(db)

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
