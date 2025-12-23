"""Database configuration for the FastAPI backend."""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "clients.db"
_DEFAULT_DATABASE_URL = f"sqlite:///{_DEFAULT_DB_PATH.as_posix()}"
REQUIRE_POSTGRES_ENV = "REQUIRE_POSTGRES"
POOL_SIZE_ENV = "DATABASE_POOL_SIZE"
POOL_MAX_OVERFLOW_ENV = "DATABASE_MAX_OVERFLOW"
POOL_TIMEOUT_ENV = "DATABASE_POOL_TIMEOUT"
POOL_RECYCLE_ENV = "DATABASE_POOL_RECYCLE"
CONNECT_TIMEOUT_ENV = "DATABASE_CONNECT_TIMEOUT"

DEFAULT_POOL_SIZE = 5
DEFAULT_MAX_OVERFLOW = 10
DEFAULT_POOL_TIMEOUT = 30
DEFAULT_POOL_RECYCLE = 1800
DEFAULT_CONNECT_TIMEOUT = 10


def _ensure_directory(path: str | os.PathLike[str]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def _read_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value < 0:
        raise ValueError(f"{name} must be non-negative")
    return value


def _read_bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_database_url(raw_url: str | None) -> str:
    if not raw_url:
        if _read_bool_env(REQUIRE_POSTGRES_ENV, False):
            raise RuntimeError(
                "DATABASE_URL must be configured for PostgreSQL when REQUIRE_POSTGRES=1"
            )
        _ensure_directory(_DEFAULT_DB_PATH)
        return _DEFAULT_DATABASE_URL

    url = make_url(raw_url)
    if url.drivername.startswith("sqlite") and url.database not in (None, "", ":memory:"):
        _ensure_directory(url.database)
    if _read_bool_env(REQUIRE_POSTGRES_ENV, False) and url.drivername.startswith("sqlite"):
        raise RuntimeError(
            "SQLite is not permitted when REQUIRE_POSTGRES=1; configure DATABASE_URL"
        )
    return str(url)


SQLALCHEMY_DATABASE_URL = _resolve_database_url(os.getenv("DATABASE_URL"))

engine_kwargs: Dict[str, Any] = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update(
        {
            "pool_pre_ping": True,
            "pool_size": _read_int_env(POOL_SIZE_ENV, DEFAULT_POOL_SIZE),
            "max_overflow": _read_int_env(POOL_MAX_OVERFLOW_ENV, DEFAULT_MAX_OVERFLOW),
            "pool_timeout": _read_int_env(POOL_TIMEOUT_ENV, DEFAULT_POOL_TIMEOUT),
            "pool_recycle": _read_int_env(POOL_RECYCLE_ENV, DEFAULT_POOL_RECYCLE),
            "connect_args": {
                "connect_timeout": _read_int_env(
                    CONNECT_TIMEOUT_ENV, DEFAULT_CONNECT_TIMEOUT
                )
            },
        }
    )

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator:
    """Yield a database session and ensure it is closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Generator:
    """Provide a transactional scope for operations outside of FastAPI dependencies."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
