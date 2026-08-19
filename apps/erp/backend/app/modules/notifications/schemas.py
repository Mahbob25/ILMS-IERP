import uuid
from datetime import datetime
from typing import Optional, Dict, Any

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: uuid.UUID
    type: str
    title_key: str
    body_key: Optional[str] = None
    params: Dict[str, Any] = {}
    target_href: Optional[str] = None
    priority: str = "normal"
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    per_page: int
    pages: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class MarkReadRequest(BaseModel):
    ids: Optional[list[uuid.UUID]] = None
