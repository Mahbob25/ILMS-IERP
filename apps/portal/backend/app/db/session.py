from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

# Same PG host as the ERP — but the BFF only ever reads portal.* tables
# directly (portal.users, portal.refresh_tokens) and reaches erp.* via the
# ERP internal API. DATABASE_URL is optional: when empty (local dev without
# portal DB access), auth still works against mocked/direct state in tests.
if settings.DATABASE_URL:
    engine = create_async_engine(
        settings.DATABASE_URL,
        connect_args={"server_settings": {"timezone": settings.TIMEZONE}},
        echo=False,
        future=True,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_timeout=30,
        pool_recycle=1800,
    )
    async_session_maker = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
else:
    # No DB configured — raise a clear error if anything tries to use it.
    class _NoDb:
        async def __aenter__(self):
            raise RuntimeError("DATABASE_URL not configured for portal backend")

        async def __aexit__(self, *exc):
            return None

    async_session_maker = _NoDb  # type: ignore[assignment]


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
