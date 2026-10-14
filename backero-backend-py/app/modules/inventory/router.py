from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.inventory import StockMovementType
from app.models.workflow_user import WorkflowUser
from app.modules.inventory import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user
from app.schemas.inventory import (
    AdjustmentRequest,
    BatchInput,
    InventoryAnalyticsResponse,
    InventoryItemCreateRequest,
    InventoryItemResponse,
    InventoryItemUpdateRequest,
    RawMaterialStatsResponse,
    StockInRequest,
    StockMovementResponse,
    StockOutRequest,
)

router = APIRouter(prefix="/workflow/inventory", tags=["workflow-inventory"])


@router.get("/items", response_model=Page[InventoryItemResponse])
def list_items(
    category: str | None = Query(default=None),
    is_raw_material: bool | None = Query(default=None),
    low_stock: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[InventoryItemResponse]:
    return service.list_items(
        db,
        org_id=current_user.organization_id,
        page_params=page_params,
        category=category,
        is_raw_material=is_raw_material,
        low_stock=low_stock,
        search=search,
    )


@router.get("/raw-materials/stats", response_model=RawMaterialStatsResponse)
def get_raw_material_stats(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> RawMaterialStatsResponse:
    return service.get_raw_material_stats(db, org_id=current_user.organization_id)


@router.get("/alerts", response_model=list[InventoryItemResponse])
def get_alerts(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[InventoryItemResponse]:
    return service.get_alerts(db, org_id=current_user.organization_id)


@router.get("/analytics", response_model=InventoryAnalyticsResponse)
def get_analytics(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> InventoryAnalyticsResponse:
    data = service.get_analytics(db, org_id=current_user.organization_id)
    return InventoryAnalyticsResponse.model_validate(data)


@router.get("/movements", response_model=Page[StockMovementResponse])
def list_movements(
    product_id: uuid.UUID | None = Query(default=None),
    type: StockMovementType | None = Query(default=None),  # noqa: A002
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[StockMovementResponse]:
    return service.list_movements(
        db, org_id=current_user.organization_id, page_params=page_params, product_id=product_id, movement_type=type
    )


@router.post("/stock-in", response_model=InventoryItemResponse)
def stock_in(
    body: StockInRequest, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> InventoryItemResponse:
    item = service.stock_in(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return InventoryItemResponse.model_validate(item)


@router.post("/stock-out", response_model=InventoryItemResponse)
def stock_out(
    body: StockOutRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    item = service.stock_out(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return InventoryItemResponse.model_validate(item)


@router.post("/adjustment", response_model=InventoryItemResponse)
def adjustment(
    body: AdjustmentRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    item = service.adjustment(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return InventoryItemResponse.model_validate(item)


@router.get("/items/{item_id}", response_model=InventoryItemResponse)
def get_item(
    item_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> InventoryItemResponse:
    item = service.get_item(db, org_id=current_user.organization_id, item_id=item_id)
    return InventoryItemResponse.model_validate(item)


@router.post("/items", response_model=InventoryItemResponse, status_code=201)
def create_item(
    body: InventoryItemCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    item = service.create_item(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return InventoryItemResponse.model_validate(item)


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
def update_item(
    item_id: uuid.UUID,
    body: InventoryItemUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    item = service.update_item(db, org_id=current_user.organization_id, actor=current_user, item_id=item_id, data=body)
    return InventoryItemResponse.model_validate(item)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(
    item_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> None:
    service.delete_item(db, org_id=current_user.organization_id, item_id=item_id)


@router.post("/items/{item_id}/batches", response_model=InventoryItemResponse, status_code=201)
def add_batch(
    item_id: uuid.UUID,
    body: BatchInput,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    item = service.add_batch(db, org_id=current_user.organization_id, actor=current_user, item_id=item_id, data=body)
    return InventoryItemResponse.model_validate(item)


@router.put("/items/{item_id}/batches/{batch_id}", response_model=InventoryItemResponse)
def update_batch(
    item_id: uuid.UUID,
    batch_id: str,
    body: BatchInput,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InventoryItemResponse:
    item = service.update_batch(db, org_id=current_user.organization_id, item_id=item_id, batch_id=batch_id, data=body)
    return InventoryItemResponse.model_validate(item)
