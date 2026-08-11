import asyncio
from app.database import app_engine
from app.models import Base

async def init_models():
    async with app_engine.begin() as conn:
        """Create all tables defined in models synchronously inside an async engine."""
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created successfully!")

if __name__ == "__main__":
    asyncio.run(init_models())
