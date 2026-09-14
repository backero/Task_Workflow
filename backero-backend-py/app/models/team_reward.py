"""TeamReward — ported from Task_Workflow's Mongoose `TeamReward` model
(Phase 6). One deliberate improvement: `department` (a free-text string in
the source) becomes `department_id`, a real FK into `workflow_departments`
(Phase 1c already exists) — same relational upgrade already applied to
`Task.department_id`/`WorkflowUser.department_id`.

No creation endpoint exists in the source (`grantTeamReward`/
`skipTeamReward` only act on already-pending rows) — rewards are generated
by a weekly background job elsewhere in the source, not ported here since
there's no background-job infra (APScheduler) wired up yet in this backend.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import ARRAY, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class TeamRewardStatus(StrEnum):
    PENDING = "pending"
    GRANTED = "granted"
    SKIPPED = "skipped"


class TeamRewardType(StrEnum):
    CONGRATS_GAME = "congrats_game"
    REFRESHMENTS = "refreshments"
    EARLY_LEAVE = "early_leave"


class TeamReward(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "team_rewards"
    __table_args__ = (
        UniqueConstraint("organization_id", "department_id", "week_start", name="uq_team_rewards_org_dept_week"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_departments.id"), nullable=False, index=True
    )
    week_start: Mapped[date] = mapped_column(nullable=False)
    week_end: Mapped[date] = mapped_column(nullable=False)
    member_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=True)
    status: Mapped[TeamRewardStatus] = mapped_column(
        SAEnum(TeamRewardStatus, name="team_reward_status", native_enum=True),
        nullable=False,
        default=TeamRewardStatus.PENDING,
        index=True,
    )
    reward_type: Mapped[TeamRewardType | None] = mapped_column(
        SAEnum(TeamRewardType, name="team_reward_type", native_enum=True), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    granted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    granted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
