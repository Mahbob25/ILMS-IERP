import uuid
from typing import Optional
from pydantic import BaseModel


class SearchHit(BaseModel):
    id: str
    type: str
    label: str
    sublabel: Optional[str] = None
    href: str


class GroupedSearchResponse(BaseModel):
    query: str
    total: int
    results: dict[str, list[SearchHit]]
