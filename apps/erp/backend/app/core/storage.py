import os
import uuid
import shutil
from pathlib import Path
from fastapi import UploadFile

UPLOAD_DIR = Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))) / "uploads"

MIN_DISK_SPACE_MB = 100

# Profile photos. The declared content type is only a first filter — the magic
# bytes have to agree, so a renamed script can never land as ".jpg".
IMAGE_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

_CHUNK_BYTES = 64 * 1024


def _detect_image_type(header: bytes) -> str | None:
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "image/webp"
    return None


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


async def save_image(
    file: UploadFile,
    subdir: str = "avatars",
    max_bytes: int = MAX_IMAGE_BYTES,
) -> str:
    """Validate and store an uploaded image; returns its path relative to UPLOAD_DIR.

    Reading is chunked so an oversized upload is rejected without buffering the
    whole body in memory. The client-supplied content type is checked first, then
    the actual bytes — a mismatch is refused rather than trusted.
    """
    declared = (file.content_type or "").split(";")[0].strip().lower()
    if declared not in IMAGE_EXTENSIONS:
        raise ValueError("Unsupported image type — use JPEG, PNG or WebP")

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise ValueError(f"Image too large — {max_bytes // (1024 * 1024)}MB maximum")
        chunks.append(chunk)

    content = b"".join(chunks)
    detected = _detect_image_type(content[:12])
    if detected is None:
        raise ValueError("File is not a valid JPEG, PNG or WebP image")
    if detected != declared:
        raise ValueError("Image content does not match its declared type")

    check_disk_space(UPLOAD_DIR)
    filename = f"{uuid.uuid4().hex}{IMAGE_EXTENSIONS[detected]}"
    target_dir = ensure_upload_dir(subdir)
    (target_dir / filename).write_bytes(content)
    # Always POSIX-style: the stored value is concatenated into a public URL.
    return (Path(subdir) / filename).as_posix() if subdir else filename


def delete_file(relative_path: str) -> bool:
    full_path = UPLOAD_DIR / relative_path
    if full_path.exists():
        full_path.unlink()
        return True
    return False


def get_file_path(relative_path: str) -> Path:
    return UPLOAD_DIR / relative_path
