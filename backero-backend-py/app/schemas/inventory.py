"""Request/response schemas for Inventory (Phase 3 core)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.inventory import StockMovementType


class BatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_id: str | None = None
    quantity: float = 0
    total_price: float | None = None
    price: float | None = None
    batch_number: str | None = None
    expiry_date: date | None = None
    received_date: date | None = None
    location: str | None = None
    supplier: str | None = None
    invoice: str | None = None
    notes: str | None = None
    qc_checked_by: str | None = None
    qc_date: str | None = None
    qc_status: str = "pass"
    qc_notes: str | None = None


class InventoryItemCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    sku: str | None = Field(default=None, max_length=64)
    barcode: str | None = None
    category: str = Field(min_length=1, max_length=128)
    sub_category: str | None = None
    unit: str = "pcs"
    description: str | None = None
    cost_price: float = 0
    selling_price: float = 0
    mrp: float = 0
    gst_rate: float = 18
    hsn_code: str | None = None
    warehouse_location: str | None = None
    shelf: str | None = None
    supplier: str | None = None
    enable_min_stock: bool = True
    min_stock_level: float = 0
    max_stock_level: float | None = None
    reorder_point: float = 0
    reorder_quantity: float = 0
    is_raw_material: bool = False
    is_finished_good: bool = True
    is_sellable: bool = True
    qc_checker: str | None = None
    qc_number: str | None = None
    ref_check_number: str | None = None
    qc_passed: bool = False
    qc_notes: str | None = None
    product_type: str | None = None
    shelf_life: float | None = None
    certifications: str | None = None
    storage_conditions: str | None = None
    initial_stock: float | None = None
    initial_expiry: date | None = None
    initial_batch_number: str | None = None


class InventoryItemUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    barcode: str | None = None
    category: str | None = Field(default=None, min_length=1, max_length=128)
    sub_category: str | None = None
    unit: str | None = None
    description: str | None = None
    cost_price: float | None = None
    selling_price: float | None = None
    mrp: float | None = None
    gst_rate: float | None = None
    hsn_code: str | None = None
    warehouse_location: str | None = None
    shelf: str | None = None
    supplier: str | None = None
    enable_min_stock: bool | None = None
    min_stock_level: float | None = None
    max_stock_level: float | None = None
    reorder_point: float | None = None
    reorder_quantity: float | None = None
    qc_checker: str | None = None
    qc_number: str | None = None
    ref_check_number: str | None = None
    qc_passed: bool | None = None
    qc_notes: str | None = None
    product_type: str | None = None
    shelf_life: float | None = None
    certifications: str | None = None
    storage_conditions: str | None = None
    is_active: bool | None = None


class InventoryItemResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    sku: str
    barcode: str | None
    category: str
    sub_category: str | None
    unit: str
    description: str | None
    images: list[str] | None
    cost_price: float
    selling_price: float
    mrp: float
    gst_rate: float
    hsn_code: str | None
    batch_number: str | None
    last_stock_in: datetime | None
    current_stock: float
    min_stock_level: float
    max_stock_level: float | None
    reorder_point: float
    reorder_quantity: float
    warehouse_location: str | None
    shelf: str | None
    supplier: str | None
    enable_min_stock: bool
    batches: list[dict[str, object]] | None
    qc_checker: str | None
    qc_number: str | None
    ref_check_number: str | None
    qc_passed: bool
    qc_notes: str | None
    product_type: str | None
    shelf_life: float | None
    certifications: str | None
    storage_conditions: str | None
    variants: list[dict[str, object]] | None
    is_raw_material: bool
    is_finished_good: bool
    is_sellable: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StockInRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: uuid.UUID
    quantity: float = Field(gt=0)
    unit_price: float | None = None
    notes: str | None = None
    batch: str | None = None
    reference: str | None = None


class StockOutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: uuid.UUID
    quantity: float = Field(gt=0)
    notes: str | None = None
    reference: str | None = None


class AdjustmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: uuid.UUID
    new_stock: float = Field(ge=0)
    notes: str | None = None


class StockMovementResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    product_id: uuid.UUID
    type: StockMovementType
    quantity: float
    previous_stock: float
    new_stock: float
    unit_price: float
    total_value: float
    reference_type: str | None
    reference_id: uuid.UUID | None
    reference_number: str | None
    notes: str | None
    batch: str | None
    created_by_id: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InventoryAnalyticsResponse(BaseModel):
    total_active: int
    low_stock_count: int
    by_category: list[dict[str, object]]
    total_value: float


class RawMaterialStatsResponse(BaseModel):
    total_value: float
    out_of_stock_count: int
    low_stock_count: int
    expiring_count: int
