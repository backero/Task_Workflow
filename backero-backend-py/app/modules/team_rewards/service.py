"""Team rewards business logic — ported from teamReward.controller.js
(getTeamRewards/grantTeamReward/skipTeamReward). No creation endpoint exists
in the source; see app/models/team_reward.py for why."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError, PermissionDeniedError
from app.core.pagination import Page, PageParams
from app.models.team_reward import TeamReward, TeamRewardStatus, TeamRewardType
from app.models.workflow_user import WORKFLOW_ROLE_HIERARCHY, WorkflowRole, WorkflowUser
from app.schemas.team_reward import TeamRewardResponse


def list_team_rewards(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, page_params: PageParams, status: TeamRewardStatus | None
) -> Page[TeamRewardResponse]:
    conditions = [TeamReward.organization_id == org_id]
    if status is not None:
        conditions.append(TeamReward.status == status)

    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 0)
    if actor_level < WORKFLOW_ROLE_HIERARCHY[WorkflowRole.ADMIN]:
        # Managers/team leads only see their own department's rewards.
        conditions.append(TeamReward.department_id == actor.department_id)

    total = db.execute(select(func.count(TeamReward.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(TeamReward)
            .where(*conditions)
            .order_by(TeamReward.week_start.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[TeamRewardResponse](
        items=[TeamRewardResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def _get_reward_or_404(db: Session, *, org_id: uuid.UUID, reward_id: uuid.UUID) -> TeamReward:
    reward = db.execute(
        select(TeamReward).where(TeamReward.id == reward_id, TeamReward.organization_id == org_id)
    ).scalar_one_or_none()
    if reward is None:
        raise NotFoundError("Reward not found.")
    return reward


def _can_act_on_department(actor: WorkflowUser, department_id: uuid.UUID) -> bool:
    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 0)
    if actor_level >= WORKFLOW_ROLE_HIERARCHY[WorkflowRole.ADMIN]:
        return True
    return actor_level >= WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MANAGER] and actor.department_id == department_id


def grant_team_reward(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor: WorkflowUser,
    reward_id: uuid.UUID,
    reward_type: TeamRewardType,
    note: str | None,
) -> TeamReward:
    reward = _get_reward_or_404(db, org_id=org_id, reward_id=reward_id)
    if reward.status != TeamRewardStatus.PENDING:
        raise AppError("already_reviewed", f"This reward was already {reward.status.value}.", status_code=400)
    if not _can_act_on_department(actor, reward.department_id):
        raise PermissionDeniedError("Access denied.")

    reward.status = TeamRewardStatus.GRANTED
    reward.reward_type = reward_type
    reward.note = note.strip() if note else None
    reward.granted_by_id = actor.id
    reward.granted_at = datetime.now(UTC)

    db.commit()
    db.refresh(reward)
    return reward


def skip_team_reward(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, reward_id: uuid.UUID) -> TeamReward:
    reward = _get_reward_or_404(db, org_id=org_id, reward_id=reward_id)
    if reward.status != TeamRewardStatus.PENDING:
        raise AppError("already_reviewed", f"This reward was already {reward.status.value}.", status_code=400)
    if not _can_act_on_department(actor, reward.department_id):
        raise PermissionDeniedError("Access denied.")

    reward.status = TeamRewardStatus.SKIPPED

    db.commit()
    db.refresh(reward)
    return reward
