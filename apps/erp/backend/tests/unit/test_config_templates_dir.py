from pathlib import Path

from app.core.config import Settings

DB_URL = "postgresql+asyncpg://user:pass@host:5432/db"
SECRET = "test_secret_key"


def make_settings(monkeypatch, templates_dir=""):
    monkeypatch.setenv("TEMPLATES_DIR", templates_dir)
    return Settings(DATABASE_URL=DB_URL, JWT_SECRET_KEY=SECRET)


def test_templates_dir_env_override(monkeypatch):
    settings = make_settings(monkeypatch, "/custom/templates")
    assert settings.templates_dir == Path("/custom/templates")


def test_templates_dir_default_resolves_to_repo_dir(monkeypatch):
    settings = make_settings(monkeypatch)
    resolved = settings.templates_dir
    assert resolved.name == "templates"
    assert resolved.is_dir()


def test_templates_dir_contains_report_template(monkeypatch):
    settings = make_settings(monkeypatch)
    template = settings.templates_dir / "report-template.html"
    assert template.exists()
