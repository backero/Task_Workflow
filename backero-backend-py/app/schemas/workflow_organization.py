"""Request/response schemas for organization settings (Phase 6)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.workflow_organization import OrganizationPlan


class OrganizationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    logo_url: str | None = Field(default=None, max_length=1024)
    gst_number: str | None = Field(default=None, max_length=32)
    plan: OrganizationPlan | None = None
    plan_expiry: date | None = None
    address: dict[str, object] | None = None
    settings: dict[str, object] | None = None
    document_categories: list[dict[str, object]] | None = None


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    email: str
    phone: str | None
    is_active: bool
    logo_url: str | None
    gst_number: str | None
    plan: OrganizationPlan
    plan_expiry: date | None
    address: dict[str, object] | None
    settings: dict[str, object] | None
    document_categories: list[dict[str, object]] | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
