"""Expose the Red-Link backend FastAPI app and enforce local development CORS defaults."""

import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Callable, Iterable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .migrations import run_database_migrations
from .routers import (
    account_management_router,
    auth_router,
    clients_router,
    client_services_router,
    expenses_router,
    inventory_router,
    ip_pools_router,
    metrics_router,
    payments_router,
    sales_router,
    resellers_router,
    service_plans_router,
)
from .services.account_management import start_overdue_monitor, stop_overdue_monitor
from .services.backups import start_backup_scheduler, stop_backup_scheduler
from .services.ip_quarantine import (
    start_ip_quarantine_scheduler,
    stop_ip_quarantine_scheduler,
)
from .services.payment_reminders import (
    start_payment_reminder_scheduler,
    stop_payment_reminder_scheduler,
)
from .services.schema_consistency import (
    start_schema_check_scheduler,
    stop_schema_check_scheduler,
)
from .services.scheduler_monitor import (
    JOB_BACKUPS,
    JOB_IP_QUARANTINE,
    JOB_OVERDUE_MONITOR,
    JOB_PAYMENT_REMINDERS,
    JOB_SCHEMA_CHECKS,
    SchedulerMonitor,
)

LOCAL_DEVELOPMENT_ORIGINS = {
    "http://localhost:5174",
    "http://localhost:5173",
}
LOCALHOST_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$"

DEFAULT_ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://0.0.0.0:5173",
    *LOCAL_DEVELOPMENT_ORIGINS,
    "http://127.0.0.1:5174",
    "http://0.0.0.0:5174",
    "https://localhost:5174",
    "https://127.0.0.1:5174",
    "https://0.0.0.0:5174",
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
    # spaces (e.g. ``BACKEND_ALLOWED_ORIGINS="http://localhost:5173 http://127.0.0.1:5173"``),
    # not just comma-separated lists. The previous implementation only
    # recognised commas which caused the entire string to be treated as a
    # single origin and, consequently, FastAPI did not emit the
    # ``Access-Control-Allow-Origin`` header. Accepting both commas and
    # whitespace makes the configuration more forgiving while keeping explicit
    # control of the allowed origins.
    return [origin for origin in re.split(r"[\s,]+", raw_value) if origin]


def _load_allowed_origins_from_env() -> list[str]:
    raw_value = os.getenv("BACKEND_ALLOWED_ORIGINS")
    if not raw_value:
        return []
    return _read_allowed_origins(_split_raw_origins(raw_value))


def _resolve_allowed_origins() -> list[str]:
    env_origins = _load_allowed_origins_from_env()
    if env_origins:
        origins = list(env_origins)
    else:
        origins = _read_allowed_origins(DEFAULT_ALLOWED_ORIGINS)

    missing_dev_origins = [
        origin for origin in LOCAL_DEVELOPMENT_ORIGINS if origin not in origins
    ]
    if missing_dev_origins:
        # Always include the Vite dev server origins used in local development
        # scripts so that requests from the local frontend succeed even when
        # the environment configuration omits them.
        origins = _read_allowed_origins([*origins, *missing_dev_origins])

    return origins


def _read_bool_env(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _maybe_start_job(env_flag: str, job_name: str, starter: Callable[[], None]) -> None:
    enabled = _read_bool_env(env_flag, True)
    SchedulerMonitor.set_job_enabled(job_name, enabled)
    if not enabled:
        LOGGER.info("%s disabled via %s", job_name, env_flag)
        return
    starter()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_database_is_ready()
    start_background_jobs()
    try:
        yield
    finally:
        stop_background_jobs()


app = FastAPI(title="Red-Link Backoffice API", lifespan=lifespan)

LOGGER = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_allowed_origins(),
    allow_origin_regex=LOCALHOST_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    account_management_router,
    prefix="/account-management",
    tags=["account-management"],
)
app.include_router(
    account_management_router,
    tags=["account-management"],
    include_in_schema=False,
)
app.include_router(auth_router)
app.include_router(clients_router, prefix="/clients", tags=["clients"])
app.include_router(
    client_services_router,
    prefix="/client-services",
    tags=["client-services"],
)
app.include_router(payments_router, prefix="/payments", tags=["payments"])
app.include_router(resellers_router, prefix="/resellers", tags=["resellers"])
app.include_router(expenses_router, prefix="/expenses", tags=["expenses"])
app.include_router(inventory_router, prefix="/inventory", tags=["inventory"])
app.include_router(ip_pools_router, prefix="/ip-pools", tags=["ip-pools"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
app.include_router(sales_router, prefix="/sales", tags=["sales"])
app.include_router(service_plans_router, prefix="/service-plans", tags=["service-plans"])


def ensure_database_is_ready() -> None:
    """Apply pending database migrations when the service starts."""

    LOGGER.info("Ensuring database schema is up to date before serving requests")
    run_database_migrations()


def start_background_jobs() -> None:
    """Start background tasks required by the service."""

    _maybe_start_job(
        env_flag="ENABLE_OVERDUE_MONITOR",
        job_name=JOB_OVERDUE_MONITOR,
        starter=start_overdue_monitor,
    )
    _maybe_start_job(
        env_flag="ENABLE_PAYMENT_REMINDERS",
        job_name=JOB_PAYMENT_REMINDERS,
        starter=start_payment_reminder_scheduler,
    )
    _maybe_start_job(
        env_flag="ENABLE_BACKUPS",
        job_name=JOB_BACKUPS,
        starter=start_backup_scheduler,
    )
    _maybe_start_job(
        env_flag="ENABLE_SCHEMA_CHECKS",
        job_name=JOB_SCHEMA_CHECKS,
        starter=start_schema_check_scheduler,
    )
    _maybe_start_job(
        env_flag="ENABLE_IP_QUARANTINE_CLEANUP",
        job_name=JOB_IP_QUARANTINE,
        starter=start_ip_quarantine_scheduler,
    )


@app.get("/", tags=["health"])
def read_root() -> dict[str, str]:
    """Return a simple health check response."""
    return {"status": "ok"}


def stop_background_jobs() -> None:
    """Ensure background tasks are stopped when the application shuts down."""

    stop_overdue_monitor()
    stop_payment_reminder_scheduler()
    stop_backup_scheduler()
    stop_schema_check_scheduler()
    stop_ip_quarantine_scheduler()
