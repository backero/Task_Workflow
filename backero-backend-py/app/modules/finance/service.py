"""Finance business logic — ported from finance.routes.js's inline
handlers (Transaction CRUD/summary, Invoice CRUD/stats/status/payment).

Deliberate improvements over the source: `InvoiceUpdateRequest` is an
explicit field whitelist (see app/schemas/finance.py) rather than the
source's unfiltered `Object.assign(invoice, {...req.body})`, which could in
principle let a client reassign `organizationId` via the request body.
`invoice_number` generation retries on collision instead of the source's
one-shot `INV-{YYYY}{MM}-{4-digit random}` (which could throw a raw
duplicate-key error on the unique `(organization_id, invoice_number)`
index).

Deliberately NOT ported: the Socket.IO `invoice_paid` emit on the payment
route (no websocket/pubsub layer exists yet in this port, matching how
every other phase has deferred real-time push in favor of the underlying
state change, which IS recorded)."""

from __future__ import annotations

import random
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.core.pagination import Page, PageParams
from app.models.finance import Invoice, InvoiceStatus, PaymentMethod, Transaction, TransactionType
from app.models.workflow_user import WorkflowUser
from app.schemas.finance import (
    CategoryBreakdownRow,
    InvoiceCreateRequest,
    InvoicePaymentRequest,
    InvoiceResponse,
    InvoiceStatBucket,
    InvoiceStatsResponse,
    InvoiceStatusUpdateRequest,
    InvoiceUpdateRequest,
    TransactionCreateRequest,
    TransactionResponse,
    TransactionSummaryResponse,
)

_STATUS_PATCHABLE = (InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.CANCELLED)

# Normalizes free-text payment method input to Transaction.payment_method's
# fixed enum — matches the source's lowercase/underscore normalization.
_PAYMENT_METHOD_VALUES = {m.value for m in PaymentMethod}


# --- Transactions ---


