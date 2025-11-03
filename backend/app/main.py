"""Entry point for the clients FastAPI backend."""

from fastapi import FastAPI

from .database import Base, engine
from .routers.clients import router as clients_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Clients API")

app.include_router(clients_router, prefix="/clients", tags=["clients"])


@app.get("/", tags=["health"])
def read_root() -> dict[str, str]:
    """Return a simple health check response."""
    return {"status": "ok"}
