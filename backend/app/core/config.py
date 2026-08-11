import os
from functools import lru_cache

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_DEFAULT_DB = os.path.join(_BACKEND_DIR, "cybersafe.db")


class Settings:
    # Self-contained default: a local SQLite file. Override with a
    # postgresql+asyncpg:// URL if you ever want to bring the RLS/Postgres
    # stack back (see backend/migrations/001_rls_policies.sql).
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{_DEFAULT_DB}",
    )
    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    JWT_SECRET: str = os.environ.get("JWT_SECRET", "change-me-in-production-use-32-chars-min")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

    # Public base URL of this API service (used for tracking link/pixel injection)
    API_BASE_URL: str = os.environ.get("API_BASE_URL", "http://localhost:8000")
    REVEAL_PAGE_URL: str = os.environ.get("REVEAL_PAGE_URL", "http://localhost:5173/awareness-reveal")

    CORS_ORIGINS: list[str] = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")

    # Simulated send: when true, EmailProvider records messages to the local
    # outbox table instead of a real SMTP/API provider.
    SIMULATE_EMAILS: bool = os.environ.get("SIMULATE_EMAILS", "1") == "1"

    # Real delivery (used when SIMULATE_EMAILS=0). Point SMTP_HOST at your
    # transactional provider's relay (e.g. Postmark, SendGrid, or SES SMTP).
    SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.environ.get("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
    # Who the campaign emails appear to come from. Should be a verified
    # sending address on the SMTP account's domain (SPF/DKIM/DMARC).
    SMTP_FROM_NAME: str = os.environ.get("SMTP_FROM_NAME", "")
    SMTP_FROM_EMAIL: str = os.environ.get("SMTP_FROM_EMAIL", "")
    # Implicit TLS (SMTPS, typically port 465). For plain 587 STARTTLS leave
    # this off — STARTTLS is attempted automatically when the server offers it.
    SMTP_USE_TLS: bool = os.environ.get("SMTP_USE_TLS", "0") == "1"
    SMTP_TIMEOUT: int = int(os.environ.get("SMTP_TIMEOUT", "30"))

    # Realistic sending: campaigns are paced so that no single receiving
    # domain gets flooded. SEND_RATE_PER_MINUTE = max messages per minute per
    # recipient domain; SEND_JITTER_MAX_SECONDS adds random delay between sends.
    SEND_RATE_PER_MINUTE: int = int(os.environ.get("SEND_RATE_PER_MINUTE", "120"))
    SEND_JITTER_MAX_SECONDS: float = float(os.environ.get("SEND_JITTER_MAX_SECONDS", "1"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
