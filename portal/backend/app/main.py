import logging

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.logging import setup_logging
from app.core.rate_limit import limiter
from app.middleware.csrf import CSRFMiddleware
from app.middleware.real_ip import RealIPMiddleware
from app.modules.ai_proxy.router import ai_router
from app.modules.auth.router import auth_router
from app.modules.health.router import health_router
from app.modules.portal.router import portal_router

setup_logging()

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        integrations=[FastApiIntegration()],
    )

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Al-Drasat Student & Parent Portal API",
    description="External portal BFF — isolated auth, cached reads proxied to ERP, HIGH-priority AI queue.",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RealIPMiddleware)
app.add_middleware(CSRFMiddleware)

app.include_router(auth_router, prefix="/api")
app.include_router(portal_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(health_router, prefix="/api")
