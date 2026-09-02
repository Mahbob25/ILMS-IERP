import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from app.core.rate_limit import limiter

from app.core.config import settings
from app.core.logging import setup_logging

logger = logging.getLogger(__name__)

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("APP_ENV", "development"),
    traces_sample_rate=0.1,
    integrations=[FastApiIntegration()],

)

setup_logging()

from app.db.session import async_session_maker
from app.modules.academic.section_startup_checks import run_daily_section_checks
from app.modules.notifications.daily_job import run_daily_notification_checks
from app.modules.notifications.service import delete_expired
from app.modules.identity.router import auth_router, users_router, employees_router, permissions_router
from app.modules.academic.router import academic_router
from app.modules.lms.router import lms_router
from app.modules.lms.staff_payroll_router import router as staff_payroll_router
from app.modules.lms.idempotency_service import cleanup_expired_keys, safe_cleanup_expired_keys
from app.modules.dashboard.router import dashboard_router
from app.modules.backups.router import router as backups_router
from app.modules.reports.router import reports_router
from app.modules.notifications.router import notifications_router
from app.modules.settings.router import settings_router
from app.modules.search.router import search_router
from app.modules.bookings.router import bookings_router
from app.modules.content.router import content_router
from app.modules.contacts.router import contacts_router
from app.modules.portal_internal.router import internal_router
from app.modules.ai_management.router import ai_management_router, internal_ai_router
from app.modules.lessonforge.router import lessonforge_router
from app.middleware.idempotency import IdempotencyMiddleware
from app.middleware.real_ip import RealIPMiddleware
from app.middleware.csrf import CSRFMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with async_session_maker() as db:
            await run_daily_section_checks(db)
            await run_daily_notification_checks(db)
            await delete_expired(db)
            await safe_cleanup_expired_keys(db)
    except Exception as e:
        logger.warning("Database unavailable during startup — skipping daily checks: %s", e)
    yield

app = FastAPI(
    title="LIMS API Server",
    description="Learning Institution Management System Core API Server (Lean MVP)",
    version="1.7",
    lifespan=lifespan,
)

# Attach rate limiter to app state and exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Setup CORS middleware
# Note: we must allow credentials so that HttpOnly cookies can be forwarded from/to the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://(aldirasat|aldirasat-portal|aldirasat-erp|portal\.aldirasat)\.(vercel\.app|com|edu)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Real IP middleware — parse X-Forwarded-For to get real client IP
app.add_middleware(RealIPMiddleware)

# CSRF middleware — validate X-CSRF-Token header against csrf_token cookie for mutating requests
app.add_middleware(CSRFMiddleware)

# Idempotency middleware — caches POST/PATCH/PUT responses by Idempotency-Key header
app.add_middleware(IdempotencyMiddleware)

# Include routes under /api/v1 prefix
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(employees_router, prefix="/api/v1")
app.include_router(permissions_router, prefix="/api/v1")
app.include_router(academic_router, prefix="/api/v1")
app.include_router(lms_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(backups_router, prefix="/api/v1")
app.include_router(staff_payroll_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(bookings_router, prefix="/api/v1")
app.include_router(content_router, prefix="/api/v1")
app.include_router(contacts_router, prefix="/api/v1")
app.include_router(internal_router, prefix="/api/v1")
app.include_router(ai_management_router, prefix="/api/v1")
app.include_router(internal_ai_router, prefix="/api/v1")
app.include_router(lessonforge_router, prefix="/api/v1")

@app.get("/api/v1/health", tags=["system"])
async def health_check():
    """Foundational api status health check with database probe."""
    db_status = "disconnected"
    try:
        async with async_session_maker() as db:
            await db.execute(text("SELECT 1"))
            db_status = "connected"
    except Exception:
        logger.warning("Health check — database unreachable")

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "service": "lims-api-server",
        "version": "1.7",
        "database": db_status,
    }
