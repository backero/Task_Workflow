"""CRM Leads business logic — ported from crm.controller.js's core lead
functions (getLeads/createLead/getLead/updateLead/deleteLead/getPipeline/
getAnalytics/addFollowUp/assignLead + comm-log) plus Phase 2b's versioned
sample-development subsystem (product links, formulas+versions, versioned
samples), rep/velocity analytics, dispatch, and send-update. See
app/models/lead.py for the full current defer list (file uploads, Google
Sheets sync, convertToTask, sample quotations/invoices, link-production).

`validateStageTransition`'s "moving to In Progress requires an approved
sample or a sent-date" rule is skipped — its precondition data
(`sampleDetails`/`samples[]`) doesn't exist until Phase 2b. The other three
gates (Sample needs product interest + estimated value; Payment Pending
needs a deal value; Lost needs a reason) port cleanly since they only touch
core Lead fields.

Phase 2b's WhatsApp side effects (dispatch confirmation, sample-approved
client message, `send-update`'s actual outbound text) are NOT sent — no
WhatsApp integration exists yet (Phase 5). The underlying state changes
(stage transitions, comm-log/follow-up entries recording that an update
*should* go out) are still ported, since they're real CRM record-keeping
independent of the delivery channel.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError, PermissionDeniedError
from app.core.pagination import Page, PageParams
from app.models.lead import (
    CommunicationLogType,
    FollowUpType,
    FormulaVersionStatus,
    Lead,
    LeadCommunicationLog,
    LeadCustomFormula,
    LeadFollowUp,
    LeadFormulaVersion,
    LeadPriority,
    LeadProductLink,
    LeadSample,
    LeadStageHistoryEntry,
    LeadStatus,
    ProductPaymentStatus,
    SampleStatus,
)
from app.models.notification import NotificationType
from app.models.production_query import ProductionQuery, QueryStatus
from app.models.workflow_user import WORKFLOW_ROLE_HIERARCHY, WorkflowRole, WorkflowUser
from app.modules.notifications.service import create_notification
from app.schemas.lead import (
    AssignLeadRequest,
    CommLogCreateRequest,
    CommLogUpdateRequest,
    DispatchLeadRequest,
    FollowUpCreateRequest,
    FormulaCreateRequest,
    FormulaResponse,
    FormulaUpdateRequest,
    FormulaVersionResponse,
    LeadAnalyticsResponse,
    LeadCreateRequest,
    LeadDetailResponse,
    LeadResponse,
    LeadUpdateRequest,
    PipelineGroupResponse,
    PipelineLeadSummary,
    ProductLinkCreateRequest,
    ProductLinkResponse,
    ProductLinkUpdateRequest,
    RepAnalyticsRow,
    SampleCreateRequest,
    SampleFeedbackRequest,
    SampleResponse,
    SampleStatusUpdateRequest,
    SampleUpdateRequest,
    SendUpdateRequest,
    VelocityRow,
)

# Two specific people (besides admin) may change a lead's In-Charge — a real,
# deliberate business rule in the source (name-hint matching, not a role
# tier), not a generic pattern to generalize away.
_ASSIGNER_NAME_HINTS = ("naven", "vignesh")


def _can_assign_leads(user: WorkflowUser) -> bool:
    if user.role == WorkflowRole.ADMIN:
        return True
    name = f"{user.first_name} {user.last_name}".lower()
    return any(name.startswith(hint) for hint in _ASSIGNER_NAME_HINTS)


def get_lead_or_404(db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID) -> Lead:
    lead = db.execute(select(Lead).where(Lead.id == lead_id, Lead.organization_id == org_id)).scalar_one_or_none()
    if lead is None:
        raise NotFoundError("Lead not found.")
    return lead


def list_leads(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor: WorkflowUser,
    page_params: PageParams,
    status: LeadStatus | None,
    source: str | None,
    assigned_to_id: uuid.UUID | None,
    priority: LeadPriority | None,
    search: str | None,
) -> Page[LeadResponse]:
    conditions = [Lead.organization_id == org_id]
    if WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1) == WORKFLOW_ROLE_HIERARCHY[WorkflowRole.MEMBER]:
        conditions.append(Lead.assigned_to_id == actor.id)
    if status is not None:
        conditions.append(Lead.status == status)
    if source is not None:
        conditions.append(Lead.source == source)
    if assigned_to_id is not None:
        conditions.append(Lead.assigned_to_id == assigned_to_id)
    if priority is not None:
        conditions.append(Lead.priority == priority)
    if search:
        like = f"%{search}%"
        conditions.append(
            or_(Lead.name.ilike(like), Lead.phone.ilike(like), Lead.email.ilike(like), Lead.company.ilike(like))
        )

    total = db.execute(select(func.count(Lead.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(Lead)
            .where(*conditions)
            .order_by(Lead.priority.desc(), Lead.next_follow_up_at.asc().nulls_last(), Lead.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[LeadResponse](
        items=[LeadResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def get_lead(db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID) -> Lead:
    return get_lead_or_404(db, org_id=org_id, lead_id=lead_id)


def create_lead(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: LeadCreateRequest) -> Lead:
    existing = db.execute(
        select(Lead).where(Lead.organization_id == org_id, Lead.phone == data.phone)
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError("lead_exists", f"Lead with phone {data.phone} already exists.", status_code=409)

    initial_status = data.status or LeadStatus.NEW
    now = datetime.now(UTC)
    lead = Lead(
        organization_id=org_id,
        name=data.name,
        email=data.email,
        phone=data.phone,
        phone2=data.phone2,
        whatsapp=data.whatsapp,
        company=data.company,
        designation=data.designation,
        city=data.city,
        state=data.state,
        business_type=data.business_type,
        source=data.source or "Manual Entry",
        status=initial_status,
        priority=data.priority,
        product_interest=data.product_interest,
        estimated_value=data.estimated_value or 0,
        notes=data.notes,
        campaign=data.campaign,
        assigned_to_id=data.assigned_to_id,
        assigned_by_id=actor.id if data.assigned_to_id else None,
        assigned_at=now if data.assigned_to_id else None,
        created_by_id=actor.id,
    )
    db.add(lead)
    db.flush()
    db.add(LeadStageHistoryEntry(lead_id=lead.id, stage=initial_status.value, entered_at=now, moved_by_id=actor.id))
    db.commit()
    db.refresh(lead)
    return lead


def _validate_stage_transition(lead: Lead, new_status: LeadStatus, data: LeadUpdateRequest) -> str | None:
    if new_status == LeadStatus.SAMPLE:
        if not lead.product_interest:
            return "Add product interest before moving to Sample stage"
        if not lead.estimated_value or lead.estimated_value <= 0:
            return "Add estimated value before moving to Sample stage"
    if new_status == LeadStatus.WON:
        if not data.deal_value or data.deal_value <= 0:
            return "Enter confirmed deal value to mark as Payment Pending"
    if new_status == LeadStatus.LOST:
        if not data.lost_reason or not data.lost_reason.strip():
            return "Select a reason for marking this lead as Lost"
    return None


def update_lead(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: LeadUpdateRequest
) -> Lead:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    updates = data.model_dump(exclude_unset=True)

    if "in_charge_id" in updates and updates["in_charge_id"] != lead.in_charge_id and not _can_assign_leads(actor):
        raise PermissionDeniedError("Only admin, Naventhra, or Vignesh can change who is In-Charge of a client.")

    new_status = updates.get("status")
    if new_status is not None and new_status != lead.status:
        gate_error = _validate_stage_transition(lead, new_status, data)
        if gate_error:
            raise AppError("invalid_stage_transition", gate_error, status_code=422)

        now = datetime.now(UTC)
        last_entry = (
            db.execute(
                select(LeadStageHistoryEntry)
                .where(LeadStageHistoryEntry.lead_id == lead.id)
                .order_by(LeadStageHistoryEntry.entered_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if last_entry is not None and last_entry.exited_at is None:
            last_entry.exited_at = now
        db.add(LeadStageHistoryEntry(lead_id=lead.id, stage=new_status.value, entered_at=now, moved_by_id=actor.id))

        if new_status == LeadStatus.WON:
            lead.converted_at = now
        if new_status == LeadStatus.LOST:
            lead.lost_at = now

    for field, value in updates.items():
        setattr(lead, field, value)
    lead.updated_by_id = actor.id

    db.commit()
    db.refresh(lead)
    return lead


def delete_lead(db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID) -> None:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    db.delete(lead)
    db.commit()


def add_follow_up(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: FollowUpCreateRequest
) -> LeadFollowUp:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    now = datetime.now(UTC)

    follow_up = LeadFollowUp(
        lead_id=lead.id,
        scheduled_at=data.scheduled_at,
        type=data.type,
        notes=data.notes,
        outcome=data.outcome,
        next_action=data.next_action,
        performed_by_id=actor.id,
        is_completed=True,
        completed_at=now,
        created_at=now,
    )
    db.add(follow_up)

    lead.last_contacted_at = now
    if data.next_action:
        lead.next_follow_up_at = data.scheduled_at
    lead.is_stale = False
    lead.updated_by_id = actor.id

    db.commit()
    db.refresh(follow_up)
    return follow_up


def assign_lead(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: AssignLeadRequest
) -> Lead:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    assignee = db.execute(
        select(WorkflowUser).where(WorkflowUser.id == data.assigned_to_id, WorkflowUser.organization_id == org_id)
    ).scalar_one_or_none()
    if assignee is None:
        raise NotFoundError("User not found.")

    lead.assigned_to_id = data.assigned_to_id
    lead.assigned_by_id = actor.id
    lead.assigned_at = datetime.now(UTC)

    # Carry the handoff into any of this lead's still-open queries.
    open_queries = (
        db.execute(
            select(ProductionQuery).where(
                ProductionQuery.organization_id == org_id,
                ProductionQuery.lead_id == lead.id,
                ProductionQuery.status.in_([QueryStatus.PENDING, QueryStatus.IN_PROGRESS]),
            )
        )
        .scalars()
        .all()
    )
    for query in open_queries:
        query.assigned_to_id = data.assigned_to_id

    db.commit()
    db.refresh(lead)
    return lead


def get_pipeline(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser) -> list[PipelineGroupResponse]:
    conditions = [Lead.organization_id == org_id]
    if WORKFLOW_ROLE_HIERARCHY.get(actor.role, 1) <= WORKFLOW_ROLE_HIERARCHY[WorkflowRole.TEAM_LEAD]:
        conditions.append(Lead.assigned_to_id == actor.id)

    leads = db.execute(select(Lead).where(*conditions)).scalars().all()

    groups: dict[LeadStatus, list[Lead]] = {}
    for lead in leads:
        groups.setdefault(lead.status, []).append(lead)

    result: list[PipelineGroupResponse] = []
    for status, group_leads in sorted(groups.items(), key=lambda kv: kv[0].value):
        summaries = []
        for lead in group_leads:
            pending = db.execute(
                select(func.count(ProductionQuery.id)).where(
                    ProductionQuery.lead_id == lead.id, ProductionQuery.status == QueryStatus.PENDING
                )
            ).scalar_one()
            answered = db.execute(
                select(func.count(ProductionQuery.id)).where(
                    ProductionQuery.lead_id == lead.id, ProductionQuery.status == QueryStatus.ANSWERED
                )
            ).scalar_one()
            summaries.append(
                PipelineLeadSummary(
                    id=lead.id,
                    name=lead.name,
                    phone=lead.phone,
                    priority=lead.priority,
                    estimated_value=lead.estimated_value,
                    assigned_to_id=lead.assigned_to_id,
                    next_follow_up_at=lead.next_follow_up_at,
                    is_stale=lead.is_stale,
                    last_contacted_at=lead.last_contacted_at,
                    pending_queries=pending,
                    answered_queries=answered,
                )
            )
        result.append(
            PipelineGroupResponse(
                status=status,
                count=len(group_leads),
                total_value=sum(lead.estimated_value for lead in group_leads),
                leads=summaries,
            )
        )
    return result


def get_analytics(db: Session, *, org_id: uuid.UUID) -> LeadAnalyticsResponse:
    total_leads = db.execute(select(func.count(Lead.id)).where(Lead.organization_id == org_id)).scalar_one()
    won_leads = db.execute(
        select(func.count(Lead.id)).where(Lead.organization_id == org_id, Lead.status == LeadStatus.WON)
    ).scalar_one()
    lost_leads = db.execute(
        select(func.count(Lead.id)).where(Lead.organization_id == org_id, Lead.status == LeadStatus.LOST)
    ).scalar_one()

    source_rows = db.execute(
        select(Lead.source, func.count(Lead.id)).where(Lead.organization_id == org_id).group_by(Lead.source)
    ).all()

    now = datetime.now(UTC)
    upcoming = (
        db.execute(
            select(Lead)
            .where(
                Lead.organization_id == org_id,
                Lead.next_follow_up_at >= now,
                Lead.next_follow_up_at <= now + timedelta(hours=24),
            )
            .limit(10)
        )
        .scalars()
        .all()
    )

    return LeadAnalyticsResponse(
        total_leads=total_leads,
        won_leads=won_leads,
        lost_leads=lost_leads,
        source_breakdown={row[0]: row[1] for row in source_rows},
        conversion_rate=round((won_leads / total_leads) * 100) if total_leads > 0 else 0,
        upcoming_follow_ups=[LeadResponse.model_validate(lead) for lead in upcoming],
    )


def add_comm_log(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: CommLogCreateRequest
) -> LeadCommunicationLog:
    get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    now = datetime.now(UTC)
    log = LeadCommunicationLog(
        lead_id=lead_id,
        type=data.type,
        title=data.title,
        content=data.content,
        happened_at=data.happened_at or now,
        added_by_id=actor.id,
        created_at=now,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _get_comm_log_or_404(db: Session, *, lead_id: uuid.UUID, log_id: uuid.UUID) -> LeadCommunicationLog:
    log = db.execute(
        select(LeadCommunicationLog).where(LeadCommunicationLog.id == log_id, LeadCommunicationLog.lead_id == lead_id)
    ).scalar_one_or_none()
    if log is None:
        raise NotFoundError("Log not found.")
    return log


def update_comm_log(
    db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID, log_id: uuid.UUID, data: CommLogUpdateRequest
) -> LeadCommunicationLog:
    get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    log = _get_comm_log_or_404(db, lead_id=lead_id, log_id=log_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log


def delete_comm_log(db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID, log_id: uuid.UUID) -> None:
    get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    log = _get_comm_log_or_404(db, lead_id=lead_id, log_id=log_id)
    db.delete(log)
    db.commit()


def promote_to_sample_if_needed(db: Session, *, lead: Lead, actor: WorkflowUser) -> None:
    """The first real Sample-Production activity (raising a query, in
    core scope — formulas/samples themselves are Phase 2b) against a New/
    Follow-up lead promotes it to Sample automatically, mirroring the
    source's `promoteToSampleIfNeeded`. Called by queries/service.py's
    `raise_query`, not exposed as its own endpoint."""
    if lead.status not in (LeadStatus.NEW, LeadStatus.FOLLOWUP):
        return

    now = datetime.now(UTC)
    last_entry = (
        db.execute(
            select(LeadStageHistoryEntry)
            .where(LeadStageHistoryEntry.lead_id == lead.id)
            .order_by(LeadStageHistoryEntry.entered_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if last_entry is not None and last_entry.exited_at is None:
        last_entry.exited_at = now
    db.add(LeadStageHistoryEntry(lead_id=lead.id, stage=LeadStatus.SAMPLE.value, entered_at=now, moved_by_id=actor.id))

    lead.status = LeadStatus.SAMPLE
    lead.updated_by_id = actor.id


def _promote_to_in_progress_if_approved(db: Session, *, lead: Lead, actor: WorkflowUser) -> None:
    """Shared with the (now-dropped) legacy sampleDetails subStage endpoint
    in the source; here only `update_sample_status` calls it."""
    if lead.status != LeadStatus.SAMPLE:
        return
    now = datetime.now(UTC)
    last_entry = (
        db.execute(
            select(LeadStageHistoryEntry)
            .where(LeadStageHistoryEntry.lead_id == lead.id)
            .order_by(LeadStageHistoryEntry.entered_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if last_entry is not None and last_entry.exited_at is None:
        last_entry.exited_at = now
    db.add(
        LeadStageHistoryEntry(lead_id=lead.id, stage=LeadStatus.IN_PROGRESS.value, entered_at=now, moved_by_id=actor.id)
    )
    lead.status = LeadStatus.IN_PROGRESS
    lead.in_progress_at = now
    lead.updated_by_id = actor.id


def _next_slug(prefix: str, lead_id: uuid.UUID, existing_count: int) -> str:
    return f"{prefix}-{str(lead_id).replace('-', '')[-4:]}-{existing_count + 1}"


def _build_formula_response(db: Session, *, formula: LeadCustomFormula) -> FormulaResponse:
    versions = (
        db.execute(
            select(LeadFormulaVersion)
            .where(LeadFormulaVersion.formula_id == formula.id)
            .order_by(LeadFormulaVersion.version.asc())
        )
        .scalars()
        .all()
    )
    return FormulaResponse(
        id=formula.id,
        lead_id=formula.lead_id,
        formula_id=formula.formula_id,
        name=formula.name,
        product_id=formula.product_id,
        product_link=formula.product_link,
        ref_weight=formula.ref_weight,
        ref_unit=formula.ref_unit,
        current_version=formula.current_version,
        research_notes=formula.research_notes,
        versions=[FormulaVersionResponse.model_validate(v) for v in versions],
        created_by_id=formula.created_by_id,
        created_at=formula.created_at,
    )


def _build_lead_detail(db: Session, *, lead: Lead) -> LeadDetailResponse:
    product_links = (
        db.execute(
            select(LeadProductLink).where(LeadProductLink.lead_id == lead.id).order_by(LeadProductLink.created_at)
        )
        .scalars()
        .all()
    )
    formulas = (
        db.execute(
            select(LeadCustomFormula).where(LeadCustomFormula.lead_id == lead.id).order_by(LeadCustomFormula.created_at)
        )
        .scalars()
        .all()
    )
    samples = (
        db.execute(select(LeadSample).where(LeadSample.lead_id == lead.id).order_by(LeadSample.created_at))
        .scalars()
        .all()
    )
    return LeadDetailResponse(
        **LeadResponse.model_validate(lead).model_dump(),
        product_links=[ProductLinkResponse.model_validate(p) for p in product_links],
        custom_formulas=[_build_formula_response(db, formula=f) for f in formulas],
        samples=[SampleResponse.model_validate(s) for s in samples],
    )


def get_lead_detail(db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    return _build_lead_detail(db, lead=lead)


# --- Product links ---


def _get_product_link_or_404(db: Session, *, lead_id: uuid.UUID, product_id: str) -> LeadProductLink:
    link = db.execute(
        select(LeadProductLink).where(LeadProductLink.lead_id == lead_id, LeadProductLink.product_id == product_id)
    ).scalar_one_or_none()
    if link is None:
        raise NotFoundError("Product link not found.")
    return link


def add_product_link(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: ProductLinkCreateRequest
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    promote_to_sample_if_needed(db, lead=lead, actor=actor)

    existing_count = db.execute(
        select(func.count(LeadProductLink.id)).where(LeadProductLink.lead_id == lead.id)
    ).scalar_one()
    product_id = data.product_id or _next_slug("PROD", lead.id, existing_count)

    link = LeadProductLink(
        lead_id=lead.id,
        product_id=product_id,
        name=data.name,
        basis=data.basis,
        notes=data.notes,
        created_by_id=actor.id,
        created_at=datetime.now(UTC),
    )
    db.add(link)
    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


def update_product_link(
    db: Session,
    *,
    org_id: uuid.UUID,
    lead_id: uuid.UUID,
    product_id: str,
    data: ProductLinkUpdateRequest,
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    link = _get_product_link_or_404(db, lead_id=lead.id, product_id=product_id)

    updates = data.model_dump(exclude_unset=True)
    was_newly_paid = (
        updates.get("payment_status") == ProductPaymentStatus.FULL_PAID
        and link.payment_status != ProductPaymentStatus.FULL_PAID
    )

    for field, value in updates.items():
        setattr(link, field, value)
    if was_newly_paid and "paid_at" not in updates:
        link.paid_at = datetime.now(UTC)

    if was_newly_paid and lead.assigned_to_id:
        create_notification(
            db,
            org_id=org_id,
            recipient_id=lead.assigned_to_id,
            title="💳 Product Payment Confirmed",
            message=f"Payment confirmed for {link.name} on {lead.name}.",
            type_=NotificationType.CRM,
            action_url=f"/samples?open={lead.id}&leadTab=Payments",
            reference_type="lead",
            reference_id=lead.id,
        )

    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


def delete_product_link(db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID, product_id: str) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    link = _get_product_link_or_404(db, lead_id=lead.id, product_id=product_id)
    db.delete(link)
    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


# --- Formulas ---


def _compute_formula_cost(rows: list[dict[str, object]] | None) -> float:
    """No raw-material stock table exists yet (Phase 3) — cost is the
    straightforward sum of quantity*cost_per_unit already carried on each
    row, rather than looking up live material pricing like the source's
    `computeFormulaCost`/`buildIngredientsFromCatalogProduct` eventually
    could once Phase 3 lands."""
    if not rows:
        return 0
    total = 0.0
    for row in rows:
        qty = float(row.get("quantity") or 0)  # type: ignore[arg-type]
        cost = float(row.get("cost_per_unit") or 0)  # type: ignore[arg-type]
        total += qty * cost
    return round(total, 4)


def _get_formula_or_404(db: Session, *, lead_id: uuid.UUID, formula_id: str) -> LeadCustomFormula:
    formula = db.execute(
        select(LeadCustomFormula).where(
            LeadCustomFormula.lead_id == lead_id, LeadCustomFormula.formula_id == formula_id
        )
    ).scalar_one_or_none()
    if formula is None:
        raise NotFoundError("Formula not found.")
    return formula


def add_formula(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: FormulaCreateRequest
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    link = db.execute(
        select(LeadProductLink).where(LeadProductLink.lead_id == lead.id, LeadProductLink.product_id == data.product_id)
    ).scalar_one_or_none()
    if link is None:
        raise AppError("product_not_linked", "Add this product in the Products tab first.", status_code=400)

    promote_to_sample_if_needed(db, lead=lead, actor=actor)

    existing_count = db.execute(
        select(func.count(LeadCustomFormula.id)).where(LeadCustomFormula.lead_id == lead.id)
    ).scalar_one()
    formula_id = _next_slug("FORM", lead.id, existing_count)

    rows = [r.model_dump() for r in data.rows] if data.rows else None
    cost = _compute_formula_cost(rows) if rows else (data.cost_per_unit or 0)
    now = datetime.now(UTC)

    formula = LeadCustomFormula(
        lead_id=lead.id,
        formula_id=formula_id,
        name=data.name,
        product_id=data.product_id,
        product_link=data.product_link or link.name,
        ref_weight=data.ref_weight,
        ref_unit=data.ref_unit,
        current_version=1,
        created_by_id=actor.id,
        created_at=now,
    )
    db.add(formula)
    db.flush()
    db.add(
        LeadFormulaVersion(
            formula_id=formula.id,
            version=1,
            status=data.status,
            cost_per_unit=cost,
            procedure=data.procedure,
            rows=rows,
            created_at=now,
        )
    )
    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


def update_formula(
    db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID, formula_id: str, data: FormulaUpdateRequest
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    formula = _get_formula_or_404(db, lead_id=lead.id, formula_id=formula_id)

    if data.product_id is not None:
        link = db.execute(
            select(LeadProductLink).where(
                LeadProductLink.lead_id == lead.id, LeadProductLink.product_id == data.product_id
            )
        ).scalar_one_or_none()
        if link is None:
            raise AppError("product_not_linked", "Add this product in the Products tab first.", status_code=400)
        formula.product_id = data.product_id
        formula.product_link = link.name

    if data.ref_weight is not None:
        formula.ref_weight = data.ref_weight
    if data.ref_unit is not None:
        formula.ref_unit = data.ref_unit
    if data.research_notes is not None:
        formula.research_notes = data.research_notes

    versions = (
        db.execute(
            select(LeadFormulaVersion)
            .where(LeadFormulaVersion.formula_id == formula.id)
            .order_by(LeadFormulaVersion.version.asc())
        )
        .scalars()
        .all()
    )

    if data.bump_version:
        latest = versions[-1] if versions else None
        rows = [r.model_dump() for r in data.rows] if data.rows is not None else (latest.rows if latest else None)
        cost = _compute_formula_cost(rows) if data.rows is not None else (latest.cost_per_unit if latest else 0)
        procedure = data.procedure if data.procedure is not None else (latest.procedure if latest else None)
        formula.current_version += 1
        db.add(
            LeadFormulaVersion(
                formula_id=formula.id,
                version=formula.current_version,
                status=data.status or FormulaVersionStatus.DRAFT,
                cost_per_unit=cost,
                procedure=procedure,
                change_note=data.change_note,
                rows=rows,
                created_at=datetime.now(UTC),
            )
        )
    else:
        if data.version is not None:
            target = next((v for v in versions if v.version == data.version), None)
        else:
            target = versions[-1] if versions else None
        if target is None:
            raise NotFoundError("Formula version not found.")

        editing_content = data.rows is not None or data.cost_per_unit is not None or data.procedure is not None
        if (
            target.status == FormulaVersionStatus.ACCEPTED
            and editing_content
            and data.status != FormulaVersionStatus.ACCEPTED
        ):
            raise AppError(
                "version_locked", "Accepted and locked — bump a new version to make changes.", status_code=400
            )

        if data.status is not None:
            target.status = data.status
        if data.rows is not None:
            rows = [r.model_dump() for r in data.rows]
            target.rows = rows
            target.cost_per_unit = _compute_formula_cost(rows)
        elif data.cost_per_unit is not None:
            target.cost_per_unit = data.cost_per_unit
        if data.procedure is not None:
            target.procedure = data.procedure
        if data.change_note is not None:
            target.change_note = data.change_note

    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


# --- Samples ---


def _get_sample_or_404(db: Session, *, lead_id: uuid.UUID, sample_id: str) -> LeadSample:
    sample = db.execute(
        select(LeadSample).where(LeadSample.lead_id == lead_id, LeadSample.sample_id == sample_id)
    ).scalar_one_or_none()
    if sample is None:
        raise NotFoundError("Sample not found.")
    return sample


def create_sample(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: SampleCreateRequest
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)

    formula = None
    target_version = None
    if data.formula_id:
        formula = db.execute(
            select(LeadCustomFormula).where(
                LeadCustomFormula.lead_id == lead.id, LeadCustomFormula.formula_id == data.formula_id
            )
        ).scalar_one_or_none()
        if formula is None:
            raise NotFoundError("Formula not found.")
        version_no = data.formula_version_no or formula.current_version
        target_version = db.execute(
            select(LeadFormulaVersion).where(
                LeadFormulaVersion.formula_id == formula.id, LeadFormulaVersion.version == version_no
            )
        ).scalar_one_or_none()
        if target_version is None:
            raise NotFoundError("Formula version not found.")
        if target_version.status not in (
            FormulaVersionStatus.DRAFT,
            FormulaVersionStatus.IN_TESTING,
            FormulaVersionStatus.ACCEPTED,
        ):
            raise AppError(
                "invalid_formula_status", "This formula version isn't eligible for sampling.", status_code=400
            )

    promote_to_sample_if_needed(db, lead=lead, actor=actor)

    existing_count = db.execute(select(func.count(LeadSample.id)).where(LeadSample.lead_id == lead.id)).scalar_one()
    sample_id = _next_slug("SMPL", lead.id, existing_count)

    version = 1
    if data.chained_from:
        parent = db.execute(
            select(LeadSample).where(LeadSample.lead_id == lead.id, LeadSample.sample_id == data.chained_from)
        ).scalar_one_or_none()
        if parent is not None:
            version = parent.version + 1

    now = datetime.now(UTC)
    timeline_event = (
        f"Follow-up sample requested (chained from {data.chained_from})" if data.chained_from else "Sample created"
    )

    sample = LeadSample(
        lead_id=lead.id,
        sample_id=sample_id,
        formula_id=data.formula_id,
        formula_version_no=data.formula_version_no or (formula.current_version if formula else None),
        product_id=data.product_id,
        version=version,
        chained_from=data.chained_from,
        status=SampleStatus.REQUESTED,
        notes=data.notes,
        query_id=data.query_id,
        timeline=[{"event": timeline_event, "at": now.isoformat()}],
        created_by_id=actor.id,
        created_at=now,
    )
    db.add(sample)

    if target_version is not None and target_version.status == FormulaVersionStatus.DRAFT:
        target_version.status = FormulaVersionStatus.IN_TESTING

    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


def update_sample(
    db: Session, *, org_id: uuid.UUID, lead_id: uuid.UUID, sample_id: str, data: SampleUpdateRequest
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    sample = _get_sample_or_404(db, lead_id=lead.id, sample_id=sample_id)

    if data.product_id is not None:
        link = db.execute(
            select(LeadProductLink).where(
                LeadProductLink.lead_id == lead.id, LeadProductLink.product_id == data.product_id
            )
        ).scalar_one_or_none()
        if link is None:
            raise AppError("product_not_linked", "Add this product in the Products tab first.", status_code=400)
        sample.product_id = data.product_id

    if data.courier is not None:
        sample.courier = data.courier
    if data.awb is not None:
        sample.awb = data.awb
    if data.notes is not None:
        sample.notes = data.notes

    timeline = list(sample.timeline or [])
    now = datetime.now(UTC)
    if data.sent_at is not None:
        sample.sent_at = data.sent_at
        timeline.append(
            {"event": f"Dispatched via {sample.courier or 'courier'} (AWB {sample.awb or '-'})", "at": now.isoformat()}
        )
    if data.packaging_confirmed is not None:
        sample.packaging_confirmed = data.packaging_confirmed
        if data.packaging_confirmed:
            timeline.append({"event": "Packaging confirmed by customer", "at": now.isoformat()})
    sample.timeline = timeline

    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


def update_sample_status(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor: WorkflowUser,
    lead_id: uuid.UUID,
    sample_id: str,
    data: SampleStatusUpdateRequest,
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    sample = _get_sample_or_404(db, lead_id=lead.id, sample_id=sample_id)

    resolved_product_id = sample.product_id
    if resolved_product_id is None and sample.formula_id:
        formula = db.execute(
            select(LeadCustomFormula).where(
                LeadCustomFormula.lead_id == lead.id, LeadCustomFormula.formula_id == sample.formula_id
            )
        ).scalar_one_or_none()
        if formula is not None:
            resolved_product_id = formula.product_id

    link = None
    if resolved_product_id:
        link = db.execute(
            select(LeadProductLink).where(
                LeadProductLink.lead_id == lead.id, LeadProductLink.product_id == resolved_product_id
            )
        ).scalar_one_or_none()
    product_paid = link is not None and link.payment_status == ProductPaymentStatus.FULL_PAID

    if data.status != SampleStatus.REQUESTED and not product_paid:
        product_name = link.name if link is not None else "the linked product"
        raise AppError(
            "payment_required", f"Confirm payment for {product_name} before progressing this sample.", status_code=422
        )
    if data.status == SampleStatus.REJECTED and not (data.rejection_reason and data.rejection_reason.strip()):
        raise AppError("rejection_reason_required", "A rejection reason is required.", status_code=400)

    sample.status = data.status
    sample.rejection_reason = (
        data.rejection_reason.strip() if data.status == SampleStatus.REJECTED and data.rejection_reason else None
    )
    if data.approved_by_contact is not None:
        sample.approved_by_contact = data.approved_by_contact
    if data.rejected_by_contact is not None:
        sample.rejected_by_contact = data.rejected_by_contact

    timeline = list(sample.timeline or [])
    timeline.append({"event": f"Status → {data.status.value}", "at": datetime.now(UTC).isoformat()})
    sample.timeline = timeline

    if data.status == SampleStatus.APPROVED:
        _promote_to_in_progress_if_approved(db, lead=lead, actor=actor)

    if data.status in (SampleStatus.APPROVED, SampleStatus.REJECTED) and lead.assigned_to_id:
        title = "✅ Sample Approved" if data.status == SampleStatus.APPROVED else "↻ Sample Rejected"
        create_notification(
            db,
            org_id=org_id,
            recipient_id=lead.assigned_to_id,
            title=title,
            message=f"Sample {sample.sample_id} for {lead.name} was marked {data.status.value}.",
            type_=NotificationType.CRM,
            action_url=f"/samples?open={lead.id}",
            reference_type="lead",
            reference_id=lead.id,
        )

    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


def add_sample_feedback(
    db: Session,
    *,
    actor: WorkflowUser,
    org_id: uuid.UUID,
    lead_id: uuid.UUID,
    sample_id: str,
    data: SampleFeedbackRequest,
) -> LeadDetailResponse:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    sample = _get_sample_or_404(db, lead_id=lead.id, sample_id=sample_id)

    now = datetime.now(UTC)
    feedback_log = list(sample.feedback_log or [])
    feedback_log.append({"by": f"{actor.first_name} {actor.last_name}", "text": data.text, "at": now.isoformat()})
    sample.feedback_log = feedback_log

    timeline = list(sample.timeline or [])
    timeline.append({"event": "Customer feedback logged", "at": now.isoformat()})
    sample.timeline = timeline

    db.commit()
    db.refresh(lead)
    return _build_lead_detail(db, lead=lead)


# --- Analytics ---


def get_rep_analytics(db: Session, *, org_id: uuid.UUID) -> list[RepAnalyticsRow]:
    now = datetime.now(UTC)
    rows = db.execute(
        select(
            Lead.assigned_to_id,
            func.count(Lead.id),
            func.sum(case((Lead.status == LeadStatus.WON, 1), else_=0)),
            func.sum(case((Lead.status == LeadStatus.LOST, 1), else_=0)),
            func.sum(case((Lead.is_stale.is_(True), 1), else_=0)),
            func.sum(
                case(
                    (
                        and_(
                            Lead.next_follow_up_at.isnot(None),
                            Lead.next_follow_up_at < now,
                            Lead.status.notin_([LeadStatus.WON, LeadStatus.LOST]),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.coalesce(func.sum(Lead.estimated_value), 0),
            func.coalesce(
                func.sum(
                    case((Lead.status == LeadStatus.WON, func.coalesce(Lead.deal_value, Lead.estimated_value)), else_=0)
                ),
                0,
            ),
        )
        .where(Lead.organization_id == org_id, Lead.assigned_to_id.isnot(None))
        .group_by(Lead.assigned_to_id)
        .order_by(func.count(Lead.id).desc())
    ).all()

    result: list[RepAnalyticsRow] = []
    for assigned_to_id, total, won, lost, stale, overdue, total_value, won_value in rows:
        user = db.get(WorkflowUser, assigned_to_id)
        rep_name = f"{user.first_name} {user.last_name}" if user is not None else "Unknown"
        result.append(
            RepAnalyticsRow(
                assigned_to_id=assigned_to_id,
                rep_name=rep_name,
                total=total,
                won=won or 0,
                lost=lost or 0,
                stale=stale or 0,
                overdue_follow_up=overdue or 0,
                total_value=float(total_value or 0),
                won_value=float(won_value or 0),
            )
        )
    return result


def get_pipeline_velocity(db: Session, *, org_id: uuid.UUID) -> list[VelocityRow]:
    avg_days_expr = func.avg(
        func.extract("epoch", LeadStageHistoryEntry.exited_at - LeadStageHistoryEntry.entered_at) / 86400.0
    )
    rows = db.execute(
        select(LeadStageHistoryEntry.stage, avg_days_expr, func.count(LeadStageHistoryEntry.id))
        .join(Lead, Lead.id == LeadStageHistoryEntry.lead_id)
        .where(Lead.organization_id == org_id, LeadStageHistoryEntry.exited_at.isnot(None))
        .group_by(LeadStageHistoryEntry.stage)
        .order_by(avg_days_expr.desc())
    ).all()
    return [
        VelocityRow(stage=stage, avg_days=round(float(avg_days or 0), 2), count=count)
        for stage, avg_days, count in rows
    ]


# --- Dispatch / send-update ---


def dispatch_lead(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: DispatchLeadRequest
) -> Lead:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    if lead.status == LeadStatus.DISPATCHED:
        raise AppError("already_dispatched", "Lead is already dispatched.", status_code=400)

    now = datetime.now(UTC)
    last_entry = (
        db.execute(
            select(LeadStageHistoryEntry)
            .where(LeadStageHistoryEntry.lead_id == lead.id)
            .order_by(LeadStageHistoryEntry.entered_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if last_entry is not None and last_entry.exited_at is None:
        last_entry.exited_at = now
    db.add(
        LeadStageHistoryEntry(lead_id=lead.id, stage=LeadStatus.DISPATCHED.value, entered_at=now, moved_by_id=actor.id)
    )
    lead.status = LeadStatus.DISPATCHED
    lead.updated_by_id = actor.id

    if data.note:
        db.add(
            LeadCommunicationLog(
                lead_id=lead.id,
                type=CommunicationLogType.OTHER,
                title="Dispatch update sent to client",
                content=data.note,
                happened_at=now,
                added_by_id=actor.id,
                created_at=now,
            )
        )

    db.commit()
    db.refresh(lead)
    return lead


def send_update(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, lead_id: uuid.UUID, data: SendUpdateRequest
) -> Lead:
    lead = get_lead_or_404(db, org_id=org_id, lead_id=lead_id)
    phone = lead.whatsapp or lead.phone
    if not phone:
        raise AppError("no_phone", "Lead has no phone number to send an update to.", status_code=400)

    now = datetime.now(UTC)
    db.add(
        LeadFollowUp(
            lead_id=lead.id,
            scheduled_at=now,
            type=FollowUpType.WHATSAPP,
            notes=f'Client update sent: "{data.message}"',
            outcome="WhatsApp update sent to client",
            performed_by_id=actor.id,
            is_completed=True,
            completed_at=now,
            created_at=now,
        )
    )
    lead.last_update_text = data.message
    lead.last_update_at = now

    db.commit()
    db.refresh(lead)
    return lead
