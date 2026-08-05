from fastapi import APIRouter, Depends
from app.modules.identity.models import User
from app.modules.identity.dependencies import PermissionChecker
from app.modules.reports.schemas import ReportCatalogResponse
from app.modules.reports import service as reports_service

reports_router = APIRouter(prefix="/reports", tags=["reports"])


@reports_router.get("/catalog", response_model=ReportCatalogResponse)
async def get_report_catalog(
    current_user: User = Depends(PermissionChecker("page_reports")),
) -> ReportCatalogResponse:
    return await reports_service.list_report_catalog()
