from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.models.finance import InvoiceStatus, TransactionType
from app.models.workflow_user import WorkflowUser
from app.modules.finance import service
from app.modules.workflow_auth.dependencies import get_current_workflow_user
from app.schemas.finance import (
    InvoiceCreateRequest,
    InvoicePaymentRequest,
    InvoiceResponse,
    InvoiceStatsResponse,
    InvoiceStatusUpdateRequest,
    InvoiceUpdateRequest,
    TransactionCreateRequest,
    TransactionResponse,
    TransactionSummaryResponse,
)

router = APIRouter(prefix="/workflow/finance", tags=["workflow-finance"])


@router.get("/transactions", response_model=Page[TransactionResponse])
def list_transactions(
    type: TransactionType | None = Query(default=None),  # noqa: A002
    category: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[TransactionResponse]:
    return service.list_transactions(
        db,
        org_id=current_user.organization_id,
        page_params=page_params,
        type_=type,
        category=category,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/transactions", response_model=TransactionResponse, status_code=201)
def create_transaction(
    body: TransactionCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TransactionResponse:
    txn = service.create_transaction(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return TransactionResponse.model_validate(txn)


@router.get("/summary", response_model=TransactionSummaryResponse)
def get_summary(
    period: str = Query(default="month"),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> TransactionSummaryResponse:
    return service.get_summary(db, org_id=current_user.organization_id, period=period)


@router.get("/invoices", response_model=Page[InvoiceResponse])
def list_invoices(
    status: InvoiceStatus | None = Query(default=None),
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
    page_params: PageParams = Depends(),
) -> Page[InvoiceResponse]:
    return service.list_invoices(db, org_id=current_user.organization_id, page_params=page_params, status=status)


@router.post("/invoices", response_model=InvoiceResponse, status_code=201)
def create_invoice(
    body: InvoiceCreateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    invoice = service.create_invoice(db, org_id=current_user.organization_id, actor=current_user, data=body)
    return InvoiceResponse.model_validate(invoice)


@router.get("/invoices/stats", response_model=InvoiceStatsResponse)
def get_invoice_stats(
    current_user: WorkflowUser = Depends(get_current_workflow_user), db: Session = Depends(get_db)
) -> InvoiceStatsResponse:
    return service.get_invoice_stats(db, org_id=current_user.organization_id)


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    invoice = service.get_invoice(db, org_id=current_user.organization_id, invoice_id=invoice_id)
    return InvoiceResponse.model_validate(invoice)


@router.put("/invoices/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    invoice_id: uuid.UUID,
    body: InvoiceUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    invoice = service.update_invoice(
        db, org_id=current_user.organization_id, actor=current_user, invoice_id=invoice_id, data=body
    )
    return InvoiceResponse.model_validate(invoice)


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: uuid.UUID,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> None:
    service.delete_invoice(db, org_id=current_user.organization_id, invoice_id=invoice_id)


@router.patch("/invoices/{invoice_id}/status", response_model=InvoiceResponse)
def update_invoice_status(
    invoice_id: uuid.UUID,
    body: InvoiceStatusUpdateRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    invoice = service.update_invoice_status(
        db, org_id=current_user.organization_id, actor=current_user, invoice_id=invoice_id, data=body
    )
    return InvoiceResponse.model_validate(invoice)


@router.patch("/invoices/{invoice_id}/payment", response_model=InvoiceResponse)
def record_payment(
    invoice_id: uuid.UUID,
    body: InvoicePaymentRequest,
    current_user: WorkflowUser = Depends(get_current_workflow_user),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    invoice = service.record_payment(
        db, org_id=current_user.organization_id, actor=current_user, invoice_id=invoice_id, data=body
    )
    return InvoiceResponse.model_validate(invoice)
