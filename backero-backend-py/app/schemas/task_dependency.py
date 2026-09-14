"""Request/response schemas for task dependencies (Phase 1d — Workflow Builder)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.task import TaskDependencyStatus, TaskDependencyType


class DependencyCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_task_id: uuid.UUID
    to_task_id: uuid.UUID
    type: TaskDependencyType = TaskDependencyType.FINISH_TO_START


class DependencyResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    from_task_id: uuid.UUID
    to_task_id: uuid.UUID
    type: TaskDependencyType
    status: TaskDependencyStatus
    resolved_at: datetime | None
    resolved_by_id: uuid.UUID | None
    created_by_id: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskDependenciesResponse(BaseModel):
    incoming: list[DependencyResponse] = Field(default_factory=list)
    outgoing: list[DependencyResponse] = Field(default_factory=list)
