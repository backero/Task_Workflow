"""Invoice, Transaction — ported from Task_Workflow's Mongoose `Invoice` and
`Transaction` models (Phase 4 core — Finance). Several already-ported
modules referenced these models before they existed: CRM Lead's sample
quotation/invoice endpoints, Production's work-assignment payment gate and
`link-production` — all wired up now in a Phase 2c follow-up alongside this
phase.

`Invoice.client` (an embedded, non-ref object in the source) is flattened
onto real columns here rather than JSONB — it's a small, fixed, always-typed
shape (name/email/phone/address/gstin/state/state_code), unlike the port's
usual JSONB candidates (settings blobs, per-stage spreads). Same reasoning
for `Transaction.vendor`. `Invoice.lineItems`/`payment_history` stay JSONB:
line items are always read/written as a whole array (the source's own PUT
handler replaces the entire array), never queried or joined individually.

Deliberate relational tightening: `Invoice.sample_id` was a bare `ObjectId`
with "no ref model" in the source (a comment explains it points into a
Lead's `samples[]` subdocument, which had no top-level collection to ref).
Since this port's `LeadSample` **is** a real table with its own UUID PK
(Phase 2b), `sample_id` becomes a genuine FK here — a natural improvement,
not a deviation in behavior."""

from __future__ import annotations

import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import ARRAY, Boolean, Date, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class InvoiceType(StrEnum):
    INVOICE = "invoice"
    QUOTATION = "quotation"
    PROFORMA = "proforma"
    CREDIT_NOTE = "credit_note"
    DEBIT_NOTE = "debit_note"


class InvoiceStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class Invoice(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "invoices"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[InvoiceType] = mapped_column(
        SAEnum(InvoiceType, name="invoice_type", native_enum=True), nullable=False, default=InvoiceType.INVOICE
    )
    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(InvoiceStatus, name="invoice_status", native_enum=True),
        nullable=False,
        default=InvoiceStatus.DRAFT,
        index=True,
    )

    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    client_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    client_state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    client_state_code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sample_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lead_samples.id", ondelete="SET NULL"), nullable=True
    )

    # [{product_id, description, quantity, unit, unit_price, gst_rate,
    #   gst_amount, discount, total, hsn_code}, ...]
    line_items: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    subtotal: Mapped[float] = mapped_column(nullable=False, default=0)
    total_discount: Mapped[float] = mapped_column(nullable=False, default=0)
    total_gst: Mapped[float] = mapped_column(nullable=False, default=0)
    round_off: Mapped[float] = mapped_column(nullable=False, default=0)
    total_amount: Mapped[float] = mapped_column(nullable=False, default=0)
    paid_amount: Mapped[float] = mapped_column(nullable=False, default=0)
    balance_amount: Mapped[float] = mapped_column(nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    payment_terms: Mapped[str] = mapped_column(String(64), nullable=False, default="Net 30")
    # [{amount, method, date, reference, notes}, ...]
    payment_history: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    signatory_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class PaymentMethod(StrEnum):
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CHEQUE = "cheque"
    CARD = "card"
    OTHER = "other"


class Transaction(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "transactions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    type: Mapped[TransactionType] = mapped_column(
        SAEnum(TransactionType, name="transaction_type", native_enum=True), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    sub_category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    amount: Mapped[float] = mapped_column(nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SAEnum(PaymentMethod, name="payment_method", native_enum=True),
        nullable=False,
        default=PaymentMethod.BANK_TRANSFER,
    )
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    vendor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vendor_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vendor_gstin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gst_amount: Mapped[float] = mapped_column(nullable=False, default=0)
    tds_amount: Mapped[float] = mapped_column(nullable=False, default=0)
    attachments: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    is_recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recurring_frequency: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
