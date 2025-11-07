"""Pydantic schemas for authentication endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    """Payload required to obtain an administrator access token."""

    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=8)
    otp_code: str | None = Field(default=None, min_length=6, max_length=8)


class TokenResponse(BaseModel):
    """Access token returned upon successful authentication."""

    access_token: str
    token_type: str = "bearer"
