"""
Core approval-queue business logic — ported from Task_Workflow's
approval.controller.js (getApprovals/approveTask/rejectTask/
getApprovalStats) + the tree-aware side effects from workflow.controller.js's
completeTask/rejectTask (Phase 1d). `checkApprovalAuthority` is a direct port
of the same-named JS helper, with one deliberate improvement: department
matching uses real FK equality (`department_id`) instead of the source's
free-text string comparison, since workflow_departments is a proper table
here — kept as the single authority check for both approve and reject rather
than also porting completeTask's separate, simpler rule, since this one is a
superset (see the module's git history for how it was derived).

Deliberately NOT ported: all WhatsApp/email notification side effects (no
notification system yet), and the DeptHub-root special case in the source's
checkApprovalAuthority (DeptHub is an unrelated, still-deferred concept —
see tasks/service.py).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError, PermissionDeniedError
from app.core.pagination import Page, PageParams
from app.models.task import Task, TaskActivityLogEntry, TaskStatus
from app.models.task_approval import ApprovalStatus, TaskApproval
from app.models.workflow_user import WORKFLOW_ROLE_HIERARCHY, WorkflowRole, WorkflowUser
from app.modules.tasks.dependency_service import resolve_outgoing_dependencies
from app.modules.tasks.workflow_engine import check_completion_eligibility, propagate_progress
from app.schemas.task_approval import ApprovalStatsResponse, TaskApprovalResponse


def _log_activity(
    db: Session, *, task_id: uuid.UUID, action: str, actor_id: uuid.UUID, details: dict[str, object] | None = None
) -> None:
    db.add(
        TaskActivityLogEntry(
            task_id=task_id, action=action, performed_by_id=actor_id, details=details, created_at=datetime.now(UTC)
        )
    )


def list_approvals(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, page_params: PageParams, status: ApprovalStatus | None
) -> Page[TaskApprovalResponse]:
    conditions = [TaskApproval.organization_id == org_id]
    conditions.append(TaskApproval.status == status if status else TaskApproval.status == ApprovalStatus.PENDING)

    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 0)
    if actor_level < WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MANAGER]:
        # Members see only their own requests.
        conditions.append(TaskApproval.requested_by_id == actor.id)
    elif actor_level < WORKFLOW_ROLE_HIERARCHY[WorkflowRole.ADMIN]:
        # Managers see: tasks they assigned + all requests from same-dept members.
        assigned_task_ids = db.execute(select(Task.id).where(Task.assigned_by_id == actor.id)).scalars().all()
        dept_member_ids = (
            db.execute(select(WorkflowUser.id).where(WorkflowUser.department_id == actor.department_id)).scalars().all()
        )
        conditions.append(
            or_(TaskApproval.task_id.in_(assigned_task_ids), TaskApproval.requested_by_id.in_(dept_member_ids))
        )
    # admin+ see everything in the org.

    total = db.execute(select(func.count(TaskApproval.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(TaskApproval)
            .where(*conditions)
            .order_by(TaskApproval.requested_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[TaskApprovalResponse](
        items=[TaskApprovalResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def _get_approval_or_404(db: Session, *, org_id: uuid.UUID, approval_id: uuid.UUID) -> TaskApproval:
    approval = db.execute(
        select(TaskApproval).where(TaskApproval.id == approval_id, TaskApproval.organization_id == org_id)
    ).scalar_one_or_none()
    if approval is None:
        raise NotFoundError("Approval request not found.")
    return approval


def _check_approval_authority(db: Session, *, actor: WorkflowUser, approval: TaskApproval) -> Task:
    task = db.get(Task, approval.task_id)
    if task is None:
        raise NotFoundError("Task not found.")

    requester = db.get(WorkflowUser, approval.requested_by_id)
    requester_level = WORKFLOW_ROLE_HIERARCHY.get(requester.role, 0) if requester else 0
    approver_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 0)
    admin_level = WORKFLOW_ROLE_HIERARCHY[WorkflowRole.ADMIN]
    manager_level = WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MANAGER]

    is_assigner = task.assigned_by_id == actor.id
    is_reporting_manager = task.reporting_manager_id is not None and task.reporting_manager_id == actor.id
    is_same_dept_manager = (
        approver_level >= manager_level
        and actor.department_id is not None
        and (
            actor.department_id == (requester.department_id if requester else None)
            or actor.department_id == task.department_id
        )
    )

    if requester_level >= manager_level:
        if not is_assigner and approver_level < admin_level:
            raise PermissionDeniedError(
                "Only the assigning manager or an admin can approve tasks submitted by managers."
            )
    else:
        if not is_assigner and not is_reporting_manager and not is_same_dept_manager and approver_level < admin_level:
            raise PermissionDeniedError(
                "Only the assigned manager, a department manager, or an admin can approve this task."
            )

    return task


def approve_task(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, approval_id: uuid.UUID, review_notes: str | None
) -> tuple[TaskApproval, Task]:
    approval = _get_approval_or_404(db, org_id=org_id, approval_id=approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise AppError("already_reviewed", "This approval has already been reviewed.", status_code=400)

    task = _check_approval_authority(db, actor=actor, approval=approval)

    # Excludes this approval itself from the "pending approvals" reason —
    # its own status is still PENDING at this point (flipped to APPROVED
    # just below), so without the exclusion every approval would forever
    # block on itself.
    eligible, reasons = check_completion_eligibility(db, task_id=task.id, exclude_approval_id=approval.id)
    if not eligible:
        raise AppError("not_eligible", "Cannot complete task: " + "; ".join(reasons), status_code=400)

    now = datetime.now(UTC)
    approval.status = ApprovalStatus.APPROVED
    approval.reviewed_by_id = actor.id
    approval.review_notes = review_notes
    approval.reviewed_at = now

    task.status = TaskStatus.COMPLETED
    task.completed_at = now
    task.progress = 100
    task.completion_locked = False
    task.completion_lock_reasons = None
    task.updated_by_id = actor.id
    # Auto-archive root tasks only — a subtask completing shouldn't vanish
    # from its parent's board.
    if task.parent_task_id is None:
        task.is_archived = True
        task.archived_at = now

    _log_activity(
        db,
        task_id=task.id,
        action="Task approved and completed",
        actor_id=actor.id,
        details={"review_notes": review_notes},
    )

    db.flush()
    resolve_outgoing_dependencies(db, org_id=org_id, task_id=task.id)
    if task.parent_task_id is not None:
        propagate_progress(db, task_id=task.parent_task_id)

    db.commit()
    db.refresh(approval)
    db.refresh(task)
    return approval, task


def reject_task(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, approval_id: uuid.UUID, review_notes: str
) -> tuple[TaskApproval, Task]:
    approval = _get_approval_or_404(db, org_id=org_id, approval_id=approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise AppError("already_reviewed", "This approval has already been reviewed.", status_code=400)

    task = _check_approval_authority(db, actor=actor, approval=approval)

    now = datetime.now(UTC)
    approval.status = ApprovalStatus.REJECTED
    approval.reviewed_by_id = actor.id
    approval.review_notes = review_notes
    approval.reviewed_at = now

    task.status = TaskStatus.CHANGES_REQUESTED
    task.rejection_count += 1
    task.completion_locked = True
    task.completion_lock_reasons = [review_notes or "Changes requested by reviewer"]
    task.updated_by_id = actor.id

    _log_activity(
        db,
        task_id=task.id,
        action="Task rejected - changes requested",
        actor_id=actor.id,
        details={"review_notes": review_notes},
    )

    db.commit()
    db.refresh(approval)
    db.refresh(task)
    return approval, task


def get_approval_stats(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> ApprovalStatsResponse:
    pending = db.execute(
        select(func.count(TaskApproval.id)).where(
            TaskApproval.organization_id == org_id, TaskApproval.status == ApprovalStatus.PENDING
        )
    ).scalar_one()
    approved = db.execute(
        select(func.count(TaskApproval.id)).where(
            TaskApproval.organization_id == org_id, TaskApproval.status == ApprovalStatus.APPROVED
        )
    ).scalar_one()
    rejected = db.execute(
        select(func.count(TaskApproval.id)).where(
            TaskApproval.organization_id == org_id, TaskApproval.status == ApprovalStatus.REJECTED
        )
    ).scalar_one()
    my_requests = db.execute(
        select(func.count(TaskApproval.id)).where(
            TaskApproval.organization_id == org_id, TaskApproval.requested_by_id == actor.id
        )
    ).scalar_one()
    return ApprovalStatsResponse(pending=pending, approved=approved, rejected=rejected, my_requests=my_requests)
