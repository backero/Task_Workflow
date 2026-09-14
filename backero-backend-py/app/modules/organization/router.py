from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.organization import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.workflow_organization import OrganizationResponse, OrganizationUpdateRequest

router = APIRouter(prefix="/workflow/organizations", tags=["workflow-organization"])


@router.get("/me", response_model=OrganizationResponse)
def get_my_organization(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> OrganizationResponse:
    org = service.get_organization(db, org_id=current_user.organization_id)
    return OrganizationResponse.model_validate(org)


@router.put(
    "/me", response_model=OrganizationResponse, dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))]
)
def update_my_organization(
    body: OrganizationUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    org = service.update_organization(db, org_id=current_user.organization_id, data=body)
    return OrganizationResponse.model_validate(org)
