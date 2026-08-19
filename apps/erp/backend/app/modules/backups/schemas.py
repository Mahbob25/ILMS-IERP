from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class BackupItem(BaseModel):
    id: str
    filename: str
    kind: Literal["database", "uploads"]
    size_bytes: int
    size_display: str
    created_at: datetime

    class Config:
        from_attributes = True


class BackupsListResponse(BaseModel):
    items: list[BackupItem]
    total: int
    last_backup: Optional[str] = None
    total_size_bytes: int
    disk_free_gb: float


class DeleteResponse(BaseModel):
    deleted: bool
    restorable_until: Optional[str] = None
