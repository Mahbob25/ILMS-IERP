import os
import re
from pathlib import Path
from typing import Optional

from app.core.config import settings


class TemplateEngine:
    def __init__(self, templates_dir: Optional[Path] = None):
        self.templates_dir = templates_dir or settings.templates_dir

    def _load(self, filename: str) -> str:
        path = self.templates_dir / filename
        if not path.exists():
            raise FileNotFoundError(f"Template not found: {path}")
        return path.read_text(encoding="utf-8")

    def _substitute(self, template: str, variables: dict) -> str:
        def replacer(match):
            key = match.group(1).strip()
            return str(variables.get(key, match.group(0)))
        return re.sub(r"\{\{(.+?)\}\}", replacer, template)

    def render_certificate(self, variables: dict) -> str:
        template = self._load("certificate-template.html")
        return self._substitute(template, variables)

    def render_receipt(self, variables: dict) -> str:
        template = self._load("receipt-template.html")
        return self._substitute(template, variables)

    def render_voucher(self, variables: dict) -> str:
        template = self._load("voucher-template.html")
        return self._substitute(template, variables)


template_engine = TemplateEngine()
