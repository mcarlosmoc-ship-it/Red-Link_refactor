"""Service layer encapsulating business logic for API routers."""

from .account_management import (
    AccountService,
    AccountServiceError,
    ClientAccountLimitReached,
    PrincipalAccountNotFoundError,
    start_overdue_monitor,
    stop_overdue_monitor,
)
from .clients import ClientService
from .payments import PaymentService, PaymentServiceError
from .resellers import ResellerService
from .expenses import ExpenseService
from .inventory import InventoryService
from .metrics import MetricsService
from .pos import PosService, PosServiceError
from .billing_periods import BillingPeriodService
from .operating_costs import OperatingCostService
from .financial_snapshots import FinancialSnapshotService
from .payment_reminders import (
    PaymentReminderService,
    build_notification_client_from_env,
    start_payment_reminder_scheduler,
    stop_payment_reminder_scheduler,
)

__all__ = [
    "AccountService",
    "AccountServiceError",
    "ClientAccountLimitReached",
    "PrincipalAccountNotFoundError",
    "start_overdue_monitor",
    "stop_overdue_monitor",
    "ClientService",
    "PaymentService",
    "PaymentServiceError",
    "ResellerService",
    "ExpenseService",
    "InventoryService",
    "MetricsService",
    "PosService",
    "PosServiceError",
    "BillingPeriodService",
    "OperatingCostService",
    "FinancialSnapshotService",
    "PaymentReminderService",
    "build_notification_client_from_env",
    "start_payment_reminder_scheduler",
    "stop_payment_reminder_scheduler",
]
