"""Lead (+ LeadFollowUp, LeadStageHistoryEntry, LeadCommunicationLog,
LeadProductLink, LeadCustomFormula/LeadFormulaVersion, LeadSample) — ported
from Task_Workflow's Mongoose `Lead` model. Embedded Mongo subdocuments
(followUps, stageHistory, communicationLogs, productLinks, customFormulas
[+versions], samples) become real child tables with FKs, matching the
pattern already used for Task's comments/activity-log.

Phase 2b adds the versioned sample-development subsystem (productLinks,
customFormulas+versions, samples). Deliberate improvement over the source:
the legacy singular `Lead.sampleDetails` embedded object (a pre-versioning
single-sample-per-lead flow the source itself was already migrating away
from — see its `updateSampleSubStage` comment about mirroring onto it "to
keep the legacy queue in sync") is dropped entirely in favor of the
versioned, per-product `samples[]`/`productLinks[]` model, which is the
source's own forward-looking design. This means the per-product payment
gate on sample-status transitions checks `LeadProductLink.payment_status`
only (no legacy lead-wide `sampleDetails.paymentStatus` fallback) — a
sample must be linked to a paid product line to progress past "Requested".

Still deliberately NOT included (Phase 2c+, once those dependencies land):
formula/query file attachments (Cloudinary), sample quotations/invoices
(`Invoice` model is Phase 4/Finance), `link-production` (needs
`ProductionOrder`/`CatalogProduct`, Phase 3), Google Sheets sync fields,
intakeAudio (Groq transcription), convertedToTask/isConverted (needs the
still-deferred dept-hub Task concept), productionOrderId, trackingToken
(public tracking page), communication-log file attachments.

`status`/`priority` are free-text `String` fields in the Mongoose schema
(no `enum:` constraint on `status`, meaning Mongoose never actually enforced
this) — promoted to real Postgres enums here since the *business logic*
(validateStageTransition, promoteToSampleIfNeeded) already treats them as a
fixed, meaningful set; this is the same kind of relational tightening
already applied to Task_Workflow's task status elsewhere in this port.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class LeadStatus(StrEnum):
    NEW = "New Lead"
    CONTACTED = "Contacted"
    INTERESTED = "Interested"
    FOLLOWUP = "Follow-up"
    SAMPLE = "Sample"
    PROPOSAL = "Proposal Sent"
    NEGOTIATION = "Negotiation"
    QUERY_PENDING = "Query Pending"
    IN_PROGRESS = "In Progress"
    READY_TO_DISPATCH = "Ready to Dispatch"
    DISPATCHED = "Dispatched"
    WON = "Payment Pending"
    LOST = "Lost"


class LeadPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Lead(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "leads"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    phone2: Mapped[str | None] = mapped_column(String(32), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    preferred_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    best_time: Mapped[str | None] = mapped_column(String(64), nullable=True)
    team_size: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rapport_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    source: Mapped[str] = mapped_column(String(64), nullable=False, default="Manual Entry")
    source_details: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[LeadStatus] = mapped_column(
        SAEnum(LeadStatus, name="lead_status", native_enum=True), nullable=False, default=LeadStatus.NEW, index=True
    )
    pipeline: Mapped[str] = mapped_column(String(64), nullable=False, default="default")
    priority: Mapped[LeadPriority] = mapped_column(
        SAEnum(LeadPriority, name="lead_priority", native_enum=True), nullable=False, default=LeadPriority.MEDIUM
    )

    product_interest: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    estimated_value: Mapped[float] = mapped_column(nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    deal_value: Mapped[float | None] = mapped_column(nullable=True)

    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True, index=True
    )
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The production end-to-end owner handoff — distinct from assigned_to
    # (the narrower intake-rep field). See updateLead's canAssignLeads gate.
    in_charge_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True, index=True
    )

    campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ad_set: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ad_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(255), nullable=True)

    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lost_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lost_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_update_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_update_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lead_time: Mapped[int | None] = mapped_column(Integer, nullable=True)
    in_progress_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    follow_up_reminders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_reminder_sent: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class FollowUpType(StrEnum):
    CALL = "call"
    WHATSAPP = "whatsapp"
    MEETING = "meeting"
    EMAIL = "email"
    DEMO = "demo"
    OTHER = "other"


class LeadFollowUp(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "lead_follow_ups"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    type: Mapped[FollowUpType] = mapped_column(
        SAEnum(FollowUpType, name="follow_up_type", native_enum=True), nullable=False, default=FollowUpType.CALL
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    next_action: Mapped[str | None] = mapped_column(String(500), nullable=True)
    performed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LeadStageHistoryEntry(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "lead_stage_history"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[str] = mapped_column(String(64), nullable=False)
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    exited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    moved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class CommunicationLogType(StrEnum):
    CALL = "call"
    WHATSAPP = "whatsapp"
    MEETING = "meeting"
    EMAIL = "email"
    OTHER = "other"


class LeadCommunicationLog(Base, UUIDPrimaryKeyMixin):
    """Text-only for Phase 2 core — the source's images/audioFiles/
    videoFiles arrays are a Cloudinary-upload feature, deferred like every
    other file-upload endpoint in this port (Phase 2b)."""

    __tablename__ = "lead_communication_logs"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[CommunicationLogType] = mapped_column(
        SAEnum(CommunicationLogType, name="communication_log_type", native_enum=True),
        nullable=False,
        default=CommunicationLogType.CALL,
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    happened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    added_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ProductLinkBasis(StrEnum):
    CUSTOMER_FORMULA = "Customer's Formula"
    HOUSE_FORMULA = "House Formula"
    TO_BE_DEVELOPED = "To Be Developed"


class ProductLinkPriceStatus(StrEnum):
    NOT_QUOTED = "Not quoted"
    QUOTED = "Quoted"
    ACCEPTED = "Accepted"


class ProductPaymentStatus(StrEnum):
    """Shared by LeadProductLink and LeadSample-adjacent payment tracking."""

    PENDING = "pending"
    FULL_PAID = "full_paid"


class ProductPaymentMode(StrEnum):
    CASH = "cash"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"


class LeadProductLink(Base, UUIDPrimaryKeyMixin):
    """One product a client is interested in, with its own pricing/payment
    lifecycle — ported from `Lead.productLinks[]`. `product_id` is a
    lead-scoped human-readable slug (`PROD-{last4}-{n}`, source-generated),
    referenced loosely by `LeadCustomFormula.product_id`/`LeadSample.product_id`
    the same non-FK way the source does (a subdocument-array string ref, not
    a real foreign key — the array position isn't stable enough for one)."""

    __tablename__ = "lead_product_links"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    basis: Mapped[ProductLinkBasis] = mapped_column(
        SAEnum(ProductLinkBasis, name="product_link_basis", native_enum=True),
        nullable=False,
        default=ProductLinkBasis.HOUSE_FORMULA,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    approx_price: Mapped[float] = mapped_column(nullable=False, default=0)
    price_status: Mapped[ProductLinkPriceStatus] = mapped_column(
        SAEnum(ProductLinkPriceStatus, name="product_link_price_status", native_enum=True),
        nullable=False,
        default=ProductLinkPriceStatus.NOT_QUOTED,
    )
    payment_status: Mapped[ProductPaymentStatus] = mapped_column(
        SAEnum(ProductPaymentStatus, name="product_payment_status", native_enum=True),
        nullable=False,
        default=ProductPaymentStatus.PENDING,
    )
    charge_amount: Mapped[float] = mapped_column(nullable=False, default=0)
    payment_mode: Mapped[ProductPaymentMode] = mapped_column(
        SAEnum(ProductPaymentMode, name="product_payment_mode", native_enum=True),
        nullable=False,
        default=ProductPaymentMode.UPI,
    )
    payment_txn_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FormulaRefUnit(StrEnum):
    GRAM = "g"
    KILOGRAM = "kg"
    MILLILITER = "ml"
    LITER = "L"


class FormulaVersionStatus(StrEnum):
    DRAFT = "Draft"
    IN_TESTING = "In Testing"
    ACCEPTED = "Accepted"
    REJECTED = "Rejected"
    ARCHIVED = "Archived"


class LeadCustomFormula(Base, UUIDPrimaryKeyMixin):
    """A versioned R&D formula for one of the lead's product links — ported
    from `Lead.customFormulas[]`. The actual ingredient rows/cost/status live
    on `LeadFormulaVersion` (source's `versions[]` subdocument); `rows[]`
    stays JSONB on the version row rather than its own child table since it's
    an immutable snapshot of a specific version's recipe, never queried or
    updated independently of the version that owns it (same reasoning as
    Document's trash snapshot)."""

    __tablename__ = "lead_custom_formulas"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    formula_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    product_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ref_weight: Mapped[float] = mapped_column(nullable=False, default=100)
    ref_unit: Mapped[FormulaRefUnit] = mapped_column(
        SAEnum(FormulaRefUnit, name="formula_ref_unit", native_enum=True), nullable=False, default=FormulaRefUnit.GRAM
    )
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    research_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LeadFormulaVersion(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "lead_formula_versions"

    formula_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lead_custom_formulas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[FormulaVersionStatus] = mapped_column(
        SAEnum(FormulaVersionStatus, name="formula_version_status", native_enum=True),
        nullable=False,
        default=FormulaVersionStatus.IN_TESTING,
    )
    cost_per_unit: Mapped[float] = mapped_column(nullable=False, default=0)
    procedure: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{raw_material_id, name, quantity, unit, cost_per_unit, phase, notes, conv}, ...]
    rows: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SampleStatus(StrEnum):
    REQUESTED = "Requested"
    IN_LAB = "In Lab"
    SENT = "Sent"
    FEEDBACK = "Feedback"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class LeadSample(Base, UUIDPrimaryKeyMixin):
    """A single versioned, chainable sample iteration — ported from
    `Lead.samples[]`. `feedback_log`/`timeline` stay JSONB append-only logs
    (matches the source's own subdocument-without-independent-queries
    shape); `chained_from` is a loose same-table self-reference by
    `sample_id` slug (not a real FK — the source itself never enforces
    referential integrity here, and a sample chain can point at a sample
    that's since been superseded)."""

    __tablename__ = "lead_samples"

    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sample_id: Mapped[str] = mapped_column(String(64), nullable=False)
    formula_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    formula_version_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    chained_from: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[SampleStatus] = mapped_column(
        SAEnum(SampleStatus, name="sample_status", native_enum=True), nullable=False, default=SampleStatus.REQUESTED
    )
    courier: Mapped[str | None] = mapped_column(String(128), nullable=True)
    awb: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    packaging_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rejected_by_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    query_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_queries.id"), nullable=True
    )
    feedback_log: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    timeline: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
