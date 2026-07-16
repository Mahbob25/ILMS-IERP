import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, delete
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.lms.models import IdempotencyKey

logger = logging.getLogger(__name__)


async def check_idempotency_key(
    db: AsyncSession,
    idempotency_key: str,
    endpoint: str,
) -> IdempotencyKey | None:
    stmt = select(IdempotencyKey).where(
        IdempotencyKey.idempotency_key == idempotency_key,
        IdempotencyKey.endpoint == endpoint,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def store_idempotency_key(
    db: AsyncSession,
    idempotency_key: str,
    endpoint: str,
    response_status: int,
    response_body: bytes,
) -> IdempotencyKey:
    record = IdempotencyKey(
        idempotency_key=idempotency_key,
        endpoint=endpoint,
        response_status=response_status,
        response_body=json.loads(response_body),
    )
    db.add(record)
    await db.commit()
    return record


async def cleanup_expired_keys(db: AsyncSession) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    stmt = delete(IdempotencyKey).where(IdempotencyKey.created_at < cutoff)
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount


async def safe_cleanup_expired_keys(db: AsyncSession) -> int:
    try:
        return await cleanup_expired_keys(db)
    except ProgrammingError as e:
        if "does not exist" in str(e):
            logger.warning("idempotency_keys table does not exist yet — skipping cleanup (run alembic upgrade head)")
            await db.rollback()
            return 0
        raise
