from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.workflow_user import WorkflowRole, WorkflowUser
from app.modules.catalog import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user, require_workflow_role
from app.schemas.catalog import (
    CatalogProductCreateRequest,
    CatalogProductResponse,
    CatalogProductUpdateRequest,
    CatalogStatsResponse,
    FormulationVersionCreateRequest,
    FormulationVersionUpdateRequest,
    ResolvedIngredient,
    ResolveIngredientsRequest,
)

router = APIRouter(prefix="/workflow/catalog", tags=["workflow-catalog"])


@router.get("/stats", response_model=CatalogStatsResponse)
def get_stats(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> CatalogStatsResponse:
    return CatalogStatsResponse.model_validate(service.get_stats(db, org_id=current_user.organization_id))


@router.get("/products", response_model=list[CatalogProductResponse])
def list_products(
    search: str | None = Query(default=None),
    category: str | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[CatalogProductResponse]:
    products = service.list_products(db, org_id=current_user.organization_id, search=search, category=category)
    return [service.get_product(db, org_id=current_user.organization_id, product_id=p.id) for p in products]


@router.post(
    "/products",
    response_model=CatalogProductResponse,
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def create_product(
    body: CatalogProductCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CatalogProductResponse:
    return service.create_product(db, org_id=current_user.organization_id, actor=current_user, data=body)


@router.post("/resolve-ingredients", response_model=list[ResolvedIngredient])
def resolve_ingredients(
    body: ResolveIngredientsRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[ResolvedIngredient]:
    return service.resolve_ingredients(db, org_id=current_user.organization_id, actor=current_user, data=body)


@router.get("/products/{product_id}", response_model=CatalogProductResponse)
def get_product(
    product_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CatalogProductResponse:
    return service.get_product(db, org_id=current_user.organization_id, product_id=product_id)


@router.put(
    "/products/{product_id}",
    response_model=CatalogProductResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def update_product(
    product_id: uuid.UUID,
    body: CatalogProductUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CatalogProductResponse:
    return service.update_product(db, org_id=current_user.organization_id, product_id=product_id, data=body)


@router.delete(
    "/products/{product_id}", status_code=204, dependencies=[Depends(require_workflow_role(WorkflowRole.ADMIN))]
)
def delete_product(
    product_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.delete_product(db, org_id=current_user.organization_id, product_id=product_id)


@router.post(
    "/products/{product_id}/formulation-versions",
    response_model=CatalogProductResponse,
    status_code=201,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def add_formulation_version(
    product_id: uuid.UUID,
    body: FormulationVersionCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CatalogProductResponse:
    return service.add_formulation_version(
        db, org_id=current_user.organization_id, actor=current_user, product_id=product_id, data=body
    )


@router.put(
    "/products/{product_id}/formulation-versions/{version_id}",
    response_model=CatalogProductResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def update_formulation_version(
    product_id: uuid.UUID,
    version_id: uuid.UUID,
    body: FormulationVersionUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CatalogProductResponse:
    return service.update_formulation_version(
        db, org_id=current_user.organization_id, product_id=product_id, version_id=version_id, data=body
    )


@router.post(
    "/products/{product_id}/formulation-versions/{version_id}/activate",
    response_model=CatalogProductResponse,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def activate_formulation_version(
    product_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> CatalogProductResponse:
    return service.activate_formulation_version(
        db, org_id=current_user.organization_id, product_id=product_id, version_id=version_id
    )


@router.delete(
    "/products/{product_id}/formulation-versions/{version_id}",
    status_code=204,
    dependencies=[Depends(require_workflow_role(WorkflowRole.MANAGER))],
)
def delete_formulation_version(
    product_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.delete_formulation_version(
        db, org_id=current_user.organization_id, product_id=product_id, version_id=version_id
    )
