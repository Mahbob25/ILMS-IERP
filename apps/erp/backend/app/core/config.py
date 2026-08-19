import logging
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    DATABASE_URL: str = ""
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENVIRONMENT: str = "production"
    CORS_ORIGINS: str = "https://aldirasat.com,https://www.aldirasat.com,https://portal.aldirasat.com,https://aldirasat.vercel.app,https://aldirasat-erp.vercel.app,https://aldirasat-portal.vercel.app"

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS is a comma-separated string; split it into a real list.

        Starlette's CORSMiddleware matches each entry exactly, so passing the
        raw comma-separated string as a single element allows no origin at all
        (every cross-origin preflight gets a 400 "Disallowed CORS origin").
        """
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
    TEMPLATES_DIR: str = ""
    TIMEZONE: str = "Asia/Riyadh"
    HTTP_PROXY: str = ""
    HTTPS_PROXY: str = ""
    NO_PROXY: str = "localhost,127.0.0.1,.aldirasat.com"
    NOTIFICATION_RETENTION_DAYS: int = 90
    BACKUP_DIR: str = "/app/backups"

    # ── Portal (Phase 0) ──────────────────────────────────────────
    # Doc-only in ERP: ERP never signs portal JWTs (portal BFF owns them).
    PORTAL_JWT_SECRET: str = ""
    # Service-to-service key for the internal portal API (random 32+ chars).
    ERP_SERVICE_KEY: str = ""
    # Portal-owned; ERP never connects at runtime (no-op when empty).
    REDIS_URL: str = ""
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    PORTAL_JWT_ALGORITHM: str = "HS256"
    # Shared SSO ticket secret — MUST equal the portal BFF's PORTAL_SSO_SECRET.
    # Used ONLY to sign one-time login tickets (aud=portal, 60s TTL). Never
    # used to sign staff JWTs, and distinct from PORTAL_JWT_SECRET.
    PORTAL_SSO_SECRET: str = ""
    # Where the ERP frontend sends students/parents after login.
    PORTAL_FRONTEND_URL: str = "https://aldirasat-portal.vercel.app"
    # Where staff land after login (browser form POST path).
    ERP_FRONTEND_URL: str = "https://aldirasat-erp.vercel.app"

    @model_validator(mode="after")
    def validate_required_settings(self):
        if not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL must be set in .env or environment. "
                "Example: postgresql+asyncpg://user:pass@host:5432/db"
            )
        if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY == "super_secret_key_lims_institute_2026_change_in_production":
            raise ValueError(
                "JWT_SECRET_KEY must be set to a secure random value in .env or environment. "
                "Do NOT use the example default in production."
            )
        # ERP must stay bootable without portal env — warn, don't fail.
        if self.ENVIRONMENT == "production" and not self.ERP_SERVICE_KEY:
            logger.warning(
                "ERP_SERVICE_KEY is empty in production: /api/v1/internal/portal/* "
                "will return 500 until it is configured."
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def templates_dir(self) -> Path:
        if self.TEMPLATES_DIR:
            return Path(self.TEMPLATES_DIR)
        for parent in Path(__file__).resolve().parents:
            candidate = parent / "templates"
            if candidate.is_dir():
                return candidate
        raise FileNotFoundError("templates directory not found")

    @property
    def sync_database_url(self) -> str:
        url = self.DATABASE_URL
        if "postgresql+asyncpg" in url:
            return url.replace("postgresql+asyncpg", "postgresql+psycopg")
        elif "postgresql://" in url:
            return url.replace("postgresql://", "postgresql+psycopg://")
        return url

settings = Settings()
