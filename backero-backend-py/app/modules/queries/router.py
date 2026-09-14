from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.production_query import QueryStatus
from app.models.workflow_user import WorkflowUser
from app.modules.queries import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user
from app.schemas.production_query import (
    QueryAnswerRequest,
    QueryCreateRequest,
    QueryLinkRequest,
    QueryResponse,
    QuerySetDeletedRequest,
    QueryStatusUpdateRequest,
    QueryUpdateRequest,
)

router = APIRouter(prefix="/workflow", tags=["workflow-crm-queries"])


@router.post("/leads/{lead_id}/query", response_model=QueryResponse, status_code=201)
def raise_query(
    lead_id: uuid.UUID,
    body: QueryCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> QueryResponse:
    query = service.raise_query(db, org_id=current_user.organization_id, actor=current_user, lead_id=lead_id, data=body)
    return QueryResponse.model_validate(query)


@router.get("/leads/{lead_id}/queries", response_model=list[QueryResponse])
def get_lead_queries(
    lead_id: uuid.UUID, current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> list[QueryResponse]:
    queries = service.get_lead_queries(db, org_id=current_user.organization_id, lead_id=lead_id)
    return [QueryResponse.model_validate(q) for q in queries]


@router.get("/queries", response_model=list[QueryResponse])
def list_queries(
    status: QueryStatus | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> list[QueryResponse]:
    queries = service.list_queries(db, org_id=current_user.organization_id, actor=current_user, status=status)
    return [QueryResponse.model_validate(q) for q in queries]


@router.put("/queries/{query_id}/reply", response_model=QueryResponse)
def answer_query(
    query_id: uuid.UUID,
    body: QueryAnswerRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> QueryResponse:
    query = service.answer_query(
        db, org_id=current_user.organization_id, actor=current_user, query_id=query_id, data=body
    )
    return QueryResponse.model_validate(query)


@router.put("/queries/{query_id}", response_model=QueryResponse)
def update_query(
    query_id: uuid.UUID,
    body: QueryUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> QueryResponse:
    query = service.update_query(db, org_id=current_user.organization_id, query_id=query_id, data=body)
    return QueryResponse.model_validate(query)


@router.put("/queries/{query_id}/status", response_model=QueryResponse)
def update_query_status(
    query_id: uuid.UUID,
    body: QueryStatusUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> QueryResponse:
    query = service.update_query_status(db, org_id=current_user.organization_id, query_id=query_id, data=body)
    return QueryResponse.model_validate(query)


@router.put("/queries/{query_id}/delete", response_model=QueryResponse)
def set_query_deleted(
    query_id: uuid.UUID,
    body: QuerySetDeletedRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> QueryResponse:
    query = service.set_query_deleted(db, org_id=current_user.organization_id, query_id=query_id, data=body)
    return QueryResponse.model_validate(query)


@router.put("/queries/{query_id}/link", response_model=QueryResponse)
def link_query(
    query_id: uuid.UUID,
    body: QueryLinkRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> QueryResponse:
    query = service.link_query(db, org_id=current_user.organization_id, query_id=query_id, data=body)
    return QueryResponse.model_validate(query)
