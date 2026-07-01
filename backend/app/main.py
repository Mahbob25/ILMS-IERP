from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.modules.identity.router import auth_router, users_router, employees_router, permissions_router
from app.modules.academic.router import academic_router
from app.modules.lms.router import lms_router
from app.modules.dashboard.router import dashboard_router

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="LIMS API Server",
    description="Learning Institution Management System Core API Server (Lean MVP)",
    version="1.7"
)

# Attach rate limiter to app state and exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Setup CORS middleware
# Note: we must allow credentials so that HttpOnly cookies can be forwarded from/to the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes under /api/v1 prefix
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(employees_router, prefix="/api/v1")
app.include_router(permissions_router, prefix="/api/v1")
app.include_router(academic_router, prefix="/api/v1")
app.include_router(lms_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")

@app.get("/api/v1/health", tags=["system"])
async def health_check():
    """Foundational api status health check."""
    return {"status": "ok", "service": "lims-api-server", "version": "1.7"}
