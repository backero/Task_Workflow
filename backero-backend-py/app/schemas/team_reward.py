"""Request/response schemas for team rewards (Phase 6)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.team_reward import TeamRewardStatus, TeamRewardType


class GrantRewardRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reward_type: TeamRewardType
    note: str | None = Field(default=None, max_length=500)


class TeamRewardResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    department_id: uuid.UUID
    week_start: date
    week_end: date
    member_ids: list[uuid.UUID] | None
    status: TeamRewardStatus
    reward_type: TeamRewardType | None
    note: str | None
    granted_by_id: uuid.UUID | None
    granted_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
