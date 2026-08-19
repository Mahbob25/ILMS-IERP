import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['APP_SETTINGS'] = 'app.config.ProductionSettings'
from app.database import async_session
from sqlalchemy import text

async def f():
    async with async_session() as s:
        r = await s.execute(text('SELECT unnest(enum_range(NULL::expensetype)::text[])'))
        print('Enum values:', [row[0] for row in r])
        r2 = await s.execute(text('SELECT type, count(*) FROM expenses GROUP BY type'))
        for row in r2:
            print(row)

asyncio.run(f())
