import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("=== Employees ===")
        res = await conn.execute(text("SELECT id, full_name, employee_type, is_active FROM employees"))
        for r in res.fetchall():
            print(r)
        
        print("=== Users ===")
        res = await conn.execute(text("SELECT id, email, full_name, role_id, employee_id, is_active FROM users"))
        for r in res.fetchall():
            print(r)

        print("=== Roles ===")
        res = await conn.execute(text("SELECT id, name FROM roles"))
        for r in res.fetchall():
            print(r)

if __name__ == "__main__":
    asyncio.run(main())
