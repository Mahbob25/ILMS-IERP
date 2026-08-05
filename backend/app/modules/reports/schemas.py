from pydantic import BaseModel


class ReportDescription(BaseModel):
    """Metadata for a single report in the catalog (no query logic)."""

    path: str
    category: str
    code: str
    inputs: list[str]


class ReportCatalogResponse(BaseModel):
    reports: list[ReportDescription]
