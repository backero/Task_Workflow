from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.lead import LeadPriority, LeadStatus
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.leads import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.lead import (
    AssignLeadRequest,
    CommLogCreateRequest,
    CommLogResponse,
    CommLogUpdateRequest,
    DispatchLeadRequest,
    FollowUpCreateRequest,
    FollowUpResponse,
    FormulaCreateRequest,
    FormulaUpdateRequest,
    LeadAnalyticsResponse,
    LeadCreateRequest,
    LeadDetailResponse,
    LeadResponse,
    LeadUpdateRequest,
    PipelineGroupResponse,
    ProductLinkCreateRequest,
    ProductLinkUpdateRequest,
    RepAnalyticsRow,
    SampleCreateRequest,
    SampleFeedbackRequest,
    SampleStatusUpdateRequest,
    SampleUpdateRequest,
    SendUpdateRequest,
    VelocityRow,
)

router = APIRouter(prefix="/workflow/leads", tags=["workflow-crm-leads"])


@router.get("", response_model=Page[LeadResponse])
def list_leads(
    status: LeadStatus | None = Query(default=None),
    source: str | None = Query(default=None),
    assigned_to_id: uuid.UUID | None = Query(default=None),
    priority: LeadPriority | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[LeadResponse]:
    return service.list_leads(
        db,
        org_id=current_user.organization_id,
        actor=current_user,
        page_params=page_params,
        status=status,
        source=source,
        assigned_to_id=assigned_to_id,
        priority=priority,
        search=search,
    )


@router.get("/pipeline", response_model=list[PipelineGroupResponse])
def get_pipeline(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[PipelineGroupResponse]:
    return service.get_pipeline(db, org_id=current_user.organization_id, actor=current_user)


@router.get("/analytics", response_model=LeadAnalyticsResponse)
def get_analytics(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> LeadAnalyticsResponse:
    return service.get_analytics(db, org_id=current_user.organization_id)


@router.get(
    "/analytics/rep",
    response_model=list[RepAnalyticsRow],
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def get_rep_analytics(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[RepAnalyticsRow]:
    return service.get_rep_analytics(db, org_id=current_user.organization_id)


@router.get(
    "/analytics/velocity",
    response_model=list[VelocityRow],
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def get_pipeline_velocity(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[VelocityRow]:
    return service.get_pipeline_velocity(db, org_id=current_user.organization_id)


@router.get("/{lead_id}", response_model=LeadDetailResponse)
def get_lead(
    lead_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> LeadDetailResponse:
    return service.get_lead_detail(db, org_id=current_user.organization_id, lead_id=lead_id)


@router.post("", response_model=LeadResponse, status_code=201)
def create_lead(
    body: LeadCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadResponse:
    lead = service.create_lead(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return LeadResponse.model_validate(lead)


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: uuid.UUID,
    body: LeadUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadResponse:
    lead = service.update_lead(db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body)
    return LeadResponse.model_validate(lead)


@router.delete("/{lead_id}", status_code=204)
def delete_lead(
    lead_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> None:
    service.delete_lead(db, org_id=current_user.organization_id, lead_id=lead_id)


@router.post(
    "/{lead_id}/followup",
    response_model=FollowUpResponse,
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def add_follow_up(
    lead_id: uuid.UUID,
    body: FollowUpCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> FollowUpResponse:
    follow_up = service.add_follow_up(
        db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body
    )
    return FollowUpResponse.model_validate(follow_up)


@router.post(
    "/{lead_id}/assign",
    response_model=LeadResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def assign_lead(
    lead_id: uuid.UUID,
    body: AssignLeadRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadResponse:
    lead = service.assign_lead(db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body)
    return LeadResponse.model_validate(lead)


@router.post(
    "/{lead_id}/comm-log",
    response_model=CommLogResponse,
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def add_comm_log(
    lead_id: uuid.UUID,
    body: CommLogCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CommLogResponse:
    log = service.add_comm_log(db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body)
    return CommLogResponse.model_validate(log)


@router.put(
    "/{lead_id}/comm-log/{log_id}",
    response_model=CommLogResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def update_comm_log(
    lead_id: uuid.UUID,
    log_id: uuid.UUID,
    body: CommLogUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CommLogResponse:
    log = service.update_comm_log(db, org_id=current_user.organization_id, lead_id=lead_id, log_id=log_id, data=body)
    return CommLogResponse.model_validate(log)


@router.delete(
    "/{lead_id}/comm-log/{log_id}",
    status_code=204,
    dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))],
)
def delete_comm_log(
    lead_id: uuid.UUID,
    log_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.delete_comm_log(db, org_id=current_user.organization_id, lead_id=lead_id, log_id=log_id)


@router.post("/{lead_id}/dispatch", response_model=LeadResponse)
def dispatch_lead(
    lead_id: uuid.UUID,
    body: DispatchLeadRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadResponse:
    lead = service.dispatch_lead(
        db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body
    )
    return LeadResponse.model_validate(lead)


@router.post(
    "/{lead_id}/send-update",
    response_model=LeadResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def send_update(
    lead_id: uuid.UUID,
    body: SendUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadResponse:
    lead = service.send_update(db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body)
    return LeadResponse.model_validate(lead)


# --- Product links ---


@router.post("/{lead_id}/products", response_model=LeadDetailResponse, status_code=201)
def add_product_link(
    lead_id: uuid.UUID,
    body: ProductLinkCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.add_product_link(
        db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body
    )


@router.put("/{lead_id}/products/{product_id}", response_model=LeadDetailResponse)
def update_product_link(
    lead_id: uuid.UUID,
    product_id: str,
    body: ProductLinkUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.update_product_link(
        db, org_id=current_user.organization_id, lead_id=lead_id, product_id=product_id, data=body
    )


@router.delete("/{lead_id}/products/{product_id}", response_model=LeadDetailResponse)
def delete_product_link(
    lead_id: uuid.UUID,
    product_id: str,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.delete_product_link(db, org_id=current_user.organization_id, lead_id=lead_id, product_id=product_id)


# --- Formulas ---


@router.post("/{lead_id}/formulas", response_model=LeadDetailResponse, status_code=201)
def add_formula(
    lead_id: uuid.UUID,
    body: FormulaCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.add_formula(db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body)


@router.put("/{lead_id}/formulas/{formula_id}", response_model=LeadDetailResponse)
def update_formula(
    lead_id: uuid.UUID,
    formula_id: str,
    body: FormulaUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.update_formula(
        db, org_id=current_user.organization_id, lead_id=lead_id, formula_id=formula_id, data=body
    )


# --- Samples ---


@router.post("/{lead_id}/samples", response_model=LeadDetailResponse, status_code=201)
def create_sample(
    lead_id: uuid.UUID,
    body: SampleCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.create_sample(
        db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body
    )


@router.put("/{lead_id}/samples/{sample_id}", response_model=LeadDetailResponse)
def update_sample(
    lead_id: uuid.UUID,
    sample_id: str,
    body: SampleUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.update_sample(
        db, org_id=current_user.organization_id, lead_id=lead_id, sample_id=sample_id, data=body
    )


@router.put("/{lead_id}/samples/{sample_id}/status", response_model=LeadDetailResponse)
def update_sample_status(
    lead_id: uuid.UUID,
    sample_id: str,
    body: SampleStatusUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.update_sample_status(
        db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, sample_id=sample_id, data=body
    )


@router.post("/{lead_id}/samples/{sample_id}/feedback", response_model=LeadDetailResponse, status_code=201)
def add_sample_feedback(
    lead_id: uuid.UUID,
    sample_id: str,
    body: SampleFeedbackRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> LeadDetailResponse:
    return service.add_sample_feedback(
        db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, sample_id=sample_id, data=body
    )
