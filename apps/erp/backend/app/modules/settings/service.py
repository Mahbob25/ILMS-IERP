import uuid
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.modules.settings.models import SystemSetting

DEFAULTS = {
    "institute_profile": {"name": "Al-Drasat ERP", "address": None, "phone": None, "logo_path": "/logo.jpeg"},
    "defaults": {"timezone": "Asia/Riyadh", "default_teacher_percentage": None, "backup_retention_days": None},
}

async def get_system_settings(db: AsyncSession) -> Dict[str, Any]:
    result = await db.execute(select(SystemSetting))
    rows = result.scalars().all()
    out = dict(DEFAULTS)
    for r in rows:
        out[r.key] = r.value
    return out

async def update_system_settings(db: AsyncSession, payload: Dict[str, Any], actor_id: uuid.UUID) -> Dict[str, Any]:
    for key, value in payload.items():
        if value is None:
            continue
        row = await db.get(SystemSetting, key)
        if row:
            row.value = value
            row.updated_by = actor_id
        else:
            db.add(SystemSetting(key=key, value=value, updated_by=actor_id))
    await db.flush()
    return await get_system_settings(db)
