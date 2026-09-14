"""CRM Q&A Inbox (ProductionQuery) business logic — ported from
crm.controller.js's raiseQuery/getLeadQueries/getQueries/answerQuery/
updateQuery/updateQueryStatus/setQueryDeleted/linkQuery. Deliberately NOT
ported: file-attachment endpoints (Cloudinary, deferred like every other
upload endpoint)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError, PermissionDeniedError
from app.models.lead import Lead, LeadStatus
from app.models.production_query import ProductionQuery, QueryStatus
from app.models.workflow_department import WorkflowDepartment
from app.models.workflow_user import WORKFLOW_ROLE_HIERARCHY, WorkflowRole, WorkflowUser
from app.modules.leads.service import get_lead_or_404, promote_to_sample_if_needed
from app.schemas.production_query import (
    QueryAnswerRequest,
    QueryCreateRequest,
    QueryLinkRequest,
    QuerySetDeletedRequest,
    QueryStatusUpdateRequest,
    QueryUpdateRequest,
)

_STATUS_TRANSITIONS = {QueryStatus.IN_PROGRESS: QueryStatus.PENDING, QueryStatus.CLOSED: QueryStatus.ANSWERED}


def _get_query_or_404(db: Session, *, org_id: uuid.UUID, query_id: uuid.UUID) -> ProductionQuery:
    query = db.execute(
        select(ProductionQuery).where(ProductionQuery.id == query_id, ProductionQuery.organization_id == org_id)
    ).scalar_one_or_none()
    if query is None:
        raise NotFoundError("Query not found.")
    return query


def raise_query(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: QueryCreateRequest
) -> ProductionQuery:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)

    derived_title = (data.title or data.description).strip()[:80]
    answered_now = (data.answer or "").strip()
    now = datetime.now(UTC)

    query = ProductionQuery(
        organization_id=org_id,
        lead_id=lead.id,
        lead_name=lead.name,
        raised_by_id=actor.id,
        assigned_to_id=data.assigned_to_id or lead.in_charge_id or lead.assigned_to_id,
        title=derived_title,
        description=data.description,
        asked_via=data.asked_via or "Phone Call",
        urgency=data.urgency,
        topic=data.topic or "General",
        pre_query_status=lead.status.value,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        target_price=data.target_price,
        benchmark_notes=data.benchmark_notes,
        packaging_intent=data.packaging_intent,
        internal_notes=data.internal_notes,
        status=QueryStatus.ANSWERED if answered_now else QueryStatus.PENDING,
        answer=answered_now or None,
        answered_by_id=actor.id if answered_now else None,
        answered_at=now if answered_now else None,
    )
    db.add(query)

    if lead.status in (LeadStatus.NEW, LeadStatus.FOLLOWUP):
        promote_to_sample_if_needed(db, lead=lead, actor=actor)
    elif not answered_now and lead.status not in (LeadStatus.SAMPLE, LeadStatus.IN_PROGRESS):
        lead.status = LeadStatus.QUERY_PENDING
    lead.updated_by_id = actor.id

    db.commit()
    db.refresh(query)
    return query


def get_lead_queries(db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID) -> list[ProductionQuery]:
    get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    return list(
        db.execute(
            select(ProductionQuery)
            .where(ProductionQuery.lead_id == lead_id, ProductionQuery.organization_id == org_id)
            .order_by(ProductionQuery.created_at.desc())
        )
        .scalars()
        .all()
    )


def list_queries(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, status: QueryStatus | None
) -> list[ProductionQuery]:
    conditions = [ProductionQuery.organization_id == org_id]
    if status is not None:
        conditions.append(ProductionQuery.status == status)

    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1)
    if actor_level <= WORKFLOW_ROLE_HIERARCHY[WorkflowRole.TEAM_LEAD]:
        # Source checks `req.user.department === 'Production'` (a department
        # *name* check) — not just "has some department". Resolve the name
        # via the real WorkflowDepartment table rather than assuming any
        # assigned department counts.
        is_production_dept = False
        if actor.department_id is not None:
            dept_name = db.execute(
                select(WorkflowDepartment.name).where(WorkflowDepartment.id == actor.department_id)
            ).scalar_one_or_none()
            is_production_dept = dept_name == "Production"

        if is_production_dept:
            conditions.append(or_(ProductionQuery.assigned_to_id == actor.id, ProductionQuery.assigned_to_id.is_(None)))
        else:
            conditions.append(ProductionQuery.raised_by_id == actor.id)

    return list(
        db.execute(
            select(ProductionQuery)
            .where(*conditions)
            .order_by(ProductionQuery.status.asc(), ProductionQuery.created_at.desc())
        )
        .scalars()
        .all()
    )


def answer_query(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, query_id: uuid.UUID, data: QueryAnswerRequest
) -> ProductionQuery:
    query = _get_query_or_404(db, org_id=org_id, query_id=query_id)

    actor_level = WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1)
    if (
        query.assigned_to_id is not None
        and query.assigned_to_id != actor.id
        and actor_level < WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MANAGER]
    ):
        raise PermissionDeniedError("Only the person this query is assigned to (or a manager) can reply.")

    query.status = QueryStatus.ANSWERED
    query.answer = data.answer
    query.answered_by_id = actor.id
    query.answered_at = datetime.now(UTC)

    lead = db.get(Lead, query.lead_id)
    if lead is not None and lead.status == LeadStatus.QUERY_PENDING:
        try:
            lead.status = LeadStatus(query.pre_query_status) if query.pre_query_status else LeadStatus.INTERESTED
        except ValueError:
            lead.status = LeadStatus.INTERESTED
        lead.updated_by_id = actor.id

    db.commit()
    db.refresh(query)
    return query


def update_query(db: Session, *, org_id: uuid.UUID, query_id: uuid.UUID, data: QueryUpdateRequest) -> ProductionQuery:
    query = _get_query_or_404(db, org_id=org_id, query_id=query_id)

    if data.description is not None:
        if not data.description.strip():
            raise AppError("invalid_description", "Question is required", status_code=400)
        query.description = data.description
        if data.title is None:
            query.title = data.description.strip()[:80]
    if data.title is not None:
        query.title = data.title.strip()[:80] or query.title
    if data.topic is not None:
        query.topic = data.topic
    if data.asked_via is not None:
        query.asked_via = data.asked_via
    query.edited_at = datetime.now(UTC)

    db.commit()
    db.refresh(query)
    return query


def update_query_status(
    db: Session, *, org_id: uuid.UUID, query_id: uuid.UUID, data: QueryStatusUpdateRequest
) -> ProductionQuery:
    query = _get_query_or_404(db, org_id=org_id, query_id=query_id)

    required_current = _STATUS_TRANSITIONS.get(data.status)
    if required_current is None or query.status != required_current:
        raise AppError("invalid_transition", "Invalid status transition.", status_code=400)
    query.status = data.status

    db.commit()
    db.refresh(query)
    return query


def set_query_deleted(
    db: Session, *, org_id: uuid.UUID, query_id: uuid.UUID, data: QuerySetDeletedRequest
) -> ProductionQuery:
    query = _get_query_or_404(db, org_id=org_id, query_id=query_id)
    query.deleted = data.deleted
    db.commit()
    db.refresh(query)
    return query


def link_query(db: Session, *, org_id: uuid.UUID, query_id: uuid.UUID, data: QueryLinkRequest) -> ProductionQuery:
    """Stamps the Q&A tab's convert-to-action icons once something was
    actually created/linked for this query elsewhere (a new formula, a
    product link, a versioned sample) — no validation against
    LeadProductLink, matching the source's own unvalidated stamp."""
    query = _get_query_or_404(db, org_id=org_id, query_id=query_id)
    if data.product_link_id is not None:
        query.linked_product_link_id = data.product_link_id
    if data.converted_to is not None:
        query.converted_to = data.converted_to
    db.commit()
    db.refresh(query)
    return query
