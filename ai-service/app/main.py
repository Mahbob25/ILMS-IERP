import logging

from fastapi import FastAPI

from app.core.logging import setup_logging

setup_logging()

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Al-Drasat AI Service",
    description="Unified stateless AI plane — ai:ingestion (LOW) + ai:student (HIGH) queues.",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-service"}


@app.post("/internal/enqueue")
async def internal_enqueue():
    """Phase 3: ERP enqueues ai:ingestion jobs here (or direct Redis)."""
    return {"detail": "AI ingestion queue wiring ships in Phase 3", "status": 501}
