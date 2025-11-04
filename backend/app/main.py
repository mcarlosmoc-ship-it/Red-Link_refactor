"""Expose the Red-Link backend FastAPI app with clients, payments, resellers, expenses, inventory, and metrics routers."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .migrations import run_database_migrations
from .routers import (
    clients_router,
    expenses_router,
    inventory_router,
    metrics_router,
    payments_router,
    resellers_router,
)

app = FastAPI(title="Red-Link Backoffice API")

LOGGER = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clients_router, prefix="/clients", tags=["clients"])
app.include_router(payments_router, prefix="/payments", tags=["payments"])
app.include_router(resellers_router, prefix="/resellers", tags=["resellers"])
app.include_router(expenses_router, prefix="/expenses", tags=["expenses"])
app.include_router(inventory_router, prefix="/inventory", tags=["inventory"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])


@app.on_event("startup")
def ensure_database_is_ready() -> None:
    """Apply pending database migrations when the service starts."""

    LOGGER.info("Ensuring database schema is up to date before serving requests")
    run_database_migrations()


@app.get("/", tags=["health"])
def read_root() -> dict[str, str]:
    """Return a simple health check response."""
    return {"status": "ok"}
