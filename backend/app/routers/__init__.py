"""Routers package."""

from .clients import router as clients_router
from .expenses import router as expenses_router
from .inventory import router as inventory_router
from .metrics import router as metrics_router
from .payments import router as payments_router
from .sales import router as sales_router
from .resellers import router as resellers_router

__all__ = [
    "clients_router",
    "payments_router",
    "resellers_router",
    "expenses_router",
    "inventory_router",
    "metrics_router",
    "sales_router",
]
