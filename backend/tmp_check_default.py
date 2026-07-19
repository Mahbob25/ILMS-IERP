import asyncio
from app.database import async_session
from sqlalchemy import text

async def check():
    async with async_session() as s:
        r = await s.execute(text("SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'type'"))
        for row in r:
            print('default:', row)
        r2 = await s.execute(text("SELECT conname, contype, pg_get_constraintdef(conid) FROM pg_constraint WHERE conrelid = 'expenses'::regclass"))
        for row in r2:
            print('constraint:', row)

asyncio.run(check())
