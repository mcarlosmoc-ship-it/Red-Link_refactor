"""Security utilities for encryption, authentication, and authorization."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import struct
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer


CLIENT_PASSWORD_KEY_ENV = "CLIENT_PASSWORD_KEY"
ADMIN_USERNAME_ENV = "ADMIN_USERNAME"
ADMIN_PASSWORD_HASH_ENV = "ADMIN_PASSWORD_HASH"
ADMIN_JWT_SECRET_ENV = "ADMIN_JWT_SECRET"
ADMIN_TOTP_SECRET_ENV = "ADMIN_TOTP_SECRET"
ACCESS_TOKEN_EXPIRE_MINUTES_ENV = "ACCESS_TOKEN_EXPIRE_MINUTES"

PBKDF2_DEFAULT_ITERATIONS = 390_000
TOTP_PERIOD = 30
TOTP_DIGITS = 6

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


class SecurityConfigurationError(RuntimeError):
    """Raised when mandatory security settings are missing or invalid."""


def _read_env_var(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SecurityConfigurationError(f"Environment variable '{name}' is required")
    return value


@lru_cache(maxsize=1)
def _load_encryption_key() -> bytes:
    raw_key = _read_env_var(CLIENT_PASSWORD_KEY_ENV)
    try:
        key = base64.urlsafe_b64decode(raw_key)
    except (ValueError, binascii.Error) as exc:  # pragma: no cover - defensive branch
        raise SecurityConfigurationError("Invalid base64-encoded client password key") from exc
    if len(key) < 32:
        raise SecurityConfigurationError("Client password key must be at least 256 bits long")
    return key


def _derive_encryption_keys() -> tuple[bytes, bytes]:
    seed = _load_encryption_key()
    digest = hashlib.sha512(seed).digest()
    return digest[:32], digest[32:64]


def _run_openssl(command: list[str], payload: bytes) -> bytes:
    proc = subprocess.run(
        command,
        input=payload,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:  # pragma: no cover - defensive branch
        raise SecurityConfigurationError(
            f"OpenSSL command failed: {proc.stderr.decode().strip() or proc.returncode}"
        )
    return proc.stdout


def encrypt_client_password(plaintext: str) -> str:
    """Encrypt a client password using AES-256-CBC and HMAC for integrity."""

    if plaintext is None:
        raise ValueError("plaintext must not be None")

    enc_key, mac_key = _derive_encryption_keys()
    iv = secrets.token_bytes(16)

    command = [
        "openssl",
        "enc",
        "-aes-256-cbc",
        "-K",
        enc_key.hex(),
        "-iv",
        iv.hex(),
        "-nosalt",
        "-base64",
    ]
    ciphertext_b64 = _run_openssl(command, plaintext.encode("utf-8")).strip()
    ciphertext = base64.b64decode(ciphertext_b64)

    tag = hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()
    blob = iv + ciphertext + tag
    return base64.urlsafe_b64encode(blob).decode("ascii")


def decrypt_client_password(encoded_ciphertext: str) -> str:
    """Decrypt a previously encrypted client password."""

    enc_key, mac_key = _derive_encryption_keys()
    try:
        blob = base64.urlsafe_b64decode(encoded_ciphertext)
    except (ValueError, binascii.Error) as exc:  # pragma: no cover - defensive branch
        raise SecurityConfigurationError("Stored client password value is not valid base64") from exc

    if len(blob) <= 48:
        raise SecurityConfigurationError("Stored client password value is truncated")

    iv = blob[:16]
    tag = blob[-32:]
    ciphertext = blob[16:-32]

    expected_tag = hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise SecurityConfigurationError("Stored client password failed integrity check")

    ciphertext_b64 = base64.b64encode(ciphertext)
    command = [
        "openssl",
        "enc",
        "-aes-256-cbc",
        "-d",
        "-K",
        enc_key.hex(),
        "-iv",
        iv.hex(),
        "-nosalt",
        "-base64",
    ]
    plaintext = _run_openssl(command, ciphertext_b64 + b"\n")
    return plaintext.decode("utf-8")


def generate_password_hash(password: str, *, iterations: int = PBKDF2_DEFAULT_ITERATIONS) -> str:
    """Return a PBKDF2-based password hash string."""

    if not password:
        raise ValueError("password must not be empty")
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    components = (
        str(iterations),
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(derived).decode("ascii"),
    )
    return "$".join(components)


def _split_password_hash(stored_hash: str) -> tuple[int, bytes, bytes]:
    try:
        iterations_str, salt_b64, hash_b64 = stored_hash.split("$")
        iterations = int(iterations_str)
        salt = base64.urlsafe_b64decode(salt_b64)
        digest = base64.urlsafe_b64decode(hash_b64)
    except (ValueError, binascii.Error) as exc:  # pragma: no cover - defensive branch
        raise SecurityConfigurationError("Stored admin password hash is invalid") from exc
    return iterations, salt, digest


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored PBKDF2 hash."""

    iterations, salt, digest = _split_password_hash(stored_hash)
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, digest)


