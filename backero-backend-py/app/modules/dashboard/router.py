from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.dashboard import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role

router = APIRouter(prefix="/workflow/dashboard", tags=["workflow-dashboard"])


@router.get("/founder", dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))])
def get_founder_dashboard(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> dict[str, object]:
    return service.get_founder_dashboard(db, org_id=current_user.organization_id, actor=current_user)


@router.get("/manager", dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))])
def get_manager_dashboard(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> dict[str, object]:
    return service.get_manager_dashboard(db, org_id=current_user.organization_id, actor=current_user)


@router.get("/employee")
def get_employee_dashboard(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> dict[str, object]:
    return service.get_employee_dashboard(db, org_id=current_user.organization_id, actor=current_user)


@router.get("/department/{department_id}")
def get_department_dashboard(
    department_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return service.get_department_dashboard(db, org_id=current_user.organization_id, department_id=department_id)
