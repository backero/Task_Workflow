"""Subtask-tree progress/completion engine — ported from
workflowEngine.service.js. No socket/notification side effects yet (same
precedent as the rest of Phase 1/1b: no real-time or notification system
exists in this backend yet)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import Task, TaskDependency, TaskDependencyStatus, TaskStatus
from app.models.task_approval import ApprovalStatus, TaskApproval

_TERMINAL_PROGRESS_STATUSES = {TaskStatus.COMPLETED, TaskStatus.CANCELLED}
_REOPEN_TERMINATED_STATUSES = {TaskStatus.COMPLETED, TaskStatus.APPROVAL_PENDING, TaskStatus.UNDER_REVIEW}


def calculate_progress(db: Session, *, task_id: uuid.UUID) -> int:
    task = db.get(Task, task_id)
    if task is None:
        return 0
    if task.status in _TERMINAL_PROGRESS_STATUSES:
        return 100

    children = (
        db.execute(select(Task).where(Task.parent_task_id == task_id, Task.status != TaskStatus.CANCELLED))
        .scalars()
        .all()
    )
    if not children:
        return task.progress or 0

    total = sum(calculate_progress(db, task_id=child.id) for child in children)
    return round(total / len(children))


def check_completion_eligibility(
    db: Session, *, task_id: uuid.UUID, exclude_approval_id: uuid.UUID | None = None
) -> tuple[bool, list[str]]:
    task = db.get(Task, task_id)
    if task is None:
        return False, ["Task not found"]

    reasons: list[str] = []

    children = (
        db.execute(
            select(Task.title, Task.status).where(Task.parent_task_id == task_id, Task.status != TaskStatus.CANCELLED)
        )
    ).all()
    incomplete = [c for c in children if c.status != TaskStatus.COMPLETED]
    if incomplete:
        titles = ", ".join(f'"{c.title}"' for c in incomplete[:3])
        suffix = "…" if len(incomplete) > 3 else ""
        reasons.append(f"{len(incomplete)} subtask(s) still incomplete: {titles}{suffix}")

    # Active incoming dependencies whose source task isn't complete yet.
    dep_rows = db.execute(
        select(Task.title, Task.status)
        .join(TaskDependency, TaskDependency.from_task_id == Task.id)
        .where(TaskDependency.to_task_id == task_id, TaskDependency.status == TaskDependencyStatus.ACTIVE)
    ).all()
    for row in dep_rows:
        if row.status != TaskStatus.COMPLETED:
            reasons.append(f'Blocked by: "{row.title}" ({row.status.value})')

    approval_conditions = [TaskApproval.task_id == task_id, TaskApproval.status == ApprovalStatus.PENDING]
    if exclude_approval_id is not None:
        approval_conditions.append(TaskApproval.id != exclude_approval_id)
    pending_approvals = db.execute(select(TaskApproval.id).where(*approval_conditions)).scalars().all()
    if pending_approvals:
        reasons.append(f"{len(pending_approvals)} approval request(s) pending")

    return len(reasons) == 0, reasons


def propagate_progress(db: Session, *, task_id: uuid.UUID) -> None:
    task = db.get(Task, task_id)
    if task is None:
        return

    progress = calculate_progress(db, task_id=task_id)
    has_children = (
        db.execute(select(Task.id).where(Task.parent_task_id == task_id).limit(1)).scalar_one_or_none() is not None
    )

    if task.auto_progress or has_children:
        task.progress = progress
        eligible, reasons = check_completion_eligibility(db, task_id=task_id)
        task.completion_locked = not eligible
        task.completion_lock_reasons = reasons
        db.flush()

    if task.parent_task_id is not None:
        propagate_progress(db, task_id=task.parent_task_id)


def reopen_ancestors(db: Session, *, task_id: uuid.UUID) -> None:
    task = db.get(Task, task_id)
    if task is None or task.parent_task_id is None:
        return

    parent = db.get(Task, task.parent_task_id)
    if parent is None:
        return

    if parent.status in _REOPEN_TERMINATED_STATUSES:
        parent.status = TaskStatus.IN_PROGRESS
        parent.completion_locked = True
        parent.completion_lock_reasons = [f'Subtask "{task.title}" was reopened']
        db.flush()
        reopen_ancestors(db, task_id=parent.id)
