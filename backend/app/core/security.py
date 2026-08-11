"""JWT creation & verification, password hashing, at-rest secret encryption."""

import base64
import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import get_settings

_settings = get_settings()
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Secret encryption (e.g. SMTP passwords at rest) ───────────────────────

def _fernet() -> Fernet:
    # Key is derived from JWT_SECRET so no extra env var is needed. Rotating
    # JWT_SECRET invalidates previously stored encrypted secrets.
    key = base64.urlsafe_b64encode(hashlib.sha256(_settings.JWT_SECRET.encode()).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


# ── Password helpers ─────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ── JWT ──────────────────────────────────────────────────────────────────────

@dataclass
class UserClaims:
    user_id: str
    org_id: str
    role: str  # "admin" | "viewer"


def create_access_token(claims: UserClaims) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=_settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": claims.user_id,
        "org_id": claims.org_id,
        "role": claims.role,
        "exp": expire,
    }
    return jwt.encode(payload, _settings.JWT_SECRET, algorithm=_settings.JWT_ALGORITHM)


def decode_token(token: str) -> UserClaims:
    """Raises jose.JWTError on invalid / expired tokens."""
    payload = jwt.decode(token, _settings.JWT_SECRET, algorithms=[_settings.JWT_ALGORITHM])
    return UserClaims(
        user_id=payload["sub"],
        org_id=payload["org_id"],
        role=payload.get("role", "admin"),
    )
