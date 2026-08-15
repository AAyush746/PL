import os

import dotenv
from functools import lru_cache

# Load backend/.env (gitignored) if present, so local config doesn't need to be
# passed as process environment variables. Explicit env vars still win.
dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

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

    # Public base URL of this API service (used for tracking pixel + the
    # awareness-reveal redirect target).
    API_BASE_URL: str = os.environ.get("API_BASE_URL", "http://localhost:8000")
    REVEAL_PAGE_URL: str = os.environ.get("REVEAL_PAGE_URL", "http://localhost:5173/awareness-reveal")

    # Branded click domain. The link an employee actually *sees* and clicks
    # should sit on the same domain as the visible From address (e.g.
    # https://links.acme.com instead of https://cybersafe-api.onrender.com).
    # This is the single biggest believability + deliverability win after
    # SPF/DKIM/DMARC: a click URL whose host matches the From domain looks
    # legitimate to both the reader and heuristic filters. Point this at a
    # CNAME (HTTPS) of the API host. Defaults to API_BASE_URL.
    TRACKING_LINK_BASE: str = os.environ.get("TRACKING_LINK_BASE", "")

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

    # DKIM signing for outbound campaign mail. Signing is what tells the
    # receiving server "this message really came from this domain" — without
    # it, even perfectly-formed mail lands in spam. Provide a private key
    # (PKCS#8 or RSA PEM) and the selector/domain that the public DNS TXT
    # record lives under. Per-org SendingProfiles can override these.
    # Generate a keypair:
    #   openssl genrsa -out dkim_private.pem 2048
    #   openssl rsa -in dkim_private.pem -pubout -out dkim_public.pem
    # then publish the public key at <DKIM_SELECTOR>._domainkey.<DKIM_DOMAIN>.
    DKIM_PRIVATE_KEY: str = os.environ.get("DKIM_PRIVATE_KEY", "")
    DKIM_SELECTOR: str = os.environ.get("DKIM_SELECTOR", "cybersafe")
    DKIM_DOMAIN: str = os.environ.get("DKIM_DOMAIN", "")

    # Realistic sending: campaigns are paced so that no single receiving
    # domain gets flooded. SEND_RATE_PER_MINUTE = max messages per minute per
    # recipient domain; SEND_JITTER_MAX_SECONDS adds random delay between sends.
    SEND_RATE_PER_MINUTE: int = int(os.environ.get("SEND_RATE_PER_MINUTE", "120"))
    SEND_JITTER_MAX_SECONDS: float = float(os.environ.get("SEND_JITTER_MAX_SECONDS", "1"))

    # eSewa ePay (Nepal) — UAT defaults. Override the secret + product code and
    # point PAYMENT_URL / STATUS_URL at the production hosts for a live rollout:
    #   payment: https://epay.esewa.com.np/api/epay/main/v2/form
    #   status : https://esewa.com.np/api/epay/transaction/status/
    # NB: the official docs print the UAT secret with a trailing ``(``
    # ("8gBm/:&EnhH.1/q(") — that trailing paren is a docs typo. The secret the
    # live UAT server accepts is "8gBm/:&EnhH.1/q".
    ESEWA_PRODUCT_CODE: str = os.environ.get("ESEWA_PRODUCT_CODE", "EPAYTEST")
    ESEWA_SECRET_KEY: str = os.environ.get("ESEWA_SECRET_KEY", "8gBm/:&EnhH.1/q")
    ESEWA_PAYMENT_URL: str = os.environ.get(
        "ESEWA_PAYMENT_URL", "https://rc-epay.esewa.com.np/api/epay/main/v2/form"
    )
    ESEWA_STATUS_URL: str = os.environ.get(
        "ESEWA_STATUS_URL", "https://rc.esewa.com.np/api/epay/transaction/status/"
    )

    # Base URL of the SPA (redirect target after eSewa returns to our callback).
    FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:5173")


@lru_cache
def get_settings() -> Settings:
    return Settings()
