"""Request/response schemas for the CRM Leads module (Phase 2 core + 2b)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.lead import (
    CommunicationLogType,
    FollowUpType,
    FormulaRefUnit,
    FormulaVersionStatus,
    LeadPriority,
    LeadStatus,
    ProductLinkBasis,
    ProductLinkPriceStatus,
    ProductPaymentMode,
    ProductPaymentStatus,
    SampleStatus,
)


class LeadCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str = Field(min_length=1, max_length=32)
    phone2: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    company: str | None = Field(default=None, max_length=255)
    designation: str | None = Field(default=None, max_length=128)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, max_length=128)
    business_type: str | None = Field(default=None, max_length=128)
    source: str | None = Field(default=None, max_length=64)
    status: LeadStatus | None = None
    priority: LeadPriority = LeadPriority.MEDIUM
    product_interest: list[str] | None = None
    estimated_value: float | None = None
    notes: str | None = None
    campaign: str | None = Field(default=None, max_length=255)
    assigned_to_id: uuid.UUID | None = None


class LeadUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, min_length=1, max_length=32)
    phone2: str | None = Field(default=None, max_length=32)
    whatsapp: str | None = Field(default=None, max_length=32)
    company: str | None = Field(default=None, max_length=255)
    designation: str | None = Field(default=None, max_length=128)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, max_length=128)
    business_type: str | None = Field(default=None, max_length=128)
    source: str | None = Field(default=None, max_length=64)
    status: LeadStatus | None = None
    priority: LeadPriority | None = None
    product_interest: list[str] | None = None
    estimated_value: float | None = None
    deal_value: float | None = None
    notes: str | None = None
    campaign: str | None = Field(default=None, max_length=255)
    assigned_to_id: uuid.UUID | None = None
    in_charge_id: uuid.UUID | None = None
    lost_reason: str | None = Field(default=None, max_length=500)
    last_update_text: str | None = None


class LeadResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    email: str | None
    phone: str
    phone2: str | None
    whatsapp: str | None
    company: str | None
    designation: str | None
    city: str | None
    state: str | None
    business_type: str | None
    source: str
    status: LeadStatus
    priority: LeadPriority
    product_interest: list[str] | None
    estimated_value: float
    currency: str
    deal_value: float | None
    assigned_to_id: uuid.UUID | None
    assigned_by_id: uuid.UUID | None
    assigned_at: datetime | None
    in_charge_id: uuid.UUID | None
    campaign: str | None
    last_contacted_at: datetime | None
    next_follow_up_at: datetime | None
    converted_at: datetime | None
    lost_at: datetime | None
    lost_reason: str | None
    notes: str | None
    last_update_text: str | None
    last_update_at: datetime | None
    is_stale: bool
    tags: list[str] | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FollowUpCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scheduled_at: datetime
    type: FollowUpType = FollowUpType.CALL
    notes: str | None = None
    outcome: str | None = Field(default=None, max_length=255)
    next_action: str | None = Field(default=None, max_length=500)


class FollowUpResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    scheduled_at: datetime
    completed_at: datetime | None
    type: FollowUpType
    notes: str | None
    outcome: str | None
    next_action: str | None
    performed_by_id: uuid.UUID | None
    is_completed: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssignLeadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assigned_to_id: uuid.UUID


class CommLogCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: CommunicationLogType = CommunicationLogType.CALL
    title: str | None = Field(default=None, max_length=255)
    content: str | None = None
    happened_at: datetime | None = None


class CommLogUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: CommunicationLogType | None = None
    content: str | None = None


class CommLogResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    type: CommunicationLogType
    title: str | None
    content: str | None
    happened_at: datetime
    added_by_id: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PipelineLeadSummary(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    priority: LeadPriority
    estimated_value: float
    assigned_to_id: uuid.UUID | None
    next_follow_up_at: datetime | None
    is_stale: bool
    last_contacted_at: datetime | None
    pending_queries: int
    answered_queries: int


class PipelineGroupResponse(BaseModel):
    status: LeadStatus
    count: int
    total_value: float
    leads: list[PipelineLeadSummary]


class LeadAnalyticsResponse(BaseModel):
    total_leads: int
    won_leads: int
    lost_leads: int
    source_breakdown: dict[str, int]
    conversion_rate: int
    upcoming_follow_ups: list[LeadResponse]


class RepAnalyticsRow(BaseModel):
    assigned_to_id: uuid.UUID
    rep_name: str
    total: int
    won: int
    lost: int
    stale: int
    overdue_follow_up: int
    total_value: float
    won_value: float


class VelocityRow(BaseModel):
    stage: str
    avg_days: float
    count: int


# --- Product links ---


class ProductLinkCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    basis: ProductLinkBasis = ProductLinkBasis.HOUSE_FORMULA
    notes: str | None = None


class ProductLinkUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    basis: ProductLinkBasis | None = None
    notes: str | None = None
    approx_price: float | None = None
    price_status: ProductLinkPriceStatus | None = None
    payment_status: ProductPaymentStatus | None = None
    charge_amount: float | None = None
    payment_mode: ProductPaymentMode | None = None
    payment_txn_ref: str | None = Field(default=None, max_length=255)
    paid_at: datetime | None = None
    received_by: str | None = Field(default=None, max_length=255)
    payment_notes: str | None = None


class ProductLinkResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    product_id: str
    name: str
    basis: ProductLinkBasis
    notes: str | None
    approx_price: float
    price_status: ProductLinkPriceStatus
    payment_status: ProductPaymentStatus
    charge_amount: float
    payment_mode: ProductPaymentMode
    payment_txn_ref: str | None
    paid_at: datetime | None
    received_by: str | None
    payment_notes: str | None
    created_by_id: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Formulas ---


class FormulaRowInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_material_id: str | None = None
    name: str
    quantity: float = 0
    unit: str = "g"
    cost_per_unit: float = 0
    phase: str | None = None
    notes: str | None = None
    conv: float = 1


class FormulaCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    product_id: str = Field(min_length=1, max_length=64)
    product_link: str | None = Field(default=None, max_length=255)
    ref_weight: float = 100
    ref_unit: FormulaRefUnit = FormulaRefUnit.GRAM
    rows: list[FormulaRowInput] | None = None
    cost_per_unit: float | None = None
    status: FormulaVersionStatus = FormulaVersionStatus.IN_TESTING
    procedure: str | None = None


class FormulaUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: str | None = Field(default=None, max_length=64)
    ref_weight: float | None = None
    ref_unit: FormulaRefUnit | None = None
    research_notes: str | None = None
    bump_version: bool = False
    version: int | None = None
    status: FormulaVersionStatus | None = None
    rows: list[FormulaRowInput] | None = None
    cost_per_unit: float | None = None
    procedure: str | None = None
    change_note: str | None = None


class FormulaVersionResponse(BaseModel):
    id: uuid.UUID
    formula_id: uuid.UUID
    version: int
    status: FormulaVersionStatus
    cost_per_unit: float
    procedure: str | None
    change_note: str | None
    rows: list[dict[str, object]] | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FormulaResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    formula_id: str
    name: str
    product_id: str | None
    product_link: str | None
    ref_weight: float
    ref_unit: FormulaRefUnit
    current_version: int
    research_notes: str | None
    versions: list[FormulaVersionResponse] = Field(default_factory=list)
    created_by_id: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Samples ---


class SampleCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    formula_id: str | None = Field(default=None, max_length=64)
    formula_version_no: int | None = None
    product_id: str | None = Field(default=None, max_length=64)
    chained_from: str | None = Field(default=None, max_length=64)
    query_id: uuid.UUID | None = None
    notes: str | None = None


class SampleUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    courier: str | None = Field(default=None, max_length=128)
    awb: str | None = Field(default=None, max_length=128)
    sent_at: datetime | None = None
    packaging_confirmed: bool | None = None
    notes: str | None = None
    product_id: str | None = Field(default=None, max_length=64)


class SampleStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: SampleStatus
    rejection_reason: str | None = None
    approved_by_contact: str | None = Field(default=None, max_length=255)
    rejected_by_contact: str | None = Field(default=None, max_length=255)


class SampleFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)


class SampleResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    sample_id: str
    formula_id: str | None
    formula_version_no: int | None
    product_id: str | None
    version: int
    chained_from: str | None
    status: SampleStatus
    courier: str | None
    awb: str | None
    sent_at: datetime | None
    packaging_confirmed: bool
    rejection_reason: str | None
    notes: str | None
    approved_by_contact: str | None
    rejected_by_contact: str | None
    query_id: uuid.UUID | None
    feedback_log: list[dict[str, object]] | None
    timeline: list[dict[str, object]] | None
    created_by_id: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeadDetailResponse(LeadResponse):
    product_links: list[ProductLinkResponse] = Field(default_factory=list)
    custom_formulas: list[FormulaResponse] = Field(default_factory=list)
    samples: list[SampleResponse] = Field(default_factory=list)


class DispatchLeadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str | None = None


class SendUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1)
