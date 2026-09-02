from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    REDIS_URL: str = "redis://redis:6379/0"
    # Provider selection: "gemini" (default when a GEMINI_API_KEY is set) or "openai".
    # LessonForge output is HTML from a text LLM — no image model is involved.
    LLM_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    AI_TEACHER_QUEUE: str = "ai:teacher"
    GROUP_NAME: str = "ai-workers"
    RESULT_TTL: int = 3600

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
