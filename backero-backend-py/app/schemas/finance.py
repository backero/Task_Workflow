"""Request/response schemas for Finance (Invoice, Transaction, Reports,
Dashboards — Phase 4 core)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.finance import InvoiceStatus, InvoiceType, PaymentMethod, TransactionType


class TransactionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: TransactionType
    category: str = Field(min_length=1, max_length=128)
    sub_category: str | None = None
    amount: float = Field(gt=0)
    currency: str = "INR"
    description: str = Field(min_length=1)
    date: date | None = None
    payment_method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    reference: str | None = None
    invoice_id: uuid.UUID | None = None
    vendor_name: str | None = None
    vendor_contact: str | None = None
    vendor_gstin: str | None = None
    gst_amount: float = 0
    tds_amount: float = 0
    is_recurring: bool = False
    recurring_frequency: str | None = None
    tags: list[str] | None = None
    approved_by_id: uuid.UUID | None = None
    notes: str | None = None


class TransactionResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    type: TransactionType
    category: str
    sub_category: str | None
    amount: float
    currency: str
    description: str
    date: date
    payment_method: PaymentMethod
    reference: str | None
    invoice_id: uuid.UUID | None
    vendor_name: str | None
    vendor_contact: str | None
    vendor_gstin: str | None
    gst_amount: float
    tds_amount: float
    is_recurring: bool
    recurring_frequency: str | None
    tags: list[str] | None
    approved_by_id: uuid.UUID | None
    notes: str | None
    created_by_id: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategoryBreakdownRow(BaseModel):
    type: TransactionType
    category: str
    total: float


class TransactionSummaryResponse(BaseModel):
    total_income: float
    total_expense: float
    net_profit: float
    category_breakdown: list[CategoryBreakdownRow]


# --- Invoices ---


class LineItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: uuid.UUID | None = None
    description: str = Field(min_length=1)
    quantity: float = Field(gt=0)
    unit: str = "pcs"
    unit_price: float = Field(ge=0)
    gst_rate: float = 18
    discount: float = 0
    hsn_code: str | None = None


class InvoiceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: InvoiceType = InvoiceType.INVOICE
    status: InvoiceStatus = InvoiceStatus.DRAFT
    client_name: str = Field(min_length=1, max_length=255)
    client_email: str | None = None
    client_phone: str | None = None
    client_address: str | None = None
    client_gstin: str | None = None
    client_state: str | None = None
    client_state_code: str | None = None
    lead_id: uuid.UUID | None = None
    sample_id: uuid.UUID | None = None
    line_items: list[LineItemInput] = Field(default_factory=list)
    due_date: date | None = None
    payment_terms: str = "Net 30"
    notes: str | None = None
    terms: str | None = None
    signatory_name: str | None = None


class InvoiceUpdateRequest(BaseModel):
    """Explicit whitelist — deliberate improvement over the source's `PUT`,
    which spread the entire request body onto the Mongoose doc unfiltered
    (a client could in principle reassign `organizationId`)."""

    model_config = ConfigDict(extra="forbid")

    client_name: str | None = Field(default=None, min_length=1, max_length=255)
    client_email: str | None = None
    client_phone: str | None = None
    client_address: str | None = None
    client_gstin: str | None = None
    client_state: str | None = None
    client_state_code: str | None = None
    line_items: list[LineItemInput] | None = None
    due_date: date | None = None
    payment_terms: str | None = None
    notes: str | None = None
    terms: str | None = None
    signatory_name: str | None = None


class InvoiceStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: InvoiceStatus


class InvoicePaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: float = Field(gt=0)
    method: str = Field(min_length=1)
    reference: str | None = None
    notes: str | None = None


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    invoice_number: str
    type: InvoiceType
    status: InvoiceStatus
    client_name: str
    client_email: str | None
    client_phone: str | None
    client_address: str | None
    client_gstin: str | None
    client_state: str | None
    client_state_code: str | None
    lead_id: uuid.UUID | None
    sample_id: uuid.UUID | None
    line_items: list[dict[str, object]] | None
    subtotal: float
    total_discount: float
    total_gst: float
    round_off: float
    total_amount: float
    paid_amount: float
    balance_amount: float
    currency: str
    issue_date: date | None
    due_date: date | None
    paid_date: date | None
    payment_terms: str
    payment_history: list[dict[str, object]] | None
    notes: str | None
    terms: str | None
    signatory_name: str | None
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InvoiceStatBucket(BaseModel):
    amount: float
    count: int


class InvoiceStatsResponse(BaseModel):
    outstanding: InvoiceStatBucket
    paid_this_month: InvoiceStatBucket
    overdue: InvoiceStatBucket
    draft_count: int
    total_count: int


# --- Reports ---


class EmployeePerformanceRow(BaseModel):
    user_id: uuid.UUID | None
    name: str
    total_tasks: int
    completed: int
    overdue: int
    avg_progress: float
    rejections: int
    completion_rate: float


class DepartmentProductivityRow(BaseModel):
    department: str | None
    total: int
    completed: int
    overdue: int
    pending: int
    completion_rate: float


class LeadsByStatusRow(BaseModel):
    status: str
    count: int
    value: float


class LeadsBySourceRow(BaseModel):
    source: str
    count: int
    converted: int


class ConversionByEmployeeRow(BaseModel):
    user_id: uuid.UUID | None
    name: str
    total: int
    won: int
    value: float


class SalesConversionResponse(BaseModel):
    leads_by_status: list[LeadsByStatusRow]
    leads_by_source: list[LeadsBySourceRow]
    conversion_by_employee: list[ConversionByEmployeeRow]


class MonthlyFinancialRow(BaseModel):
    month: int
    type: TransactionType
    total: float


class FinancialSummaryResponse(BaseModel):
    monthly_data: list[MonthlyFinancialRow]
    year: int
