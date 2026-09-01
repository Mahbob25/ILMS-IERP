import os
import uuid
import shutil
from pathlib import Path
from typing import Optional
from fastapi import UploadFile

UPLOAD_DIR = Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))) / "uploads"

MIN_DISK_SPACE_MB = 100


def check_disk_space(path: str | Path, required_mb: int = MIN_DISK_SPACE_MB) -> None:
    usage = shutil.disk_usage(path)
    available_mb = usage.free / (1024 * 1024)
    if available_mb < required_mb:
        raise IOError(
            f"Insufficient disk space: {available_mb:.0f}MB available, {required_mb}MB required"
        )


def ensure_upload_dir(subdir: str = "") -> Path:
    target = UPLOAD_DIR / subdir
    target.mkdir(parents=True, exist_ok=True)
    return target


async def save_upload(file: UploadFile, subdir: str = "") -> str:
    check_disk_space(UPLOAD_DIR)
    ext = os.path.splitext(file.filename or "file")[1] if file.filename else ""
    filename = f"{uuid.uuid4().hex}{ext}"
    target_dir = ensure_upload_dir(subdir)
    file_path = target_dir / filename
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    rel_path = str(Path(subdir) / filename) if subdir else filename
    return rel_path


def save_text(content: str, subdir: str = "", filename: Optional[str] = None) -> str:
    """Write a text blob (e.g. generated HTML) under UPLOAD_DIR and return its
    relative path — the same pattern as ``save_upload`` but for strings."""
    check_disk_space(UPLOAD_DIR)
    name = filename or f"{uuid.uuid4().hex}.html"
    target_dir = ensure_upload_dir(subdir)
    file_path = target_dir / name
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return str(Path(subdir) / name) if subdir else name


def delete_file(relative_path: str) -> bool:
    full_path = UPLOAD_DIR / relative_path
    if full_path.exists():
        full_path.unlink()
        return True
    return False


def get_file_path(relative_path: str) -> Path:
    return UPLOAD_DIR / relative_path
