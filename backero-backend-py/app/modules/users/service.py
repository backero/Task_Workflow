"""Users management business logic — ported from Task_Workflow's
user.routes.js core endpoints (list/create/get/update/activate/deactivate/
me-profile). Deliberately NOT ported (Phase 1c core vs later): bulk Excel
import/template (import.service.js), avatar upload (Cloudinary) — both
external-integration/file-processing features, not core directory
management."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.core.pagination import Page, PageParams
from app.core.security import hash_password
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.schemas.workflow_user import UserCreateRequest, UserProfileUpdateRequest, UserResponse, UserUpdateRequest


def _get_user_or_404(db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID) -> WorkflowUser:
    user = db.execute(
        select(WorkflowUser).where(WorkflowUser.id == user_id, WorkflowUser.organization_id == org_id)
    ).scalar_one_or_none()
    if user is None:
        raise NotFoundError("User not found.")
    return user


def _assert_reports_to_in_org(db: Session, *, org_id: uuid.UUID, reports_to_id: uuid.UUID | None) -> None:
    if reports_to_id is None:
        return
    _get_user_or_404(db, org_id=org_id, user_id=reports_to_id)


def list_users(
    db: Session,
    *,
    org_id: uuid.UUID,
    page_params: PageParams,
    department_id: uuid.UUID | None,
    role: WorkflowRole | None,
    search: str | None,
    is_active: bool | None,
) -> Page[UserResponse]:
    conditions = [WorkflowUser.organization_id == org_id, WorkflowUser.deleted_at.is_(None)]
    if department_id is not None:
        conditions.append(WorkflowUser.department_id == department_id)
    if role is not None:
        conditions.append(WorkflowUser.role == role)
    if is_active is not None:
        conditions.append(WorkflowUser.is_active == is_active)
    if search:
        like = f"%{search}%"
        conditions.append(
            or_(WorkflowUser.first_name.ilike(like), WorkflowUser.last_name.ilike(like), WorkflowUser.email.ilike(like))
        )

    total = db.execute(select(func.count(WorkflowUser.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(WorkflowUser)
            .where(*conditions)
            .order_by(WorkflowUser.first_name.asc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[UserResponse](
        items=[UserResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def create_user(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: UserCreateRequest) -> WorkflowUser:
    email = data.email.lower().strip()
    existing_email = db.execute(
        select(WorkflowUser).where(WorkflowUser.organization_id == org_id, WorkflowUser.email == email)
    ).scalar_one_or_none()
    if existing_email is not None:
        raise AppError("email_exists", "A user with this email already exists in your organization.", status_code=409)

    if data.phone:
        existing_phone = db.execute(
            select(WorkflowUser).where(WorkflowUser.organization_id == org_id, WorkflowUser.phone == data.phone)
        ).scalar_one_or_none()
        if existing_phone is not None:
            raise AppError(
                "phone_exists", "A user with this phone number already exists in your organization.", status_code=409
            )

    _assert_reports_to_in_org(db, org_id=org_id, reports_to_id=data.reports_to_id)

    user = WorkflowUser(
        organization_id=org_id,
        first_name=data.first_name,
        last_name=data.last_name,
        email=email,
        hashed_password=hash_password(data.password),
        phone=data.phone,
        role=data.role,
        department_id=data.department_id,
        designation=data.designation,
        reports_to_id=data.reports_to_id,
        created_by_id=actor.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID) -> WorkflowUser:
    return _get_user_or_404(db, org_id=org_id, user_id=user_id)


def update_user(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, user_id: uuid.UUID, data: UserUpdateRequest
) -> WorkflowUser:
    user = _get_user_or_404(db, org_id=org_id, user_id=user_id)
    updates = data.model_dump(exclude_unset=True)
    if "reports_to_id" in updates:
        _assert_reports_to_in_org(db, org_id=org_id, reports_to_id=updates["reports_to_id"])
    for field, value in updates.items():
        setattr(user, field, value)
    user.updated_by_id = actor.id
    db.commit()
    db.refresh(user)
    return user


def update_own_profile(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: UserProfileUpdateRequest
) -> WorkflowUser:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(actor, field, value)
    db.commit()
    db.refresh(actor)
    return actor


def set_active(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, user_id: uuid.UUID, active: bool
) -> WorkflowUser:
    user = _get_user_or_404(db, org_id=org_id, user_id=user_id)
    user.is_active = active
    user.updated_by_id = actor.id
    db.commit()
    db.refresh(user)
    return user
