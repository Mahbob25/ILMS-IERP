import uuid
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.identity.models import AuditLog

async def create_audit_log(
    db: AsyncSession,
    action: str,
    user_id: Optional[uuid.UUID] = None,
    payload: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Helper to create and write a user action entry to audit_logs."""
    audit_entry = AuditLog(
        user_id=user_id,
        action=action,
        payload=payload,
        ip_address=ip_address
    )
    db.add(audit_entry)
    # We commit in session generator or dependencies, but we make sure it is flushed/saved.
    await db.flush()
    return audit_entry
