import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("=== Expenses ===")
        res = await conn.execute(text("SELECT id, amount, recipient_name, recipient_id, date, type FROM expenses"))
        for r in res.fetchall():
            print(r)

if __name__ == "__main__":
    asyncio.run(main())
