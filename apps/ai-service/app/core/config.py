from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    REDIS_URL: str = "redis://redis:6379/0"
    AI_TEACHER_QUEUE: str = "ai:teacher"
    GROUP_NAME: str = "ai-workers"
    RESULT_TTL: int = 3600

    # ── LiteLLM gateway ─────────────────────────────────────────────
    # Every provider speaks one OpenAI-compatible API through the proxy.
    LITELLM_URL: str = "http://litellm:4000/v1"
    LITELLM_MASTER_KEY: str = "sk-litellm-local"
    # Redis key the ERP publishes the runtime ai_config to (persistent, no TTL).
    CONFIG_REDIS_KEY: str = "ai:config"
    # Worker fallback source (ERP internal API) when Redis is empty.
    ERP_INTERNAL_URL: str = "http://backend:8000"
    ERP_SERVICE_KEY: str = ""

    # ── Last-resort env fallback for local dev only (no Redis / no ERP) ──
    # Never the primary path — the ERP ai_config row drives production.
    LLM_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    # Optional image generation (Phase 2). Images share the text model's key;
    # empty IMAGE_PROVIDER/IMAGE_MODEL disables dynamic sticker generation.
    IMAGE_PROVIDER: str = ""
    IMAGE_MODEL: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