def _load_admin_credentials() -> tuple[str, str]:
    username = _read_env_var(ADMIN_USERNAME_ENV)
    password_hash = _read_env_var(ADMIN_PASSWORD_HASH_ENV)
    return username, password_hash


@lru_cache(maxsize=1)
def _load_totp_secret() -> Optional[bytes]:
    secret = os.getenv(ADMIN_TOTP_SECRET_ENV)
    if not secret:
        return None
    try:
        normalized = secret.upper()
        normalized += "=" * (-len(normalized) % 8)
        return base64.b32decode(normalized, casefold=True)
    except (ValueError, binascii.Error) as exc:  # pragma: no cover - defensive branch
        raise SecurityConfigurationError("Invalid TOTP secret configured for admin user") from exc


def _totp_code(secret: bytes, counter: int, digits: int = TOTP_DIGITS) -> str:
    msg = struct.pack(">Q", counter)
    digest = hmac.new(secret, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    truncated = digest[offset : offset + 4]
    code = struct.unpack(">I", truncated)[0] & 0x7FFFFFFF
    value = code % (10 ** digits)
    return str(value).zfill(digits)


def _verify_totp(code: str) -> bool:
    secret = _load_totp_secret()
    if secret is None:
        return True
    if not code or not code.isdigit():
        return False
    counter = int(time.time() // TOTP_PERIOD)
    for offset in (-1, 0, 1):
        candidate = _totp_code(secret, counter + offset)
        if hmac.compare_digest(candidate, code.zfill(TOTP_DIGITS)):
            return True
    return False


def generate_totp_code(secret: str, timestamp: Optional[int] = None) -> str:
    """Generate the expected TOTP value for testing or provisioning."""

    try:
        normalized = secret.upper()
        normalized += "=" * (-len(normalized) % 8)
        secret_bytes = base64.b32decode(normalized, casefold=True)
    except (ValueError, binascii.Error) as exc:
        raise SecurityConfigurationError("Invalid TOTP secret") from exc
    counter = int(((timestamp or time.time()) // TOTP_PERIOD))
    return _totp_code(secret_bytes, counter)


@lru_cache(maxsize=1)
def _load_jwt_key() -> bytes:
    raw_secret = _read_env_var(ADMIN_JWT_SECRET_ENV)
    try:
        return base64.urlsafe_b64decode(raw_secret)
    except (ValueError, binascii.Error):
        return raw_secret.encode("utf-8")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _encode_jwt(payload: dict[str, Any], key: bytes) -> str:
    header = {"typ": "JWT", "alg": "HS256"}
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(key, signing_input, hashlib.sha256).digest()
    signature_b64 = _b64url_encode(signature)
    return f"{header_b64}.{payload_b64}.{signature_b64}"


def _decode_jwt(token: str, key: bytes) -> dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido") from exc

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = _b64url_decode(signature_b64)
    expected_signature = hmac.new(key, signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    payload_data = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    if payload_data.get("exp") is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    exp = int(payload_data["exp"])
    if datetime.now(timezone.utc) >= datetime.fromtimestamp(exp, tz=timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    return payload_data


def _resolve_access_token_expiry() -> timedelta:
    raw = os.getenv(ACCESS_TOKEN_EXPIRE_MINUTES_ENV)
    if not raw:
        return timedelta(minutes=30)
    try:
        minutes = int(raw)
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise SecurityConfigurationError("ACCESS_TOKEN_EXPIRE_MINUTES must be an integer") from exc
    if minutes <= 0:
        raise SecurityConfigurationError("ACCESS_TOKEN_EXPIRE_MINUTES must be positive")
    return timedelta(minutes=minutes)


def authenticate_admin(username: str, password: str, otp_code: Optional[str]) -> "AdminIdentity":
    expected_username, expected_hash = _load_admin_credentials()
    if username.strip().lower() != expected_username.strip().lower():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if not verify_password(password, expected_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if _load_totp_secret() is not None:
        if not otp_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Se requiere código 2FA")
        if not _verify_totp(otp_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código 2FA inválido")

    return AdminIdentity(username=expected_username)


def create_access_token(identity: "AdminIdentity") -> str:
    key = _load_jwt_key()
    expiry = datetime.now(timezone.utc) + _resolve_access_token_expiry()
    payload: dict[str, Any] = {
        "sub": identity.username,
        "exp": int(expiry.timestamp()),
    }
    return _encode_jwt(payload, key)


@dataclass
class AdminIdentity:
    """Represents an authenticated administrator."""

    username: str


def get_current_admin(token: str = Depends(oauth2_scheme)) -> AdminIdentity:
    key = _load_jwt_key()
    payload = _decode_jwt(token, key)
    username = payload.get("sub")
    if not isinstance(username, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    expected_username, _ = _load_admin_credentials()
    if username.strip().lower() != expected_username.strip().lower():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    return AdminIdentity(username=expected_username)


def require_admin(identity: AdminIdentity = Depends(get_current_admin)) -> AdminIdentity:
    """FastAPI dependency that ensures the request is authenticated as an admin."""

    return identity

