import asyncio
import logging
import os
import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import check_disk_space
from app.core.timezone import utcnow
from app.modules.identity.models import User
from app.modules.identity.service import create_audit_log
from app.modules.backups.schemas import BackupItem, BackupsListResponse, DeleteResponse

logger = logging.getLogger(__name__)

BACKUP_DIR = Path(settings.BACKUP_DIR)
TRASH_DIR = BACKUP_DIR / ".trash"
MIN_DISK_MB = 500
RESTORE_WINDOW_MINUTES = 10
TRASH_PURGE_MINUTES = 10

_DB_RE = re.compile(r"^db-\d{8}-\d{6}\.sql$")
_UPLOADS_RE = re.compile(r"^uploads-\d{8}-\d{6}\.tar\.gz$")
_VALID_PATTERNS = (_DB_RE, _UPLOADS_RE)
_GLOBS = ("db-*.sql", "uploads-*.tar.gz")

_create_lock = asyncio.Lock()


def ensure_backup_dir() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    TRASH_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


def _validate_backup_id(backup_id: str) -> None:
    if not any(rx.match(backup_id) for rx in _VALID_PATTERNS):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Backup not found")


def _safe_path(backup_id: str, *, trash: bool = False) -> Path:
    _validate_backup_id(backup_id)
    base = TRASH_DIR if trash else BACKUP_DIR
    candidate = (base / backup_id).resolve()
    try:
        candidate.relative_to(base.resolve())
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Backup not found")
    return candidate


def _human_size(size_bytes: int) -> str:
    size = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{int(size)} B" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def _build_item(path: Path) -> BackupItem:
    stat = path.stat()
    name = path.name
    kind = "uploads" if name.startswith("uploads-") else "database"
    return BackupItem(
        id=name,
        filename=name,
        kind=kind,
        size_bytes=stat.st_size,
        size_display=_human_size(stat.st_size),
        created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
    )


def _purge_trash() -> None:
    if not TRASH_DIR.exists():
        return
    cutoff = (utcnow() - timedelta(minutes=TRASH_PURGE_MINUTES)).timestamp()
    for p in TRASH_DIR.iterdir():
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except OSError:
            continue


def get_download_path(backup_id: str) -> Path:
    path = _safe_path(backup_id)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Backup not found")
    return path


async def list_backups() -> BackupsListResponse:
    ensure_backup_dir()
    _purge_trash()
    items: list[BackupItem] = []
    for pattern in _GLOBS:
        for p in BACKUP_DIR.glob(pattern):
            try:
                items.append(_build_item(p))
            except OSError:
                continue
    items.sort(key=lambda i: i.created_at, reverse=True)
    total_size = sum(i.size_bytes for i in items)
    last_backup = items[0].created_at.isoformat() if items else None
    usage = shutil.disk_usage(BACKUP_DIR)
    free_gb = round(usage.free / (1024 ** 3), 1)
    return BackupsListResponse(
        items=items,
        total=len(items),
        last_backup=last_backup,
        total_size_bytes=total_size,
        disk_free_gb=free_gb,
    )


async def create_backup(db: AsyncSession, current_user: User) -> BackupItem:
    ensure_backup_dir()
    check_disk_space(BACKUP_DIR, required_mb=MIN_DISK_MB)

    url = make_url(settings.DATABASE_URL)
    host = url.host or "database"
    port = url.port or 5432
    db_user = url.username
    db_password = url.password or ""
    db_name = url.database
    if not db_user or not db_name:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DATABASE_URL must include user and database",
        )

    stamp = utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"db-{stamp}.sql"
    target = BACKUP_DIR / filename
    env = {**os.environ, "PGPASSWORD": db_password}

    async with _create_lock:
        with open(target, "wb") as f:
            proc = await asyncio.create_subprocess_exec(
                "pg_dump",
                "-h", host,
                "-p", str(port),
                "-U", db_user,
                "-d", db_name,
                stdout=f,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            _, stderr = await proc.communicate()
        if proc.returncode != 0:
            try:
                target.unlink()
            except OSError:
                pass
            msg = stderr.decode(errors="replace").strip()[:500] if stderr else "unknown error"
            logger.error("pg_dump failed for %s: %s", filename, msg)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Backup creation failed: {msg}",
            )
        item = _build_item(target)
        await create_audit_log(
            db=db,
            action="DB_BACKUP_CREATED",
            user_id=current_user.id,
            payload={"filename": filename, "size_bytes": item.size_bytes},
        )
        return item


async def soft_delete(db: AsyncSession, backup_id: str, current_user: User) -> DeleteResponse:
    ensure_backup_dir()
    src = _safe_path(backup_id)
    if not src.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Backup not found")
    dest = TRASH_DIR / backup_id
    if dest.exists():
        dest.unlink()
    shutil.move(str(src), str(dest))
    restorable = utcnow() + timedelta(minutes=RESTORE_WINDOW_MINUTES)
    await create_audit_log(
        db=db,
        action="DB_BACKUP_DELETED",
        user_id=current_user.id,
        payload={"filename": backup_id},
    )
    return DeleteResponse(deleted=True, restorable_until=restorable.isoformat())


async def undo_delete(db: AsyncSession, backup_id: str, current_user: User) -> BackupItem:
    ensure_backup_dir()
    trashed = _safe_path(backup_id, trash=True)
    if not trashed.exists():
        raise HTTPException(
            status.HTTP_410_GONE,
            detail="Undo window expired or backup no longer restorable",
        )
    dest = BACKUP_DIR / backup_id
    if dest.exists():
        dest.unlink()
    shutil.move(str(trashed), str(dest))
    item = _build_item(dest)
    await create_audit_log(
        db=db,
        action="DB_BACKUP_RESTORED",
        user_id=current_user.id,
        payload={"filename": backup_id},
    )
    return item


async def get_last_backup_iso() -> Optional[str]:
    ensure_backup_dir()
    newest: Optional[datetime] = None
    for pattern in _GLOBS:
        for p in BACKUP_DIR.glob(pattern):
            try:
                mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
            except OSError:
                continue
            if newest is None or mtime > newest:
                newest = mtime
    return newest.isoformat() if newest else None
