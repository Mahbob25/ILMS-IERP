import os
import uuid
import shutil
from pathlib import Path
from fastapi import UploadFile

UPLOAD_DIR = Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))) / "uploads"


def ensure_upload_dir(subdir: str = "") -> Path:
    target = UPLOAD_DIR / subdir
    target.mkdir(parents=True, exist_ok=True)
    return target


async def save_upload(file: UploadFile, subdir: str = "") -> str:
    ext = os.path.splitext(file.filename or "file")[1] if file.filename else ""
    filename = f"{uuid.uuid4().hex}{ext}"
    target_dir = ensure_upload_dir(subdir)
    file_path = target_dir / filename
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    rel_path = str(Path(subdir) / filename) if subdir else filename
    return rel_path


def delete_file(relative_path: str) -> bool:
    full_path = UPLOAD_DIR / relative_path
    if full_path.exists():
        full_path.unlink()
        return True
    return False


def get_file_path(relative_path: str) -> Path:
    return UPLOAD_DIR / relative_path
