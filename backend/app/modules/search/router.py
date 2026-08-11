import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.search.schemas import GroupedSearchResponse
from app.modules.search import service as search_service
from app.core.rate_limit import limiter

search_router = APIRouter(prefix="/search", tags=["search"])


@search_router.get("", response_model=GroupedSearchResponse)
@limiter.limit("30/minute")
async def global_search(
    request: Request,
    q: str = Query(..., min_length=2, max_length=100),
    limit_per_type: int = Query(5, ge=1, le=20),
    locale: str = Query("ar", regex="^(ar|en)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await search_service.search_grouped(db, query=q, user=current_user, limit_per_type=limit_per_type, locale=locale)
    return result
