import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("=== Payments ===")
        res = await conn.execute(text("SELECT id, enrollment_id, amount, receipt_number FROM payments"))
        for r in res.fetchall():
            print(r)
        
        print("=== Enrollments & Sections ===")
        res = await conn.execute(text("""
            SELECT e.id, e.student_id, e.section_id, cs.teacher_percentage, cs.teacher_id, cs.status
            FROM enrollments e
            JOIN course_sections cs ON e.section_id = cs.id
        """))
        for r in res.fetchall():
            print(r)

        print("=== Teacher Wallets ===")
        res = await conn.execute(text("SELECT id, teacher_id, balance FROM teacher_wallets"))
        for r in res.fetchall():
            print(r)

if __name__ == "__main__":
    asyncio.run(main())
