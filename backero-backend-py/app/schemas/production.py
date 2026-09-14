"""Request/response schemas for Production (ProductionOrder Batch Tracker,
ProductionCustomer, ProductionUsage — Phase 3 core)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.production import (
    ProductionOrderPriority,
    ProductionOrderStatus,
    ProductionQualityStatus,
    ProductionUsageType,
)


class ProductionCustomerCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    contact: str | None = None
    lead_id: uuid.UUID | None = None
    default_container: str | None = None
    saved_crm_spec: dict[str, object] | None = None


class ProductionCustomerUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    contact: str | None = None
    default_container: str | None = None
    saved_crm_spec: dict[str, object] | None = None


class ProductionCustomerResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    contact: str | None
    lead_id: uuid.UUID | None
    default_container: str | None
    saved_crm_spec: dict[str, object] | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UsageIssueRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    material_id: uuid.UUID
    quantity: float = Field(gt=0)
    purpose: str | None = None
    notes: str | None = None


class UsageReturnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: float = Field(gt=0)
    notes: str | None = None


class ProductionUsageResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    issue_number: str
    type: ProductionUsageType
    material_id: uuid.UUID
    material_code: str | None
    material_name: str | None
    unit: str | None
    quantity: float
    purpose: str | None
    notes: str | None
    taken_by_id: uuid.UUID | None
    return_of_id: uuid.UUID | None
    production_order_id: uuid.UUID | None
    batch_deductions: list[dict[str, object]] | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductionOrderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalog_product_id: uuid.UUID | None = None
    batch_size_kg: float | None = None
    planned_quantity: float = 0
    unit: str = "pcs"
    customer: str | None = None
    contact: str | None = None
    container: str | None = None
    priority: ProductionOrderPriority = ProductionOrderPriority.NORMAL
    delivery_date: str | None = None
    notes: str | None = None
    lead_id: uuid.UUID | None = None
    crm_spec: dict[str, object] | None = None


class ProductionOrderEditRequest(BaseModel):
    """Stage-0 "Order" panel — editable at any stage."""

    model_config = ConfigDict(extra="forbid")

    customer: str | None = None
    contact: str | None = None
    container: str | None = None
    priority: ProductionOrderPriority | None = None
    delivery_date: str | None = None
    notes: str | None = None
    batch_size_kg: float | None = None
    planned_quantity: float | None = None
    crm_spec: dict[str, object] | None = None


class StatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ProductionOrderStatus
    notes: str | None = None


class QualityCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    check_type: str | None = None
    result: str = Field(pattern="^(pass|fail|conditional)$")
    notes: str | None = None
    images: list[str] | None = None


class WeighingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_material_id: str
    actual_qty: float | None = None


class ProcessStepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int = Field(ge=0)


class FinalQCRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approve: bool = True
    weight_check: str | None = None
    visual_check: str | None = None
    label_check: str | None = None
    seal_check: str | None = None
    leak_check: str | None = None
    print_check: str | None = None
    carton_check: str | None = None
    comment: str | None = None


class ProductionOrderResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    order_number: str
    procurement_id: str | None
    weighing_id: str | None
    bulk_qc_id: str | None
    packaging_id: str | None
    final_qc_id: str | None
    finished_product_id: uuid.UUID | None
    planned_quantity: float
    completed_quantity: float
    rejected_quantity: float
    unit: str
    batch: str
    status: ProductionOrderStatus
    lead_id: uuid.UUID | None
    catalog_product_id: uuid.UUID | None
    batch_size_kg: float | None
    stage: int
    customer: str | None
    contact: str | None
    container: str | None
    priority: ProductionOrderPriority
    delivery_date: str | None
    notes: str | None
    crm_spec: dict[str, object] | None
    ingredients: list[dict[str, object]] | None
    work_assignment: dict[str, object] | None
    process_steps: list[dict[str, object]] | None
    bulk_qc: dict[str, object] | None
    packaging: dict[str, object] | None
    final_qc: dict[str, object] | None
    dispatch_record: dict[str, object] | None
    bom: list[dict[str, object]] | None
    planned_start_date: datetime | None
    planned_end_date: datetime | None
    actual_start_date: datetime | None
    actual_end_date: datetime | None
    assigned_to_id: uuid.UUID | None
    supervised_by_id: uuid.UUID | None
    quality_checks: list[dict[str, object]] | None
    quality_status: ProductionQualityStatus
    lab_notes: str | None
    formula_version: str | None
    packaging_notes: str | None
    packaging_completed: bool
    estimated_cost: float
    actual_cost: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductionStatsResponse(BaseModel):
    by_status: dict[str, int]
