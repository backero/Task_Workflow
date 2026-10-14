from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.production import ProductionOrderStatus, ProductionUsageType
from app.models.workflow_user import WorkflowUser
from app.modules.production import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user
from app.schemas.production import (
    FinalQCRequest,
    ProcessStepRequest,
    ProductionCustomerCreateRequest,
    ProductionCustomerResponse,
    ProductionCustomerUpdateRequest,
    ProductionOrderCreateRequest,
    ProductionOrderEditRequest,
    ProductionOrderResponse,
    ProductionStatsResponse,
    ProductionUsageResponse,
    QualityCheckRequest,
    StatusUpdateRequest,
    UsageIssueRequest,
    UsageReturnRequest,
    WeighingRequest,
)

router = APIRouter(prefix="/workflow/production", tags=["workflow-production"])


# --- Production Customers ---


@router.get("/customers", response_model=list[ProductionCustomerResponse])
def list_customers(
    search: str | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[ProductionCustomerResponse]:
    customers = service.list_customers(db, org_id=current_user.organization_id, search=search)
    return [ProductionCustomerResponse.model_validate(c) for c in customers]


@router.post("/customers", response_model=ProductionCustomerResponse, status_code=201)
def create_customer(
    body: ProductionCustomerCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionCustomerResponse:
    customer = service.create_customer(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return ProductionCustomerResponse.model_validate(customer)


@router.patch("/customers/{customer_id}", response_model=ProductionCustomerResponse)
def update_customer(
    customer_id: uuid.UUID,
    body: ProductionCustomerUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionCustomerResponse:
    customer = service.update_customer(db, org_id=current_user.organization_id, customer_id=customer_id, data=body)
    return ProductionCustomerResponse.model_validate(customer)


# --- Production Usage ---


@router.get("/usage", response_model=list[ProductionUsageResponse])
def list_usage(
    material_id: uuid.UUID | None = Query(default=None),
    type: ProductionUsageType | None = Query(default=None),  # noqa: A002
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[ProductionUsageResponse]:
    rows = service.list_usage(db, org_id=current_user.organization_id, material_id=material_id, usage_type=type)
    return [ProductionUsageResponse.model_validate(r) for r in rows]


@router.post("/usage", response_model=ProductionUsageResponse, status_code=201)
def record_issue(
    body: UsageIssueRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionUsageResponse:
    usage = service.record_issue(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return ProductionUsageResponse.model_validate(usage)


@router.post("/usage/{issue_id}/return", response_model=ProductionUsageResponse, status_code=201)
def record_return(
    issue_id: uuid.UUID,
    body: UsageReturnRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionUsageResponse:
    usage = service.record_return(
        db, org_id=current_user.organization_id, actor=current_user, issue_id=issue_id, data=body
    )
    return ProductionUsageResponse.model_validate(usage)


# --- Production Orders ---


@router.get("/orders", response_model=Page[ProductionOrderResponse])
def list_orders(
    status: ProductionOrderStatus | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[ProductionOrderResponse]:
    return service.list_orders(
        db, org_id=current_user.organization_id, page_params=page_params, status=status, search=search
    )


@router.post("/orders", response_model=ProductionOrderResponse, status_code=201)
def create_order(
    body: ProductionOrderCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.create_order(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return ProductionOrderResponse.model_validate(order)


@router.get("/orders/stats/overview", response_model=ProductionStatsResponse)
def get_stats_overview(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> ProductionStatsResponse:
    return ProductionStatsResponse(by_status=service.get_stats_overview(db, org_id=current_user.organization_id))


@router.get("/orders/{order_id}", response_model=ProductionOrderResponse)
def get_order(
    order_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> ProductionOrderResponse:
    order = service.get_order(db, org_id=current_user.organization_id, order_id=order_id)
    return ProductionOrderResponse.model_validate(order)


@router.patch("/orders/{order_id}/status", response_model=ProductionOrderResponse)
def update_order_status(
    order_id: uuid.UUID,
    body: StatusUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.update_order_status(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/quality-check", response_model=ProductionOrderResponse, status_code=201)
def add_quality_check(
    order_id: uuid.UUID,
    body: QualityCheckRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.add_quality_check(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.delete("/orders/{order_id}", status_code=204)
def delete_order(
    order_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> None:
    service.delete_order(db, org_id=current_user.organization_id, order_id=order_id)


@router.patch("/orders/{order_id}/order", response_model=ProductionOrderResponse)
def update_order_edit(
    order_id: uuid.UUID,
    body: ProductionOrderEditRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.update_order_edit(db, org_id=current_user.organization_id, order_id=order_id, data=body)
    return ProductionOrderResponse.model_validate(order)


@router.patch("/orders/{order_id}/work-assignment", response_model=ProductionOrderResponse)
def apply_work_assignment(
    order_id: uuid.UUID,
    body: dict[str, object],
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.apply_work_assignment(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/procurement/confirm", response_model=ProductionOrderResponse)
def confirm_procurement(
    order_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> ProductionOrderResponse:
    order = service.confirm_procurement(db, org_id=current_user.organization_id, actor=current_user, order_id=order_id)
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/weighing", response_model=ProductionOrderResponse)
def weigh_ingredient(
    order_id: uuid.UUID,
    body: WeighingRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.weigh_ingredient(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/process-step", response_model=ProductionOrderResponse)
def complete_process_step(
    order_id: uuid.UUID,
    body: ProcessStepRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.complete_process_step(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/advance", response_model=ProductionOrderResponse)
def advance_to_bulk_qc(
    order_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> ProductionOrderResponse:
    order = service.advance_to_bulk_qc(db, org_id=current_user.organization_id, actor=current_user, order_id=order_id)
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/bulk-qc", response_model=ProductionOrderResponse)
def submit_bulk_qc(
    order_id: uuid.UUID,
    body: dict[str, object],
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.submit_bulk_qc(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/packaging", response_model=ProductionOrderResponse)
def submit_packaging(
    order_id: uuid.UUID,
    body: dict[str, object],
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.submit_packaging(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/final-qc", response_model=ProductionOrderResponse)
def submit_final_qc(
    order_id: uuid.UUID,
    body: FinalQCRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.submit_final_qc(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)


@router.post("/orders/{order_id}/dispatch", response_model=ProductionOrderResponse)
def dispatch_order(
    order_id: uuid.UUID,
    body: dict[str, object],
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> ProductionOrderResponse:
    order = service.dispatch_order(
        db, org_id=current_user.organization_id, actor=current_user, order_id=order_id, data=body
    )
    return ProductionOrderResponse.model_validate(order)
