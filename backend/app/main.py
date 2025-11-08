"""Expose the Red-Link backend FastAPI app with clients, payments, resellers, expenses, inventory, and metrics routers."""

import logging
import os
import re
from typing import Iterable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .migrations import run_database_migrations
from .routers import (
    account_management_router,
    auth_router,
    clients_router,
    expenses_router,
    inventory_router,
    metrics_router,
    payments_router,
    sales_router,
    resellers_router,
)
from .services.account_management import start_overdue_monitor, stop_overdue_monitor
from .services.backups import start_backup_scheduler, stop_backup_scheduler
from .services.payment_reminders import (
    start_payment_reminder_scheduler,
    stop_payment_reminder_scheduler,
)

DEFAULT_ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://0.0.0.0:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://0.0.0.0:5174",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://0.0.0.0:4173",
    "http://localhost:4174",
    "http://127.0.0.1:4174",
    "http://0.0.0.0:4174",
}


def _normalize_origin(origin: str) -> str | None:
    stripped = origin.strip()
    if not stripped:
        return None
    return stripped.rstrip("/")


def _read_allowed_origins(raw_origins: Iterable[str]) -> list[str]:
    normalized = {_normalize_origin(origin) for origin in raw_origins}
    return sorted({origin for origin in normalized if origin})


def _split_raw_origins(raw_value: str) -> list[str]:
    """Split a raw origin string using commas or whitespace as separators."""

    # Developers sometimes provide environment variables separated only by
    # spaces (e.g. ``"http://localhost:5173 http://127.0.0.1:5173"``). The
    # previous implementation only recognised commas which caused the entire
    # string to be treated as a single origin and, consequently, FastAPI did
    # not emit the ``Access-Control-Allow-Origin`` header. Accepting both
    # commas and whitespace makes the configuration more forgiving while
    # keeping explicit control of the allowed origins.
    return [origin for origin in re.split(r"[\s,]+", raw_value) if origin]


def _load_allowed_origins_from_env() -> list[str]:
    raw_value = os.getenv("BACKEND_ALLOWED_ORIGINS")
    if not raw_value:
        return []
    return _read_allowed_origins(_split_raw_origins(raw_value))


def _resolve_allowed_origins() -> list[str]:
    env_origins = _load_allowed_origins_from_env()
    if env_origins:
        return env_origins
    return _read_allowed_origins(DEFAULT_ALLOWED_ORIGINS)


app = FastAPI(title="Red-Link Backoffice API")

LOGGER = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    account_management_router,
    prefix="/account-management",
    tags=["account-management"],
)
app.include_router(auth_router)
app.include_router(clients_router, prefix="/clients", tags=["clients"])
app.include_router(payments_router, prefix="/payments", tags=["payments"])
app.include_router(resellers_router, prefix="/resellers", tags=["resellers"])
app.include_router(expenses_router, prefix="/expenses", tags=["expenses"])
app.include_router(inventory_router, prefix="/inventory", tags=["inventory"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
app.include_router(sales_router, prefix="/sales", tags=["sales"])


@app.on_event("startup")
def ensure_database_is_ready() -> None:
    """Apply pending database migrations when the service starts."""

    LOGGER.info("Ensuring database schema is up to date before serving requests")
    run_database_migrations()


@app.on_event("startup")
def start_background_jobs() -> None:
    """Start background tasks required by the service."""

    start_overdue_monitor()
    start_payment_reminder_scheduler()
    start_backup_scheduler()


@app.get("/", tags=["health"])
def read_root() -> dict[str, str]:
    """Return a simple health check response."""
    return {"status": "ok"}


@app.on_event("shutdown")
def stop_background_jobs() -> None:
    """Ensure background tasks are stopped when the application shuts down."""

    stop_overdue_monitor()
    stop_payment_reminder_scheduler()
    stop_backup_scheduler()
