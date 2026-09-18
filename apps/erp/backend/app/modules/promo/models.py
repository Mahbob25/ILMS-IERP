import uuid
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class PromoProject(Base):
    __tablename__ = "promo_projects"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="course", server_default="course")
    locale: Mapped[str] = mapped_column(String(5), nullable=False, default="ar", server_default="ar")
    tone: Mapped[str] = mapped_column(String(20), nullable=False, default="cinematic", server_default="cinematic")
    payload: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft", index=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("timezone('utc'::text, now())"),
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PromoRender(Base):
    __tablename__ = "promo_renders"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("promo_projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    quality: Mapped[str] = mapped_column(String(10), nullable=False, default="draft", server_default="draft")
    template_version: Mapped[str] = mapped_column(String(20), nullable=False, default="course-ad-v1")
    brand_kit_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    mp4_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    poster_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    share_copy: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_s: Mapped[Optional[float]] = mapped_column(nullable=True)
    render_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", server_default="queued", index=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        server_default=text("timezone('utc'::text, now())"),
    )
