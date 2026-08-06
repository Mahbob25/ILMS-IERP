from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = ""
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENVIRONMENT: str = "production"
    CORS_ORIGINS: str = "https://aldrasat.edu"
    TEMPLATES_DIR: str = ""
    TIMEZONE: str = "Asia/Riyadh"
    HTTP_PROXY: str = ""
    HTTPS_PROXY: str = ""
    NO_PROXY: str = "localhost,127.0.0.1,.aldrasat.edu"
    NOTIFICATION_RETENTION_DAYS: int = 90
    BACKUP_DIR: str = "/app/backups"

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
            candidate = parent / "cert&recept"
            if candidate.is_dir():
                return candidate
        raise FileNotFoundError("cert&recept template directory not found")

    @property
    def sync_database_url(self) -> str:
        url = self.DATABASE_URL
        if "postgresql+asyncpg" in url:
            return url.replace("postgresql+asyncpg", "postgresql+psycopg")
        elif "postgresql://" in url:
            return url.replace("postgresql://", "postgresql+psycopg://")
        return url

settings = Settings()
