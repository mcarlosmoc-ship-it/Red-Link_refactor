"""Authentication endpoints for administrator access."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from .. import schemas
from ..security import AdminIdentity, authenticate_admin, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token", response_model=schemas.TokenResponse)
def obtain_access_token(payload: schemas.AdminLoginRequest) -> schemas.TokenResponse:
    """Authenticate an administrator and return an access token."""

    if not payload.password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contraseña requerida")
    identity: AdminIdentity = authenticate_admin(
        payload.username,
        payload.password,
        payload.otp_code,
    )
    token = create_access_token(identity)
    return schemas.TokenResponse(access_token=token)
