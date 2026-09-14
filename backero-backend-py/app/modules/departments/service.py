"""Departments management business logic — ported from Task_Workflow's
department.routes.js core endpoints (list/create/update/delete). Deliberately
NOT ported (Phase 1c core vs later): POST /seed (auto-creates departments
from legacy free-text Task.department strings) — doesn't apply cleanly since
the new Task model uses a real department_id FK, not a department string."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.models.workflow_department import WorkflowDepartment
from app.models.workflow_user import WorkflowUser
from app.schemas.workflow_department import DepartmentCreateRequest, DepartmentUpdateRequest


def list_departments(db: Session, *, org_id: uuid.UUID) -> list[WorkflowDepartment]:
    return list(
        db.execute(
            select(WorkflowDepartment)
            .where(WorkflowDepartment.organization_id == org_id, WorkflowDepartment.deleted_at.is_(None))
            .order_by(WorkflowDepartment.name.asc())
        )
        .scalars()
        .all()
    )


def _get_department_or_404(db: Session, *, org_id: uuid.UUID, department_id: uuid.UUID) -> WorkflowDepartment:
    dept = db.execute(
        select(WorkflowDepartment).where(
            WorkflowDepartment.id == department_id, WorkflowDepartment.organization_id == org_id
        )
    ).scalar_one_or_none()
    if dept is None:
        raise NotFoundError("Department not found.")
    return dept


def create_department(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: DepartmentCreateRequest
) -> WorkflowDepartment:
    existing = db.execute(
        select(WorkflowDepartment).where(
            WorkflowDepartment.organization_id == org_id, WorkflowDepartment.name == data.name
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError("department_exists", "A department with this name already exists.", status_code=409)

    dept = WorkflowDepartment(
        organization_id=org_id,
        name=data.name,
        code=data.code,
        description=data.description,
        color=data.color,
        created_by_id=actor.id,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


def update_department(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, department_id: uuid.UUID, data: DepartmentUpdateRequest
) -> WorkflowDepartment:
    dept = _get_department_or_404(db, org_id=org_id, department_id=department_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(dept, field, value)
    dept.updated_by_id = actor.id
    db.commit()
    db.refresh(dept)
    return dept


def delete_department(db: Session, *, org_id: uuid.UUID, department_id: uuid.UUID) -> None:
    dept = _get_department_or_404(db, org_id=org_id, department_id=department_id)
    db.delete(dept)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # The source (MongoDB) has no FK constraint so this delete always
        # succeeds even with members still assigned to the department; the
        # Postgres FK on workflow_users.department_id makes that a real
        # constraint violation instead of silent orphaned references.
        raise AppError(
            "department_in_use", "Cannot delete a department that still has members assigned to it.", status_code=409
        ) from exc
