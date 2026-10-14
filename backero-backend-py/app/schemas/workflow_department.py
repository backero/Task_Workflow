"""Request/response schemas for the Departments management module (Phase 1c)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=512)
    color: str = Field(default="#3b82f6", max_length=16)


class DepartmentUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128)
    code: str | None = Field(default=None, min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=512)
    color: str | None = Field(default=None, max_length=16)
    is_active: bool | None = None


class DepartmentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    code: str
    description: str | None
    color: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
