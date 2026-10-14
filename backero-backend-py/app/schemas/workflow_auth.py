"""Request/response schemas for the workflow auth realm. `extra="forbid"` on
every request body, matching the Attendance Tracker reference's convention."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.workflow_user import WorkflowRole


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_name: str = Field(min_length=1, max_length=255)
    first_name: str = Field(min_length=1, max_length=128)
    last_name: str = Field(min_length=1, max_length=128)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str


class LogoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class WorkflowUserResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    role: WorkflowRole
    department_id: uuid.UUID | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class WorkflowOrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    email: str

    model_config = ConfigDict(from_attributes=True)


class RegisterResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: WorkflowUserResponse
    organization: WorkflowOrganizationResponse


class CurrentWorkflowUserResponse(WorkflowUserResponse):
    last_login_at: datetime | None
