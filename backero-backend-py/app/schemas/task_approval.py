"""Request/response schemas for the approval queue (Phase 1)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.task_approval import ApprovalStatus


class ApprovalReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review_notes: str | None = Field(default=None, max_length=5000)


class ApprovalRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review_notes: str = Field(min_length=1, max_length=5000)


class TaskApprovalResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    task_id: uuid.UUID
    requested_by_id: uuid.UUID
    reviewed_by_id: uuid.UUID | None
    status: ApprovalStatus
    request_notes: str | None
    review_notes: str | None
    requested_at: datetime
    reviewed_at: datetime | None
    round: int

    model_config = ConfigDict(from_attributes=True)


class ApprovalStatsResponse(BaseModel):
    pending: int
    approved: int
    rejected: int
    my_requests: int
