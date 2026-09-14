"""Request/response schemas for the Tasks module (Phase 1 core + Phase 1b
timers/extension-requests)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.task import TaskCommentType, TaskExtensionStatus, TaskPriority, TaskStatus


class TaskCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    department_id: uuid.UUID | None = None
    task_type: str | None = Field(default=None, max_length=64)
    platform: str | None = Field(default=None, max_length=64)
    assigned_to_id: uuid.UUID | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: date | None = None
    start_date: date | None = None
    estimated_hours: float | None = None
    tags: list[str] | None = None


class TaskUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    department_id: uuid.UUID | None = None
    task_type: str | None = Field(default=None, max_length=64)
    platform: str | None = Field(default=None, max_length=64)
    assigned_to_id: uuid.UUID | None = None
    priority: TaskPriority | None = None
    due_date: date | None = None
    start_date: date | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    tags: list[str] | None = None


class TaskCommentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=5000)
    comment_type: TaskCommentType = TaskCommentType.COMMENT
    progress: int | None = Field(default=None, ge=0, le=100)
    hours_worked: float | None = None
    is_internal: bool = False


class RequestCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str | None = Field(default=None, max_length=5000)


class DailyUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=5000)
    progress: int | None = Field(default=None, ge=0, le=100)
    hours_worked: float | None = Field(default=None, ge=0)


class ExtensionRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested_due_date: date
    reason: str | None = Field(default=None, max_length=2000)


class ExtensionReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: TaskExtensionStatus


class TimerSessionResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    started_at: datetime
    stopped_at: datetime
    duration_ms: int
    note: str | None

    model_config = ConfigDict(from_attributes=True)


class ActiveTimerResponse(BaseModel):
    task_id: uuid.UUID
    title: str
    department_id: uuid.UUID | None
    started_at: datetime
    total_tracked_ms: int


class ExtensionRequestResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    requested_by_id: uuid.UUID
    original_due_date: date | None
    requested_due_date: date
    reason: str | None
    status: TaskExtensionStatus
    requested_at: datetime
    reviewed_by_id: uuid.UUID | None
    reviewed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class TaskWithExtensionsResponse(BaseModel):
    """One task plus its pending extension request(s) — used by the manager
    extension-requests queue endpoint."""

    id: uuid.UUID
    title: str
    department_id: uuid.UUID | None
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None
    assigned_to_id: uuid.UUID | None
    assigned_by_id: uuid.UUID
    extension_requests: list[ExtensionRequestResponse]

    model_config = ConfigDict(from_attributes=True)


class TaskCommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID
    content: str
    comment_type: TaskCommentType
    progress: int | None
    hours_worked: float | None
    is_internal: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    title: str
    description: str | None
    department_id: uuid.UUID | None
    task_type: str | None
    platform: str | None
    assigned_to_id: uuid.UUID | None
    assigned_by_id: uuid.UUID
    reporting_manager_id: uuid.UUID | None
    status: TaskStatus
    priority: TaskPriority
    progress: int
    due_date: date | None
    start_date: date | None
    completed_at: datetime | None
    estimated_hours: float | None
    actual_hours: float | None
    tags: list[str] | None
    rejection_count: int
    is_archived: bool
    total_tracked_ms: int
    parent_task_id: uuid.UUID | None
    level: int
    auto_progress: bool
    completion_locked: bool
    completion_lock_reasons: list[str] | None
    workflow_x: float | None
    workflow_y: float | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskAnalyticsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    by_priority: dict[str, int]
    overdue: int


# ── Phase 1d: subtask trees + dependencies (Workflow Builder) ──────────────


class SubtaskCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    assigned_to_id: uuid.UUID | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: date | None = None
    estimated_hours: float | None = None
    department_id: uuid.UUID | None = None
    platform: str | None = Field(default=None, max_length=64)
    workflow_x: float | None = None
    workflow_y: float | None = None


class TaskTreeResponse(BaseModel):
    id: uuid.UUID
    title: str
    status: TaskStatus
    priority: TaskPriority
    progress: int
    assigned_to_id: uuid.UUID | None
    assigned_by_id: uuid.UUID
    due_date: date | None
    department_id: uuid.UUID | None
    completion_locked: bool
    completion_lock_reasons: list[str] | None
    level: int
    workflow_x: float | None
    workflow_y: float | None
    children: list[TaskTreeResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CompletionEligibilityResponse(BaseModel):
    eligible: bool
    reasons: list[str]


class ReopenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=2000)


class NodePosition(BaseModel):
    task_id: uuid.UUID
    x: float
    y: float


class UpdateNodePositionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    positions: list[NodePosition]
