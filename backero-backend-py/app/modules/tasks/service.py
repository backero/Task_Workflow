"""
Core Tasks business logic — ported from Task_Workflow's task.controller.js
+ workflow.controller.js. Phase 1 covered getTasks/createTask/getTask/
updateTask/addComment/requestCompletion/getAnalytics. Phase 1b added timers/
extension-requests/daily-update/archive/delete. Phase 1d (this file's
subtask/dependency-aware additions, plus workflow_engine.py/
dependency_service.py) is the Workflow Builder: subtask trees, dependency
gating, reopen/achieve. Deliberately still left out: dept-hub/manager-
assignment approval routing (needs the isDeptHub concept, not built),
WorkflowTemplate save/apply, bulk import, the React-Flow auto-layout graph
builder (frontend concern).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError, PermissionDeniedError
from app.core.pagination import Page, PageParams
from app.models.task import (
    Task,
    TaskActivityLogEntry,
    TaskComment,
    TaskCommentType,
    TaskDependency,
    TaskExtensionRequest,
    TaskExtensionStatus,
    TaskStatus,
    TaskTimerSession,
)
from app.models.task_approval import ApprovalStatus, TaskApproval
from app.models.workflow_user import WORKFLOW_ROLE_HIERARCHY, WorkflowRole, WorkflowUser
from app.modules.tasks.workflow_engine import check_completion_eligibility, propagate_progress, reopen_ancestors
from app.schemas.task import (
    ActiveTimerResponse,
    DailyUpdateRequest,
    ExtensionRequestCreate,
    ExtensionRequestResponse,
    SubtaskCreateRequest,
    TaskAnalyticsResponse,
    TaskCommentCreateRequest,
    TaskCreateRequest,
    TaskResponse,
    TaskTreeResponse,
    TaskUpdateRequest,
    TaskWithExtensionsResponse,
    UpdateNodePositionsRequest,
)
from app.schemas.task_approval import TaskApprovalResponse

_REQUESTABLE_STATUSES = {TaskStatus.IN_PROGRESS, TaskStatus.ASSIGNED, TaskStatus.REOPENED, TaskStatus.CHANGES_REQUESTED}


def _log_activity(
    db: Session, *, task_id: uuid.UUID, action: str, actor_id: uuid.UUID, details: dict[str, object] | None = None
) -> None:
    db.add(
        TaskActivityLogEntry(
            task_id=task_id, action=action, performed_by_id=actor_id, details=details, created_at=datetime.now(UTC)
        )
    )


def _get_task_or_404(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = db.execute(select(Task).where(Task.id == task_id, Task.organization_id == org_id)).scalar_one_or_none()
    if task is None:
        raise NotFoundError("Task not found.")
    return task


def list_tasks(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor: WorkflowUser,
    page_params: PageParams,
    status: TaskStatus | None = None,
    priority: str | None = None,
    department_id: uuid.UUID | None = None,
    assigned_to_id: uuid.UUID | None = None,
    search: str | None = None,
    include_archived: bool = False,
) -> Page[TaskResponse]:
    conditions = [Task.organization_id == org_id]
    if not include_archived:
        conditions.append(Task.is_archived.is_(False))

    # Role-based visibility: member/team_lead see only tasks they're
    # assigned to, assigned by them, or watching (no watchers table yet in
    # Phase 1, so: assigned_to or assigned_by). manager+ sees all org tasks.
    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1)
    if actor_level <= WORKFLOW_ROLE_HIERARCHY[WorkflowRole.TEAM_LEAD]:
        conditions.append(or_(Task.assigned_to_id == actor.id, Task.assigned_by_id == actor.id))

    if status is not None:
        conditions.append(Task.status == status)
    if priority is not None:
        conditions.append(Task.priority == priority)
    if department_id is not None:
        conditions.append(Task.department_id == department_id)
    if assigned_to_id is not None:
        conditions.append(Task.assigned_to_id == assigned_to_id)
    if search:
        like = f"%{search}%"
        conditions.append(or_(Task.title.ilike(like), Task.description.ilike(like)))

    total = db.execute(select(func.count(Task.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(Task)
            .where(*conditions)
            .order_by(Task.priority.desc(), Task.due_date.asc().nulls_last(), Task.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[TaskResponse](
        items=[TaskResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def create_task(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: TaskCreateRequest) -> Task:
    status = TaskStatus.ASSIGNED if data.assigned_to_id else TaskStatus.PENDING
    task = Task(
        organization_id=org_id,
        title=data.title,
        description=data.description,
        department_id=data.department_id,
        task_type=data.task_type,
        platform=data.platform,
        assigned_to_id=data.assigned_to_id,
        assigned_by_id=actor.id,
        reporting_manager_id=actor.id,
        priority=data.priority,
        due_date=data.due_date,
        start_date=data.start_date,
        estimated_hours=data.estimated_hours,
        tags=data.tags,
        status=status,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(task)
    db.flush()
    _log_activity(db, task_id=task.id, action="Task created", actor_id=actor.id, details={"title": data.title})
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    return _get_task_or_404(db, org_id=org_id, task_id=task_id)


def update_task(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID, data: TaskUpdateRequest
) -> Task:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(task, field, value)
    task.updated_by_id = actor.id
    _log_activity(db, task_id=task.id, action="Task updated", actor_id=actor.id, details=updates)
    db.commit()
    db.refresh(task)
    return task


def add_comment(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID, data: TaskCommentCreateRequest
) -> TaskComment:
    _get_task_or_404(db, org_id=org_id, task_id=task_id)  # ownership check
    comment = TaskComment(
        task_id=task_id,
        author_id=actor.id,
        content=data.content,
        comment_type=data.comment_type,
        progress=data.progress,
        hours_worked=data.hours_worked,
        is_internal=data.is_internal,
        created_at=datetime.now(UTC),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def request_completion(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID, notes: str | None
) -> TaskApproval:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)

    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1)
    is_manager_or_above = actor_level >= WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MANAGER]
    is_assignee = task.assigned_to_id == actor.id
    if not is_manager_or_above and not is_assignee:
        raise PermissionDeniedError("Only the assignee can request completion.")

    if task.status not in _REQUESTABLE_STATUSES:
        raise AppError("invalid_status", f"Cannot request completion from status: {task.status.value}", status_code=400)

    child_count = db.execute(select(func.count(Task.id)).where(Task.parent_task_id == task_id)).scalar_one()
    if child_count > 0 and not is_manager_or_above:
        raise PermissionDeniedError("Only managers can submit tasks with subtasks for completion.")

    # Subsumes the old "existing pending approval" check — eligibility
    # already counts any pending TaskApproval as a blocking reason.
    eligible, reasons = check_completion_eligibility(db, task_id=task_id)
    if not eligible:
        raise AppError("not_eligible", "Cannot submit for completion yet: " + "; ".join(reasons), status_code=400)

    now = datetime.now(UTC)
    approval = TaskApproval(
        organization_id=org_id,
        task_id=task.id,
        requested_by_id=actor.id,
        request_notes=notes,
        status=ApprovalStatus.PENDING,
        requested_at=now,
        round=task.rejection_count + 1,
    )
    db.add(approval)

    task.status = TaskStatus.APPROVAL_PENDING
    task.updated_by_id = actor.id
    _log_activity(db, task_id=task.id, action="Completion requested", actor_id=actor.id, details={"notes": notes})

    db.commit()
    db.refresh(approval)
    return approval


def get_analytics(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> TaskAnalyticsResponse:
    conditions = [Task.organization_id == org_id, Task.is_archived.is_(False)]
    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1)
    if actor_level <= WORKFLOW_ROLE_HIERARCHY[WorkflowRole.TEAM_LEAD]:
        conditions.append(or_(Task.assigned_to_id == actor.id, Task.assigned_by_id == actor.id))

    total = db.execute(select(func.count(Task.id)).where(*conditions)).scalar_one()

    status_rows = db.execute(select(Task.status, func.count(Task.id)).where(*conditions).group_by(Task.status)).all()
    priority_rows = db.execute(
        select(Task.priority, func.count(Task.id)).where(*conditions).group_by(Task.priority)
    ).all()

    today = datetime.now(UTC).date()
    overdue = db.execute(
        select(func.count(Task.id)).where(
            *conditions,
            Task.due_date < today,
            Task.status.notin_([TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.ACHIEVED]),
        )
    ).scalar_one()

    return TaskAnalyticsResponse(
        total=total,
        by_status={row[0].value: row[1] for row in status_rows},
        by_priority={row[0].value: row[1] for row in priority_rows},
        overdue=overdue,
    )


# ── Phase 1b: task approval history, daily updates, start/archive/delete ────


def get_task_approvals(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID) -> list[TaskApprovalResponse]:
    _get_task_or_404(db, org_id=org_id, task_id=task_id)
    rows = (
        db.execute(
            select(TaskApproval)
            .where(TaskApproval.task_id == task_id, TaskApproval.organization_id == org_id)
            .order_by(TaskApproval.requested_at.desc())
        )
        .scalars()
        .all()
    )
    return [TaskApprovalResponse.model_validate(row) for row in rows]


def add_daily_update(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID, data: DailyUpdateRequest
) -> TaskComment:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)

    is_assignee = task.assigned_to_id == actor.id
    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1)
    if not is_assignee and actor_level < WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MANAGER]:
        raise PermissionDeniedError("You can only update tasks assigned to you.")

    has_children = (
        db.execute(select(Task.id).where(Task.parent_task_id == task_id).limit(1)).scalar_one_or_none() is not None
    )

    effective_progress = data.progress if data.progress is not None else task.progress
    comment = TaskComment(
        task_id=task.id,
        author_id=actor.id,
        content=data.content,
        comment_type=TaskCommentType.DAILY_UPDATE,
        progress=effective_progress,
        hours_worked=data.hours_worked,
        created_at=datetime.now(UTC),
    )
    db.add(comment)

    # Manual progress only applies to leaf tasks — parents get their
    # progress computed from children (see propagate_progress below).
    if not has_children and data.progress is not None:
        task.progress = min(100, max(0, data.progress))
    if data.hours_worked:
        task.actual_hours = (task.actual_hours or 0) + data.hours_worked
    if task.status == TaskStatus.ASSIGNED:
        task.status = TaskStatus.IN_PROGRESS
    task.updated_by_id = actor.id

    _log_activity(db, task_id=task.id, action="daily_update", actor_id=actor.id, details={"progress": task.progress})

    db.flush()
    if task.parent_task_id is not None:
        propagate_progress(db, task_id=task.parent_task_id)

    db.commit()
    db.refresh(comment)
    return comment


def start_task(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID) -> Task:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    if task.assigned_to_id != actor.id:
        raise PermissionDeniedError("Only the assignee can start this task.")
    if task.status != TaskStatus.ASSIGNED:
        raise AppError("invalid_status", f"Cannot start a task with status: {task.status.value}", status_code=400)

    task.status = TaskStatus.IN_PROGRESS
    task.start_date = datetime.now(UTC).date()
    task.updated_by_id = actor.id
    _log_activity(db, task_id=task.id, action="Task started", actor_id=actor.id)

    db.commit()
    db.refresh(task)
    return task


def archive_task(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID, unarchive: bool) -> Task:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    task.is_archived = not unarchive
    task.archived_at = None if unarchive else datetime.now(UTC)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID) -> None:
    # Phase 1 has no subtask-tree concept yet (that's Phase 1d / Workflow
    # Builder), so this is a single-row delete — the source's recursive
    # descendant-collection logic doesn't apply until parentTask/subTasks exist.
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    db.delete(task)
    db.commit()


# ── Phase 1b: timers ─────────────────────────────────────────────────────────


def get_active_timer(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> ActiveTimerResponse | None:
    task = db.execute(
        select(Task).where(Task.organization_id == org_id, Task.active_timer_user_id == actor.id)
    ).scalar_one_or_none()
    if task is None or task.active_timer_started_at is None:
        return None
    return ActiveTimerResponse(
        task_id=task.id,
        title=task.title,
        department_id=task.department_id,
        started_at=task.active_timer_started_at,
        total_tracked_ms=task.total_tracked_ms,
    )


def _stop_timer_row(db: Session, *, task: Task, actor_id: uuid.UUID, note: str | None = None) -> TaskTimerSession:
    started_at = task.active_timer_started_at
    assert started_at is not None  # narrows for mypy — only called when a timer is confirmed active
    stopped_at = datetime.now(UTC)
    duration_ms = int((stopped_at - started_at).total_seconds() * 1000)

    session = TaskTimerSession(
        task_id=task.id,
        user_id=actor_id,
        started_at=started_at,
        stopped_at=stopped_at,
        duration_ms=duration_ms,
        note=note,
    )
    db.add(session)
    task.total_tracked_ms += duration_ms
    task.active_timer_started_at = None
    task.active_timer_user_id = None
    return session


def start_timer(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID) -> Task:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)

    # Auto-stop any timer the user has running on another task first.
    other_task = db.execute(
        select(Task).where(Task.organization_id == org_id, Task.active_timer_user_id == actor.id, Task.id != task.id)
    ).scalar_one_or_none()
    if other_task is not None:
        _stop_timer_row(db, task=other_task, actor_id=actor.id)

    if task.active_timer_user_id == actor.id:
        raise AppError("timer_already_running", "Timer is already running for this task.", status_code=400)

    task.active_timer_started_at = datetime.now(UTC)
    task.active_timer_user_id = actor.id
    _log_activity(db, task_id=task.id, action="timer_started", actor_id=actor.id)

    db.commit()
    db.refresh(task)
    return task


def stop_timer(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID, note: str | None
) -> TaskTimerSession:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    if task.active_timer_started_at is None or task.active_timer_user_id != actor.id:
        raise AppError("no_active_timer", "No active timer found for this task.", status_code=400)

    session = _stop_timer_row(db, task=task, actor_id=actor.id, note=note.strip() if note else None)
    _log_activity(
        db, task_id=task.id, action="timer_stopped", actor_id=actor.id, details={"duration_ms": session.duration_ms}
    )

    db.commit()
    db.refresh(session)
    return session


# ── Phase 1b: extension requests ────────────────────────────────────────────


def request_extension(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID, data: ExtensionRequestCreate
) -> TaskExtensionRequest:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    if task.assigned_to_id != actor.id:
        raise PermissionDeniedError("Only the assignee can request an extension.")

    request = TaskExtensionRequest(
        task_id=task.id,
        requested_by_id=actor.id,
        original_due_date=task.due_date,
        requested_due_date=data.requested_due_date,
        reason=data.reason,
        status=TaskExtensionStatus.PENDING,
        requested_at=datetime.now(UTC),
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def list_extension_requests(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> list[TaskWithExtensionsResponse]:
    conditions = [
        Task.organization_id == org_id,
        Task.id.in_(
            select(TaskExtensionRequest.task_id).where(TaskExtensionRequest.status == TaskExtensionStatus.PENDING)
        ),
    ]
    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1)
    if actor_level == WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MANAGER] and actor.department_id is not None:
        conditions.append(Task.department_id == actor.department_id)

    tasks = db.execute(select(Task).where(*conditions)).scalars().all()

    results: list[TaskWithExtensionsResponse] = []
    for task in tasks:
        pending = (
            db.execute(
                select(TaskExtensionRequest).where(
                    TaskExtensionRequest.task_id == task.id, TaskExtensionRequest.status == TaskExtensionStatus.PENDING
                )
            )
            .scalars()
            .all()
        )
        results.append(
            TaskWithExtensionsResponse(
                id=task.id,
                title=task.title,
                department_id=task.department_id,
                status=task.status,
                priority=task.priority,
                due_date=task.due_date,
                assigned_to_id=task.assigned_to_id,
                assigned_by_id=task.assigned_by_id,
                extension_requests=[ExtensionRequestResponse.model_validate(r) for r in pending],
            )
        )
    return results


def review_extension_request(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor: WorkflowUser,
    task_id: uuid.UUID,
    request_id: uuid.UUID,
    status: TaskExtensionStatus,
) -> TaskExtensionRequest:
    if status not in (TaskExtensionStatus.APPROVED, TaskExtensionStatus.REJECTED):
        raise AppError("invalid_status", "Status must be approved or rejected.", status_code=400)

    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    request = db.execute(
        select(TaskExtensionRequest).where(
            TaskExtensionRequest.id == request_id, TaskExtensionRequest.task_id == task.id
        )
    ).scalar_one_or_none()
    if request is None:
        raise NotFoundError("Extension request not found.")
    if request.status != TaskExtensionStatus.PENDING:
        raise AppError("already_reviewed", "This request has already been reviewed.", status_code=400)

    request.status = status
    request.reviewed_by_id = actor.id
    request.reviewed_at = datetime.now(UTC)

    if status == TaskExtensionStatus.APPROVED:
        task.due_date = request.requested_due_date
        task.updated_by_id = actor.id
        _log_activity(
            db,
            task_id=task.id,
            action=f"Deadline extended to {request.requested_due_date.isoformat()}",
            actor_id=actor.id,
        )

    db.commit()
    db.refresh(request)
    return request


# ── Phase 1d: subtask trees, completion gating, reopen/achieve ─────────────


def _build_tree_response(db: Session, *, task: Task) -> TaskTreeResponse:
    children = (
        db.execute(select(Task).where(Task.parent_task_id == task.id).order_by(Task.created_at.asc())).scalars().all()
    )
    return TaskTreeResponse(
        id=task.id,
        title=task.title,
        status=task.status,
        priority=task.priority,
        progress=task.progress,
        assigned_to_id=task.assigned_to_id,
        assigned_by_id=task.assigned_by_id,
        due_date=task.due_date,
        department_id=task.department_id,
        completion_locked=task.completion_locked,
        completion_lock_reasons=task.completion_lock_reasons,
        level=task.level,
        workflow_x=task.workflow_x,
        workflow_y=task.workflow_y,
        children=[_build_tree_response(db, task=child) for child in children],
    )


def get_task_tree(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID) -> TaskTreeResponse:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    return _build_tree_response(db, task=task)


def add_subtask(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, parent_task_id: uuid.UUID, data: SubtaskCreateRequest
) -> Task:
    parent = _get_task_or_404(db, org_id=org_id, task_id=parent_task_id)

    status = TaskStatus.ASSIGNED if data.assigned_to_id else TaskStatus.PENDING
    subtask = Task(
        organization_id=org_id,
        title=data.title,
        description=data.description,
        department_id=data.department_id or parent.department_id,
        platform=data.platform or parent.platform,
        priority=data.priority,
        status=status,
        assigned_to_id=data.assigned_to_id,
        assigned_by_id=actor.id,
        reporting_manager_id=actor.id,
        due_date=data.due_date,
        estimated_hours=data.estimated_hours,
        parent_task_id=parent_task_id,
        level=parent.level + 1,
        auto_progress=True,
        workflow_x=data.workflow_x,
        workflow_y=data.workflow_y,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(subtask)

    parent.auto_progress = True
    parent.completion_locked = True
    reasons = list(parent.completion_lock_reasons or [])
    if "Has incomplete subtasks" not in reasons:
        reasons.append("Has incomplete subtasks")
    parent.completion_lock_reasons = reasons
    if parent.status in (TaskStatus.PENDING, TaskStatus.ASSIGNED):
        parent.status = TaskStatus.IN_PROGRESS
    parent.updated_by_id = actor.id

    db.flush()
    _log_activity(db, task_id=subtask.id, action="Task created", actor_id=actor.id, details={"title": data.title})
    db.commit()
    db.refresh(subtask)
    return subtask


def get_completion_eligibility(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID) -> tuple[bool, list[str]]:
    _get_task_or_404(db, org_id=org_id, task_id=task_id)
    return check_completion_eligibility(db, task_id=task_id)


def reopen_task(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID, reason: str | None) -> Task:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)

    task.status = TaskStatus.REOPENED
    task.progress = min(task.progress or 0, 90)
    task.completion_locked = True
    task.completion_lock_reasons = [reason or "Task reopened"]
    task.updated_by_id = actor.id
    task.is_archived = False
    task.archived_at = None
    _log_activity(db, task_id=task.id, action="Reopened", actor_id=actor.id, details={"reason": reason})

    # Any leftover pending approval must be superseded, otherwise it blocks
    # future completion attempts forever (eligibility counts it indefinitely).
    pending_approvals = (
        db.execute(
            select(TaskApproval).where(TaskApproval.task_id == task_id, TaskApproval.status == ApprovalStatus.PENDING)
        )
        .scalars()
        .all()
    )
    now = datetime.now(UTC)
    for approval in pending_approvals:
        approval.status = ApprovalStatus.CHANGES_REQUESTED
        approval.reviewed_by_id = actor.id
        approval.reviewed_at = now
        approval.review_notes = reason or "Task reopened"

    db.flush()
    reopen_ancestors(db, task_id=task_id)
    if task.parent_task_id is not None:
        propagate_progress(db, task_id=task.parent_task_id)

    db.commit()
    db.refresh(task)
    return task


def achieve_task(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, task_id: uuid.UUID) -> Task:
    task = _get_task_or_404(db, org_id=org_id, task_id=task_id)
    if task.status != TaskStatus.COMPLETED:
        raise AppError("invalid_status", "Only Completed tasks can be marked as Achieved.", status_code=400)

    task.status = TaskStatus.ACHIEVED
    task.updated_by_id = actor.id
    if task.parent_task_id is None:
        task.is_archived = True
        task.archived_at = datetime.now(UTC)
    _log_activity(db, task_id=task.id, action="Marked as Achieved", actor_id=actor.id)

    db.commit()
    db.refresh(task)
    return task


def update_node_positions(db: Session, *, org_id: uuid.UUID, data: UpdateNodePositionsRequest) -> None:
    for pos in data.positions:
        task = db.execute(
            select(Task).where(Task.id == pos.task_id, Task.organization_id == org_id)
        ).scalar_one_or_none()
        if task is not None:
            task.workflow_x = pos.x
            task.workflow_y = pos.y
    db.commit()


def get_task_dependencies(
    db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID
) -> tuple[list[TaskDependency], list[TaskDependency]]:
    _get_task_or_404(db, org_id=org_id, task_id=task_id)
    incoming = (
        db.execute(
            select(TaskDependency).where(TaskDependency.to_task_id == task_id, TaskDependency.organization_id == org_id)
        )
        .scalars()
        .all()
    )
    outgoing = (
        db.execute(
            select(TaskDependency).where(
                TaskDependency.from_task_id == task_id, TaskDependency.organization_id == org_id
            )
        )
        .scalars()
        .all()
    )
    return list(incoming), list(outgoing)
