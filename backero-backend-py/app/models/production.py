"""CatalogProduct (+ CatalogFormulationVersion), ProductionCustomer,
ProductionOrder, ProductionUsage — ported from Task_Workflow's Mongoose
`CatalogProduct`, `ProductionCustomer`, `ProductionOrder`, `ProductionUsage`
models (Phase 3 core — Production). See app/models/inventory.py for the
raw-material consolidation decision (`ProductionUsage.material_id` FKs to
`InventoryItem`, not a separate `RawMaterial` table — fixing the source's
own ref/reality mismatch).

`CatalogProduct.formulation_versions` mirrors the same versioned-subdocument
pattern already used for CRM's `LeadCustomFormula`/`LeadFormulaVersion`
(draft/testing/locked/archived lifecycle, clone-from-version, activate
copies the version's rows back onto the parent's live `formulation` field)
— same shape, different owner. The deeply-nested, rarely-queried settings
blobs (`standard_assumptions`, `rnd`, `production_overhead`, `packaging`,
`costing`, `marketplace`, `documents`) stay JSONB, matching every other
"whole-blob read/write, never joined" field in this port.

`ProductionOrder`'s per-stage subdocuments (`ingredients`, `work_assignment`,
`process_steps`, `bulk_qc`, `packaging`, `final_qc`, `dispatch_record`,
`bom`, `quality_checks`) also stay JSONB — the source itself treats most of
these as whole-object `{...req.body}` spreads per stage transition, not
individually-queried fields.

Deliberately deferred (documented per-route in the service layer):
Cloudinary attachments (catalog product image, R&D/procedure attachments,
per-version R&D attachment), the xlsx/JSON bulk-import endpoints, the
`invoice_id` FK (Invoice is Phase 4 — the ≥50%-paid work-assignment payment
gate is skipped until then), WhatsApp dispatch (dispatch confirmations,
stage-change client messages — Phase 5), and the entire `ScheduleWeek`
Batch Tracker scheduling subsystem (`productionSchedule.routes.js`, ~9
endpoints — a separate, genuinely complex double-booking/freeze/fairness-
credit system, deferred to Phase 3b).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Enum as SAEnum
from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class CatalogProductStatus(StrEnum):
    ACTIVE = "Active"
    DISCONTINUED = "Discontinued"


class CatalogProduct(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "catalog_products"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    sub_category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="ml")
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    gst_rate: Mapped[float] = mapped_column(Float, nullable=False, default=18)
    hsn_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    shelf_life: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    status: Mapped[CatalogProductStatus] = mapped_column(
        SAEnum(CatalogProductStatus, name="catalog_product_status", native_enum=True),
        nullable=False,
        default=CatalogProductStatus.ACTIVE,
        index=True,
    )
    discontinued_date: Mapped[date | None] = mapped_column(nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage: Mapped[str | None] = mapped_column(Text, nullable=True)
    certifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(128), nullable=True)
    image: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # {ref_weight, ref_unit, rows: [{raw_material_id, name, percentage,
    #  quantity, unit, cost_per_kg, phase, conv_factor, notes}, ...]} — the
    # *live* formulation, synced from the activated formulation version.
    formulation: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    variants: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    standard_assumptions: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    rnd: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    rnd_doc: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    research_guide: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    procedure: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    documents: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    production_overhead: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    packaging: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    costing: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    marketplace: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    history: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class FormulationVersionStatus(StrEnum):
    DRAFT = "draft"
    TESTING = "testing"
    LOCKED = "locked"
    ARCHIVED = "archived"


class CatalogFormulationVersion(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "catalog_formulation_versions"

    catalog_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("catalog_products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_label: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[FormulationVersionStatus] = mapped_column(
        SAEnum(FormulationVersionStatus, name="catalog_formulation_version_status", native_enum=True),
        nullable=False,
        default=FormulationVersionStatus.DRAFT,
    )
    ref_weight: Mapped[float] = mapped_column(Float, nullable=False, default=100)
    ref_unit: Mapped[str] = mapped_column(String(16), nullable=False, default="ml")
    rows: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    change_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rnd_doc_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    research_guide_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(nullable=True)


class ProductionCustomer(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "production_customers"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True
    )
    default_container: Mapped[str | None] = mapped_column(String(255), nullable=True)
    saved_crm_spec: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class ProductionOrderStatus(StrEnum):
    PLANNED = "Planned"
    MATERIAL_ALLOCATED = "Material Allocated"
    IN_PRODUCTION = "In Production"
    QUALITY_CHECK = "Quality Check"
    PACKAGING = "Packaging"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class ProductionOrderPriority(StrEnum):
    LOW = "Low"
    NORMAL = "Normal"
    HIGH = "High"
    URGENT = "Urgent"


class ProductionQualityStatus(StrEnum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    CONDITIONAL = "conditional"


class ProductionOrder(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """The central 8-stage "Batch Tracker" document. `stage` (0-7) is the
    UI-driven source of truth; `status` is kept in sync as a derived legacy
    mirror at each stage transition (matches the source's
    `BATCH_STAGE_TO_STATUS` table, ported into the service layer)."""

    __tablename__ = "production_orders"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    order_number: Mapped[str] = mapped_column(String(64), nullable=False)
    procurement_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    weighing_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bulk_qc_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    packaging_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    final_qc_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    finished_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=True
    )
    planned_quantity: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    completed_quantity: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    rejected_quantity: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="pcs")
    batch: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[ProductionOrderStatus] = mapped_column(
        SAEnum(ProductionOrderStatus, name="production_order_status", native_enum=True),
        nullable=False,
        default=ProductionOrderStatus.PLANNED,
        index=True,
    )

    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    catalog_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("catalog_products.id"), nullable=True
    )
    batch_size_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    stage: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    customer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    container: Mapped[str | None] = mapped_column(String(255), nullable=True)
    priority: Mapped[ProductionOrderPriority] = mapped_column(
        SAEnum(ProductionOrderPriority, name="production_order_priority", native_enum=True),
        nullable=False,
        default=ProductionOrderPriority.NORMAL,
    )
    delivery_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    crm_spec: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    ingredients: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    work_assignment: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    process_steps: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    bulk_qc: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    packaging: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    final_qc: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    dispatch_record: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    bom: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    planned_start_date: Mapped[datetime | None] = mapped_column(nullable=True)
    planned_end_date: Mapped[datetime | None] = mapped_column(nullable=True)
    actual_start_date: Mapped[datetime | None] = mapped_column(nullable=True)
    actual_end_date: Mapped[datetime | None] = mapped_column(nullable=True)

    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    supervised_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )

    quality_checks: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
    quality_status: Mapped[ProductionQualityStatus] = mapped_column(
        SAEnum(ProductionQualityStatus, name="production_quality_status", native_enum=True),
        nullable=False,
        default=ProductionQualityStatus.PENDING,
    )

    lab_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula_version: Mapped[str | None] = mapped_column(String(32), nullable=True)

    packaging_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    packaging_completed: Mapped[bool] = mapped_column(nullable=False, default=False)

    estimated_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    actual_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    attachments: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )


class ProductionUsageType(StrEnum):
    ISSUE = "issue"
    RETURN = "return"


class ProductionUsage(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Raw-material issue/return ledger. `material_id` FKs to
    `InventoryItem` (fixing the source's `ref:'RawMaterial'` vs.
    actual-`Product`-query mismatch — see app/models/inventory.py)."""

    __tablename__ = "production_usages"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_organizations.id"), nullable=False, index=True
    )
    issue_number: Mapped[str] = mapped_column(String(32), nullable=False)
    type: Mapped[ProductionUsageType] = mapped_column(
        SAEnum(ProductionUsageType, name="production_usage_type", native_enum=True), nullable=False
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_items.id"), nullable=False, index=True
    )
    material_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    material_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    taken_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_users.id"), nullable=True
    )
    return_of_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_usages.id"), nullable=True
    )
    production_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_orders.id"), nullable=True
    )
    # [{batch_id, batch_number, qty}, ...]
    batch_deductions: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB, nullable=True)
