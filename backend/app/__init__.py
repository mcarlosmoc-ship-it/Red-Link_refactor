"""FastAPI application package."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # This import is only for type checkers and should not run at runtime
    # during tasks like Alembic migrations where the FastAPI app and routers
    # are not needed.
    from .main import app as fastapi_app


def get_app():
    """Return the FastAPI application without importing it eagerly."""

    from .main import app as fastapi_app

    return fastapi_app


try:
    from .main import app
except Exception:  # pragma: no cover - avoid breaking Alembic/other CLIs
    app = None


__all__ = ["app", "get_app"]
