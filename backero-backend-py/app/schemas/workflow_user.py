"""Request/response schemas for the Users management module (Phase 1c)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.workflow_user import WorkflowRole


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str = Field(min_length=1, max_length=128)
    last_name: str = Field(min_length=1, max_length=128)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    phone: str | None = Field(default=None, max_length=32)
    role: WorkflowRole = WorkflowRole.MEMBER
    department_id: uuid.UUID | None = None
    designation: str | None = Field(default=None, max_length=128)
    reports_to_id: uuid.UUID | None = None


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, min_length=1, max_length=128)
    last_name: str | None = Field(default=None, min_length=1, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    role: WorkflowRole | None = None
    department_id: uuid.UUID | None = None
    designation: str | None = Field(default=None, max_length=128)
    reports_to_id: uuid.UUID | None = None


class UserProfileUpdateRequest(BaseModel):
    """Self-service profile update — deliberately narrower than the source's
    `/me/profile` (which only excludes password/refreshToken/role/
    organizationId, so technically also allows self-editing department/
    isActive). Restricted here to fields that are actually "my profile", not
    a loophole around the admin-only role/department/activation controls."""

    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, min_length=1, max_length=128)
    last_name: str | None = Field(default=None, min_length=1, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    designation: str | None = Field(default=None, max_length=128)


class UserResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    phone: str | None
    role: WorkflowRole
    department_id: uuid.UUID | None
    designation: str | None
    reports_to_id: uuid.UUID | None
    avatar: str | None
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
