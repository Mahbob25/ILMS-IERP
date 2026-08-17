import logging
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Portal BFF settings — isolated from the ERP (never reuse JWT_SECRET_KEY).

    The BFF talks to the ERP internal API with ``ERP_SERVICE_KEY`` +
    ``X-Actor-Id`` (the portal user id), and to Redis for read-through cache
    and the ``ai:student`` queue. It shares the same PG host only via the ERP
    internal API — it never opens ``erp.*`` tables directly.
    """

    # ── Portal auth (isolated, non-negotiable) ─────────────
    PORTAL_JWT_SECRET: str = ""
    PORTAL_JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Service-to-service (ERP internal API) ──────────────
    ERP_INTERNAL_URL: str = "http://backend:8000"
    ERP_SERVICE_KEY: str = ""

    # ── Cache + queue (portal-owned Redis) ─────────────────
    REDIS_URL: str = ""
    CACHE_TTL_SECONDS: int = 60
    AI_STUDENT_QUEUE: str = "ai:student"

    # ── App ────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "https://portal.aldrasat.edu"
    TIMEZONE: str = "Asia/Riyadh"
    DATABASE_URL: str = ""  # optional — only if the BFF ever needs direct portal.* reads
    OTP_TTL_SECONDS: int = 300

    # ── Observability ──────────────────────────────────────
    SENTRY_DSN: str = ""

    @model_validator(mode="after")
    def validate_required_settings(self):
        if not self.PORTAL_JWT_SECRET or self.PORTAL_JWT_SECRET == "change_me_portal_jwt_secret_48_chars":
            raise ValueError(
                "PORTAL_JWT_SECRET must be set to a secure random value in .env or environment. "
                "It must be distinct from the ERP JWT_SECRET_KEY."
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
