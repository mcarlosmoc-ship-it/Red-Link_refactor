"""Pydantic schemas for the client resources."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr


class ClientBase(BaseModel):
    """Shared attributes for client operations."""

    name: str
    email: EmailStr


class ClientCreate(ClientBase):
    """Schema for creating a new client."""

    pass


class ClientRead(ClientBase):
    """Schema for returning client data to the caller."""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
