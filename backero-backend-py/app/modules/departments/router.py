from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.departments import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.workflow_department import DepartmentCreateRequest, DepartmentResponse, DepartmentUpdateRequest

router = APIRouter(prefix="/workflow/departments", tags=["workflow-departments"])


@router.get("", response_model=list[DepartmentResponse])
def list_departments(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[DepartmentResponse]:
    depts = service.list_departments(db, org_id=current_user.organization_id)
    return [DepartmentResponse.model_validate(d) for d in depts]


@router.post(
    "",
    response_model=DepartmentResponse,
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def create_department(
    body: DepartmentCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DepartmentResponse:
    dept = service.create_department(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return DepartmentResponse.model_validate(dept)


@router.put(
    "/{department_id}",
    response_model=DepartmentResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def update_department(
    department_id: uuid.UUID,
    body: DepartmentUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> DepartmentResponse:
    dept = service.update_department(
        db, org_id=current_user.organization_id, actor=current_user, department_id=department_id, data=body
    )
    return DepartmentResponse.model_validate(dept)


@router.delete(
    "/{department_id}",
    status_code=204,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def delete_department(
    department_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.delete_department(db, org_id=current_user.organization_id, department_id=department_id)
