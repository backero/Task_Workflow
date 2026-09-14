from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.users import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.workflow_user import UserCreateRequest, UserProfileUpdateRequest, UserResponse, UserUpdateRequest

router = APIRouter(prefix="/workflow/users", tags=["workflow-users"])


@router.get("", response_model=Page[UserResponse])
def list_users(
    department_id: uuid.UUID | None = Query(default=None),
    role: WorkflowRole | None = Query(default=None),
    search: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[UserResponse]:
    return service.list_users(
        db,
        org_id=current_user.organization_id,
        page_params=page_params,
        department_id=department_id,
        role=role,
        search=search,
        is_active=is_active,
    )


@router.post(
    "", response_model=UserResponse, status_code=201, dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))]
)
def create_user(
    body: UserCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = service.create_user(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return UserResponse.model_validate(user)


@router.patch("/me/profile", response_model=UserResponse)
def update_own_profile(
    body: UserProfileUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = service.update_own_profile(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> UserResponse:
    user = service.get_user(db, org_id=current_user.organization_id, user_id=user_id)
    return UserResponse.model_validate(user)


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = service.update_user(db, org_id=current_user.organization_id, actor=current_user, user_id=user_id, data=body)
    return UserResponse.model_validate(user)


@router.patch(
    "/{user_id}/activate",
    response_model=UserResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def activate_user(
    user_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = service.set_active(db, org_id=current_user.organization_id, actor=current_user, user_id=user_id, active=True)
    return UserResponse.model_validate(user)


@router.patch(
    "/{user_id}/deactivate",
    response_model=UserResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def deactivate_user(
    user_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = service.set_active(
        db, org_id=current_user.organization_id, actor=current_user, user_id=user_id, active=False
    )
    return UserResponse.model_validate(user)
