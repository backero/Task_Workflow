"""InventoryItem (+ StockMovement) — ported from Task_Workflow's Mongoose
`Product` and `StockMovement` models (Phase 3 core — Inventory).

Deliberate consolidation: the source has **two parallel, non-synced
raw-material representations** — `Product{isRawMaterial:true}` (used by
`inventory.routes.js`, `production.routes.js`, and
`catalog.routes.js#resolveIngredients` — the actively-developed one, with
batches/QC/stats) and a separate `RawMaterial` model (used only by
`rawmaterial.routes.js`, plus a `ProductionUsage.materialId` ref that
*claims* to point at `RawMaterial` but whose controller code actually
queries `Product`). This port collapses both into one `InventoryItem` table
with `is_raw_material`/`is_finished_good`/`is_sellable` flags — the shape
`Product` already had — and drops the standalone `RawMaterial` model
entirely. `ProductionUsage.material_id` (see app/models/production.py)
correctly FKs to this table, not a separate raw-material table.

`Product`'s `formulation`/`standardAssumptions`/`rnd`/`productionOverhead`/
`bomPackaging`/`costing`/`marketplace` fields are untyped Mongoose `Mixed`
blobs that duplicate the *strongly-typed* equivalents already on
`CatalogProduct` — they look like dead/legacy leftovers (the actively
maintained formulation/costing UI reads `CatalogProduct`'s typed version)
and are deliberately dropped rather than ported.

Deliberately deferred: xlsx import/template (`openpyxl`, a new dependency
decision), the `/qr` SVG endpoint (`qrcode` package, low priority), and the
missing StockMovement audit trail on raw-material creation/batch mutations
that the source itself never writes (a real gap noted in the source, not
fixed here since it's out of scope for a straight port — revisit if asked).
`batches`/`variants`/`marketplace_listings` stay JSONB: batch mutations
(FIFO deduction, weighted-avg cost recompute) are whole-list read-modify-
write operations in the source too (`markModified('batches')`), never
independently queried or joined.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class InventoryItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "inventory_items"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    barcode: Mapped[str | None] = mapped_column(String(128), nullable=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    sub_category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="pcs")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    images: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)

    cost_price: Mapped[float] = mapped_column(nullable=False, default=0)
    selling_price: Mapped[float] = mapped_column(nullable=False, default=0)
    mrp: Mapped[float] = mapped_column(nullable=False, default=0)
    gst_rate: Mapped[float] = mapped_column(nullable=False, default=18)
    hsn_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(128), nullable=True)

    last_stock_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_stock: Mapped[float] = mapped_column(nullable=False, default=0, index=True)
    min_stock_level: Mapped[float] = mapped_column(nullable=False, default=0)
    max_stock_level: Mapped[float | None] = mapped_column(nullable=True)
    reorder_point: Mapped[float] = mapped_column(nullable=False, default=0)
    reorder_quantity: Mapped[float] = mapped_column(nullable=False, default=0)

    warehouse_location: Mapped[str | None] = mapped_column(String(128), nullable=True)
    shelf: Mapped[str | None] = mapped_column(String(64), nullable=True)
    supplier: Mapped[str | None] = mapped_column(String(255), nullable=True)

    enable_min_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # [{batch_id, quantity, total_price, price, batch_number, expiry_date,
    #   received_date, location, supplier, invoice, notes, qc_checked_by,
    #   qc_date, qc_status, qc_notes}, ...]
    batches: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    qc_checker: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qc_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ref_check_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    qc_passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    qc_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    shelf_life: Mapped[float | None] = mapped_column(nullable=True)
    certifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    variants: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    is_raw_material: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    is_finished_good: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_sellable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    marketplace_listings: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class StockMovementType(StrEnum):
    IN = "IN"
    OUT = "OUT"
    ADJUSTMENT = "ADJUSTMENT"
    SALE = "SALE"
    PRODUCTION_USE = "PRODUCTION_USE"
    PRODUCTION_OUTPUT = "PRODUCTION_OUTPUT"
    QUALITY_TEST = "QUALITY_TEST"
    RETURN = "RETURN"


class StockMovement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """`reference_type`/`reference_id` is the same loose polymorphic-ref
    pair (no FK constraint) already used for `WorkflowOrganization.
    created_by_id` and friends elsewhere in this port — the source's
    `reference.model` can point at `ProductionOrder`, `Invoice`, `Task`, or
    just be a free-text `Manual` note."""

    __tablename__ = "stock_movements"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False, index=True
    )
    type: Mapped[StockMovementType] = mapped_column(
        SAEnum(StockMovementType, name="stock_movement_type", native_enum=True), nullable=False, index=True
    )
    quantity: Mapped[float] = mapped_column(nullable=False)
    previous_stock: Mapped[float] = mapped_column(nullable=False)
    new_stock: Mapped[float] = mapped_column(nullable=False)
    unit_price: Mapped[float] = mapped_column(nullable=False, default=0)
    total_value: Mapped[float] = mapped_column(nullable=False, default=0)

    reference_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(128), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(nullable=True)
    warehouse: Mapped[str | None] = mapped_column(String(128), nullable=True)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
