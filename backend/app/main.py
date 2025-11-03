"""Entry point for the clients FastAPI backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers.clients import router as clients_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Clients API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clients_router, prefix="/clients", tags=["clients"])


@app.get("/", tags=["health"])
def read_root() -> dict[str, str]:
    """Return a simple health check response."""
    return {"status": "ok"}
