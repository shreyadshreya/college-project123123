import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import Header, HTTPException

# Local-development defaults. Set these environment variables before starting
# the backend in any shared or production environment.
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
TOKEN_TTL_SECONDS = int(os.getenv("ADMIN_TOKEN_TTL_SECONDS", "28800"))
TOKEN_SECRET = os.getenv("ADMIN_TOKEN_SECRET") or (
    f"{ADMIN_USERNAME}:{ADMIN_PASSWORD}:ai-exam-admin"
)


def _matches(value: str, expected: str) -> bool:
    return secrets.compare_digest((value or "").encode("utf-8"), expected.encode("utf-8"))


def authenticate_admin(username: str, password: str) -> bool:
    """Check the configured admin credentials without leaking which part failed."""
    return _matches(username, ADMIN_USERNAME) and _matches(password, ADMIN_PASSWORD)


def _encode(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode(value: str) -> dict:
    padding = "=" * (-len(value) % 4)
    raw = base64.urlsafe_b64decode(value + padding)
    return json.loads(raw.decode("utf-8"))


def _sign(body: str) -> str:
    return hmac.new(
        TOKEN_SECRET.encode("utf-8"),
        body.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def create_admin_token() -> str:
    now = int(time.time())
    body = _encode({"sub": ADMIN_USERNAME, "role": "admin", "iat": now, "exp": now + TOKEN_TTL_SECONDS})
    return f"{body}.{_sign(body)}"


def verify_admin_token(token: str) -> bool:
    try:
        body, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _sign(body)):
            return False
        payload = _decode(body)
        return (
            payload.get("role") == "admin"
            and payload.get("sub") == ADMIN_USERNAME
            and int(payload.get("exp", 0)) > int(time.time())
        )
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return False


async def require_admin(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency that only allows a valid admin bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Admin authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1].strip()
    if not verify_admin_token(token):
        raise HTTPException(
            status_code=401,
            detail="Admin authentication required or session expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return ADMIN_USERNAME