def list_transactions(
    db: Session,
    *,
    org_id: uuid.UUID,
    page_params: PageParams,
    type_: TransactionType | None,
    category: str | None,
    date_from: date | None,
    date_to: date | None,
) -> Page[TransactionResponse]:
    conditions = [Transaction.organization_id == org_id]
    if type_ is not None:
        conditions.append(Transaction.type == type_)
    if category is not None:
        conditions.append(Transaction.category == category)
    if date_from is not None:
        conditions.append(Transaction.date >= date_from)
    if date_to is not None:
        conditions.append(Transaction.date <= date_to)

    total = db.execute(select(func.count(Transaction.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(Transaction)
            .where(*conditions)
            .order_by(Transaction.date.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[TransactionResponse](
        items=[TransactionResponse.model_validate(r) for r in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def create_transaction(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: TransactionCreateRequest
) -> Transaction:
    txn = Transaction(
        organization_id=org_id,
        type=data.type,
        category=data.category,
        sub_category=data.sub_category,
        amount=data.amount,
        currency=data.currency,
        description=data.description,
        date=data.date or datetime.now(UTC).date(),
        payment_method=data.payment_method,
        reference=data.reference,
        invoice_id=data.invoice_id,
        vendor_name=data.vendor_name,
        vendor_contact=data.vendor_contact,
        vendor_gstin=data.vendor_gstin,
        gst_amount=data.gst_amount,
        tds_amount=data.tds_amount,
        is_recurring=data.is_recurring,
        recurring_frequency=data.recurring_frequency,
        tags=data.tags,
        approved_by_id=data.approved_by_id,
        notes=data.notes,
        created_by_id=actor.id,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def get_summary(db: Session, *, org_id: uuid.UUID, period: str) -> TransactionSummaryResponse:
    now = datetime.now(UTC)
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=7)
    elif period == "year":
        start_date = now - timedelta(days=365)
    else:
        start_date = now - timedelta(days=30)
    start = start_date.date()

    income_total = db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.organization_id == org_id, Transaction.type == TransactionType.INCOME, Transaction.date >= start
        )
    ).scalar_one()
    expense_total = db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.organization_id == org_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= start,
        )
    ).scalar_one()
    category_rows = db.execute(
        select(Transaction.type, Transaction.category, func.sum(Transaction.amount))
        .where(Transaction.organization_id == org_id, Transaction.date >= start)
        .group_by(Transaction.type, Transaction.category)
    ).all()

    return TransactionSummaryResponse(
        total_income=float(income_total or 0),
        total_expense=float(expense_total or 0),
        net_profit=float(income_total or 0) - float(expense_total or 0),
        category_breakdown=[
            CategoryBreakdownRow(type=t, category=c, total=float(total or 0)) for t, c, total in category_rows
        ],
    )


# --- Invoices ---


def _next_invoice_number(db: Session, *, org_id: uuid.UUID) -> str:
    now = datetime.now(UTC)
    prefix = f"INV-{now.year}{now.month:02d}-"
    for _ in range(10):
        candidate = f"{prefix}{random.randint(1000, 9999)}"
        existing = db.execute(
            select(Invoice.id).where(Invoice.organization_id == org_id, Invoice.invoice_number == candidate)
        ).scalar_one_or_none()
        if existing is None:
            return candidate
    raise AppError(
        "invoice_number_exhausted", "Could not generate a unique invoice number, try again.", status_code=500
    )


def _compute_line_items(items: list[dict[str, object]]) -> tuple[list[dict[str, object]], float, float, float]:
    subtotal = 0.0
    total_gst = 0.0
    total_discount = 0.0
    computed: list[dict[str, object]] = []
    for item in items:
        quantity = float(item.get("quantity") or 0)  # type: ignore[arg-type]
        unit_price = float(item.get("unit_price") or 0)  # type: ignore[arg-type]
        discount = float(item.get("discount") or 0)  # type: ignore[arg-type]
        gst_rate = float(item.get("gst_rate") if item.get("gst_rate") is not None else 18)  # type: ignore[arg-type]
        item_total = quantity * unit_price - discount
        gst_amount = item_total * gst_rate / 100
        subtotal += item_total
        total_gst += gst_amount
        total_discount += discount
        computed.append({**item, "gst_amount": round(gst_amount, 2), "total": round(item_total + gst_amount, 2)})
    return computed, round(subtotal, 2), round(total_gst, 2), round(total_discount, 2)


def _get_invoice_or_404(db: Session, *, org_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
    invoice = db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    ).scalar_one_or_none()
    if invoice is None:
        raise NotFoundError("Invoice not found.")
    return invoice


def list_invoices(
    db: Session, *, org_id: uuid.UUID, page_params: PageParams, status: InvoiceStatus | None
) -> Page[InvoiceResponse]:
    conditions = [Invoice.organization_id == org_id]
    if status is not None:
        conditions.append(Invoice.status == status)

    total = db.execute(select(func.count(Invoice.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(Invoice)
            .where(*conditions)
            .order_by(Invoice.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[InvoiceResponse](
        items=[InvoiceResponse.model_validate(r) for r in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def get_invoice(db: Session, *, org_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
    return _get_invoice_or_404(db, org_id=org_id, invoice_id=invoice_id)


def create_invoice(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: InvoiceCreateRequest) -> Invoice:
    items = [item.model_dump(mode="json") for item in data.line_items]
    computed_items, subtotal, total_gst, total_discount = _compute_line_items(items)
    raw_total = subtotal + total_gst
    total_amount = round(raw_total)
    round_off = round(total_amount - raw_total, 2)

    invoice = Invoice(
        organization_id=org_id,
        invoice_number=_next_invoice_number(db, org_id=org_id),
        type=data.type,
        status=data.status,
        client_name=data.client_name,
        client_email=data.client_email,
        client_phone=data.client_phone,
        client_address=data.client_address,
        client_gstin=data.client_gstin,
        client_state=data.client_state,
        client_state_code=data.client_state_code,
        lead_id=data.lead_id,
        sample_id=data.sample_id,
        line_items=computed_items,
        subtotal=subtotal,
        total_discount=total_discount,
        total_gst=total_gst,
        round_off=round_off,
        total_amount=total_amount,
        paid_amount=0,
        balance_amount=total_amount,
        issue_date=datetime.now(UTC).date(),
        due_date=data.due_date,
        payment_terms=data.payment_terms,
        notes=data.notes,
        terms=data.terms,
        signatory_name=data.signatory_name,
        created_by_id=actor.id,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def update_invoice(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, invoice_id: uuid.UUID, data: InvoiceUpdateRequest
) -> Invoice:
    invoice = _get_invoice_or_404(db, org_id=org_id, invoice_id=invoice_id)
    if invoice.status == InvoiceStatus.PAID:
        raise AppError("invoice_paid", "Paid invoices cannot be edited.", status_code=400)

    updates = data.model_dump(exclude_unset=True, exclude={"line_items"})
    for field, value in updates.items():
        setattr(invoice, field, value)

    if data.line_items is not None:
        items = [item.model_dump(mode="json") for item in data.line_items]
        computed_items, subtotal, total_gst, total_discount = _compute_line_items(items)
        raw_total = subtotal + total_gst
        total_amount = round(raw_total)
        invoice.line_items = computed_items
        invoice.subtotal = subtotal
        invoice.total_gst = total_gst
        invoice.total_discount = total_discount
        invoice.total_amount = total_amount
        invoice.round_off = round(total_amount - raw_total, 2)
        invoice.balance_amount = total_amount - invoice.paid_amount

    invoice.updated_by_id = actor.id
    db.commit()
    db.refresh(invoice)
    return invoice


def delete_invoice(db: Session, *, org_id: uuid.UUID, invoice_id: uuid.UUID) -> None:
    invoice = _get_invoice_or_404(db, org_id=org_id, invoice_id=invoice_id)
    if invoice.status == InvoiceStatus.PAID:
        raise AppError("invoice_paid", "Paid invoices cannot be deleted.", status_code=400)
    db.delete(invoice)
    db.commit()


def update_invoice_status(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, invoice_id: uuid.UUID, data: InvoiceStatusUpdateRequest
) -> Invoice:
    invoice = _get_invoice_or_404(db, org_id=org_id, invoice_id=invoice_id)
    if invoice.status == InvoiceStatus.PAID:
        raise AppError("invoice_paid", "Paid invoices cannot be edited.", status_code=400)
    if data.status not in _STATUS_PATCHABLE:
        raise AppError(
            "invalid_status", "Only draft, sent, or cancelled can be set through this endpoint.", status_code=400
        )
    invoice.status = data.status
    invoice.updated_by_id = actor.id
    db.commit()
    db.refresh(invoice)
    return invoice


def record_payment(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, invoice_id: uuid.UUID, data: InvoicePaymentRequest
) -> Invoice:
    invoice = _get_invoice_or_404(db, org_id=org_id, invoice_id=invoice_id)

    normalized_method = data.method.strip().lower().replace(" ", "_")
    payment_method = (
        PaymentMethod(normalized_method) if normalized_method in _PAYMENT_METHOD_VALUES else PaymentMethod.OTHER
    )
    now = datetime.now(UTC)

    db.add(
        Transaction(
            organization_id=org_id,
            type=TransactionType.INCOME,
            category="Invoice Payment",
            amount=data.amount,
            description=f"Payment for Invoice {invoice.invoice_number}",
            date=now.date(),
            payment_method=payment_method,
            reference=data.reference,
            invoice_id=invoice.id,
            created_by_id=actor.id,
        )
    )

    payment_history = list(invoice.payment_history or [])
    payment_history.append(
        {
            "amount": data.amount,
            "method": data.method,
            "date": now.isoformat(),
            "reference": data.reference,
            "notes": data.notes,
        }
    )
    invoice.payment_history = payment_history
    invoice.paid_amount += data.amount
    invoice.balance_amount = invoice.total_amount - invoice.paid_amount
    invoice.status = InvoiceStatus.PAID if invoice.balance_amount <= 0 else InvoiceStatus.PARTIALLY_PAID
    if invoice.status == InvoiceStatus.PAID:
        invoice.paid_date = now.date()
    invoice.updated_by_id = actor.id

    db.commit()
    db.refresh(invoice)
    return invoice


def get_invoice_stats(db: Session, *, org_id: uuid.UUID) -> InvoiceStatsResponse:
    now = datetime.now(UTC)
    month_start = now.replace(day=1).date()

    def _bucket(*conditions: ColumnElement[bool]) -> InvoiceStatBucket:
        row = db.execute(
            select(func.coalesce(func.sum(Invoice.balance_amount), 0), func.count(Invoice.id)).where(
                Invoice.organization_id == org_id, *conditions
            )
        ).one()
        return InvoiceStatBucket(amount=float(row[0] or 0), count=row[1])

    outstanding = _bucket(Invoice.status.in_([InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID]))
    overdue = _bucket(Invoice.status == InvoiceStatus.OVERDUE)

    paid_row = db.execute(
        select(func.coalesce(func.sum(Invoice.total_amount), 0), func.count(Invoice.id)).where(
            Invoice.organization_id == org_id, Invoice.status == InvoiceStatus.PAID, Invoice.paid_date >= month_start
        )
    ).one()
    paid_this_month = InvoiceStatBucket(amount=float(paid_row[0] or 0), count=paid_row[1])

    draft_count = db.execute(
        select(func.count(Invoice.id)).where(Invoice.organization_id == org_id, Invoice.status == InvoiceStatus.DRAFT)
    ).scalar_one()
    total_count = db.execute(select(func.count(Invoice.id)).where(Invoice.organization_id == org_id)).scalar_one()

    return InvoiceStatsResponse(
        outstanding=outstanding,
        paid_this_month=paid_this_month,
        overdue=overdue,
        draft_count=draft_count,
        total_count=total_count,
    )
