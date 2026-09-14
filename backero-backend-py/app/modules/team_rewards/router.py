from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.team_reward import TeamRewardStatus
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.team_rewards import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.team_reward import GrantRewardRequest, TeamRewardResponse

router = APIRouter(prefix="/workflow/team-rewards", tags=["workflow-team-rewards"])


@router.get("", response_model=Page[TeamRewardResponse])
def list_team_rewards(
    status: TeamRewardStatus | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[TeamRewardResponse]:
    return service.list_team_rewards(
        db, org_id=current_user.organization_id, actor=current_user, page_params=page_params, status=status
    )


@router.post(
    "/{reward_id}/grant",
    response_model=TeamRewardResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def grant_team_reward(
    reward_id: uuid.UUID,
    body: GrantRewardRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TeamRewardResponse:
    reward = service.grant_team_reward(
        db,
        org_id=current_user.organization_id,
        actor=current_user,
        reward_id=reward_id,
        reward_type=body.reward_type,
        note=body.note,
    )
    return TeamRewardResponse.model_validate(reward)


@router.post(
    "/{reward_id}/skip",
    response_model=TeamRewardResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def skip_team_reward(
    reward_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TeamRewardResponse:
    reward = service.skip_team_reward(db, org_id=current_user.organization_id, actor=current_user, reward_id=reward_id)
    return TeamRewardResponse.model_validate(reward)
