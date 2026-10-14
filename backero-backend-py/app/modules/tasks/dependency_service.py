"""Task dependency graph — ported from dependency.service.js.

Cycle detection is a *corrected* port, not a literal one: the source's
`detectCycle(toTaskId, fromTaskId)` walks the "toTask → fromTask" direction
(from the new edge's target, backward along existing incoming edges). Traced
through by hand, that direction fails to catch the simplest possible cycle —
adding B→A when A→B already exists comes back "no cycle" and the edge gets
created, live-verified against a running instance of this exact port before
the fix. The correct check for "does adding edge F→T create a cycle" is:
does a forward path T ⇒ F already exist (walking existing edges in their own
from→to direction)? That's what's implemented below."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.models.task import Task, TaskDependency, TaskDependencyStatus, TaskDependencyType, TaskStatus
from app.modules.tasks.workflow_engine import check_completion_eligibility


def _detect_cycle(db: Session, *, org_id: uuid.UUID, from_task_id: uuid.UUID, to_task_id: uuid.UUID) -> bool:
    """True if a forward path to_task_id ⇒ ... ⇒ from_task_id already exists
    via active edges — i.e. adding from_task_id → to_task_id would close a
    loop."""
    visited: set[uuid.UUID] = set()
    stack = [to_task_id]

    while stack:
        current = stack.pop()
        if current == from_task_id:
            return True
        if current in visited:
            continue
        visited.add(current)

        downstream = (
            db.execute(
                select(TaskDependency.to_task_id).where(
                    TaskDependency.from_task_id == current,
                    TaskDependency.organization_id == org_id,
                    TaskDependency.status == TaskDependencyStatus.ACTIVE,
                )
            )
            .scalars()
            .all()
        )
        stack.extend(downstream)

    return False


def add_dependency(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor_id: uuid.UUID,
    from_task_id: uuid.UUID,
    to_task_id: uuid.UUID,
    dep_type: TaskDependencyType,
) -> TaskDependency:
    if from_task_id == to_task_id:
        raise AppError("self_dependency", "A task cannot depend on itself.", status_code=400)

    from_task = db.execute(
        select(Task).where(Task.id == from_task_id, Task.organization_id == org_id)
    ).scalar_one_or_none()
    to_task = db.execute(select(Task).where(Task.id == to_task_id, Task.organization_id == org_id)).scalar_one_or_none()
    if from_task is None or to_task is None:
        raise NotFoundError("Task not found.")

    existing = db.execute(
        select(TaskDependency).where(
            TaskDependency.from_task_id == from_task_id,
            TaskDependency.to_task_id == to_task_id,
            TaskDependency.status != TaskDependencyStatus.WAIVED,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError("dependency_exists", "Dependency already exists.", status_code=409)

    if _detect_cycle(db, org_id=org_id, from_task_id=from_task_id, to_task_id=to_task_id):
        raise AppError(
            "circular_dependency", "Adding this dependency would create a circular dependency.", status_code=400
        )

    dep = TaskDependency(
        organization_id=org_id, from_task_id=from_task_id, to_task_id=to_task_id, type=dep_type, created_by_id=actor_id
    )
    db.add(dep)

    if from_task.status != TaskStatus.COMPLETED:
        to_task.completion_locked = True
        reasons = list(to_task.completion_lock_reasons or [])
        reason = f'Blocked by: "{from_task.title}"'
        if reason not in reasons:
            reasons.append(reason)
        to_task.completion_lock_reasons = reasons

    db.commit()
    db.refresh(dep)
    return dep


def remove_dependency(
    db: Session, *, org_id: uuid.UUID, actor_id: uuid.UUID, dependency_id: uuid.UUID
) -> TaskDependency:
    dep = db.execute(
        select(TaskDependency).where(TaskDependency.id == dependency_id, TaskDependency.organization_id == org_id)
    ).scalar_one_or_none()
    if dep is None:
        raise NotFoundError("Dependency not found.")

    dep.status = TaskDependencyStatus.WAIVED
    dep.resolved_at = datetime.now(UTC)
    dep.resolved_by_id = actor_id

    to_task = db.get(Task, dep.to_task_id)
    if to_task is not None:
        eligible, reasons = check_completion_eligibility(db, task_id=to_task.id)
        to_task.completion_locked = not eligible
        to_task.completion_lock_reasons = reasons

    db.commit()
    db.refresh(dep)
    return dep


def resolve_outgoing_dependencies(db: Session, *, org_id: uuid.UUID, task_id: uuid.UUID) -> None:
    """Called when a task completes — resolves its finish-to-start outgoing
    edges and re-evaluates the completion lock on every downstream task."""
    outgoing = (
        db.execute(
            select(TaskDependency).where(
                TaskDependency.from_task_id == task_id,
                TaskDependency.organization_id == org_id,
                TaskDependency.status == TaskDependencyStatus.ACTIVE,
                TaskDependency.type == TaskDependencyType.FINISH_TO_START,
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(UTC)
    downstream_ids: set[uuid.UUID] = set()
    for dep in outgoing:
        dep.status = TaskDependencyStatus.RESOLVED
        dep.resolved_at = now
        downstream_ids.add(dep.to_task_id)

    # The source re-evaluates every downstream task of the FROM task
    # regardless of dependency type/status (not just the ones just
    # resolved above) — replicate that broader re-check.
    all_downstream = (
        db.execute(
            select(TaskDependency.to_task_id).where(
                TaskDependency.from_task_id == task_id, TaskDependency.organization_id == org_id
            )
        )
        .scalars()
        .all()
    )
    downstream_ids.update(all_downstream)

    for downstream_id in downstream_ids:
        downstream_task = db.get(Task, downstream_id)
        if downstream_task is None:
            continue
        eligible, reasons = check_completion_eligibility(db, task_id=downstream_id)
        downstream_task.completion_locked = not eligible
        downstream_task.completion_lock_reasons = reasons

    db.flush()
