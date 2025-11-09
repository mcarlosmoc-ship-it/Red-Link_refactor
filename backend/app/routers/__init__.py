"""Routers package."""

from .account_management import router as account_management_router
from .auth import router as auth_router
from .clients import router as clients_router
from .client_services import router as client_services_router
from .service_plans import router as service_plans_router
from .expenses import router as expenses_router
from .inventory import router as inventory_router
from .ip_pools import router as ip_pools_router
from .metrics import router as metrics_router
from .payments import router as payments_router
from .sales import router as sales_router
from .resellers import router as resellers_router

__all__ = [
    "account_management_router",
    "auth_router",
    "clients_router",
    "client_services_router",
    "service_plans_router",
    "payments_router",
    "resellers_router",
    "expenses_router",
    "inventory_router",
    "ip_pools_router",
    "metrics_router",
    "sales_router",
]
