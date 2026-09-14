from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.task_approval import ApprovalStatus
from app.models.workflow_user import WorkflowUser
from app.modules.approvals import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user
from app.schemas.task import TaskResponse
from app.schemas.task_approval import (
    ApprovalRejectRequest,
    ApprovalReviewRequest,
    ApprovalStatsResponse,
    TaskApprovalResponse,
)

router = APIRouter(prefix="/workflow/approvals", tags=["workflow-approvals"])


class ApprovalWithTaskResponse(TaskApprovalResponse):
    task: TaskResponse


@router.get("", response_model=Page[TaskApprovalResponse])
def list_approvals(
    status: ApprovalStatus | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[TaskApprovalResponse]:
    return service.list_approvals(
        db, org_id=current_user.organization_id, actor=current_user, page_params=page_params, status=status
    )


@router.get("/stats", response_model=ApprovalStatsResponse)
def get_approval_stats(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> ApprovalStatsResponse:
    return service.get_approval_stats(db, org_id=current_user.organization_id, actor=current_user)


@router.post("/{approval_id}/approve", response_model=ApprovalWithTaskResponse)
def approve(
    approval_id: uuid.UUID,
    body: ApprovalReviewRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ApprovalWithTaskResponse:
    approval, task = service.approve_task(
        db,
        org_id=current_user.organization_id,
        actor=current_user,
        approval_id=approval_id,
        review_notes=body.review_notes,
    )
    return ApprovalWithTaskResponse(
        **TaskApprovalResponse.model_validate(approval).model_dump(), task=TaskResponse.model_validate(task)
    )


@router.post("/{approval_id}/reject", response_model=ApprovalWithTaskResponse)
def reject(
    approval_id: uuid.UUID,
    body: ApprovalRejectRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ApprovalWithTaskResponse:
    approval, task = service.reject_task(
        db,
        org_id=current_user.organization_id,
        actor=current_user,
        approval_id=approval_id,
        review_notes=body.review_notes,
    )
    return ApprovalWithTaskResponse(
        **TaskApprovalResponse.model_validate(approval).model_dump(), task=TaskResponse.model_validate(task)
    )
