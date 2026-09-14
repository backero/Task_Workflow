"""Request/response schemas for the Product Catalog (Phase 3 core)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.production import CatalogProductStatus, FormulationVersionStatus


class CatalogProductCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=128)
    sub_category: str | None = None
    type: str | None = None
    unit: str = "ml"
    weight: float = 0
    gst_rate: float = 18
    hsn_code: str | None = None
    shelf_life: float = 0
    description: str | None = None
    storage: str | None = None
    certifications: str | None = None
    barcode: str | None = None
    packaging: dict[str, object] | None = None
    marketplace: dict[str, object] | None = None
    standard_assumptions: dict[str, object] | None = None
    rnd: dict[str, object] | None = None
    costing: dict[str, object] | None = None


class CatalogProductUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = None
    sub_category: str | None = None
    type: str | None = None
    unit: str | None = None
    weight: float | None = None
    gst_rate: float | None = None
    hsn_code: str | None = None
    shelf_life: float | None = None
    status: CatalogProductStatus | None = None
    discontinued_date: date | None = None
    description: str | None = None
    storage: str | None = None
    certifications: str | None = None
    barcode: str | None = None
    variants: list[dict[str, object]] | None = None
    standard_assumptions: dict[str, object] | None = None
    rnd: dict[str, object] | None = None
    rnd_doc: dict[str, object] | None = None
    research_guide: dict[str, object] | None = None
    procedure: dict[str, object] | None = None
    documents: dict[str, object] | None = None
    production_overhead: dict[str, object] | None = None
    packaging: dict[str, object] | None = None
    costing: dict[str, object] | None = None
    marketplace: dict[str, object] | None = None


class FormulationVersionResponse(BaseModel):
    id: uuid.UUID
    catalog_product_id: uuid.UUID
    version_label: str
    status: FormulationVersionStatus
    ref_weight: float
    ref_unit: str
    rows: list[dict[str, object]] | None
    change_notes: str | None
    rnd_doc_text: str | None
    research_guide_text: str | None
    created_at: datetime
    activated_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class CatalogProductResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    code: str
    name: str
    category: str
    sub_category: str | None
    type: str | None
    unit: str
    weight: float
    gst_rate: float
    hsn_code: str | None
    shelf_life: float
    status: CatalogProductStatus
    discontinued_date: date | None
    description: str | None
    storage: str | None
    certifications: str | None
    barcode: str | None
    image: str | None
    formulation: dict[str, object] | None
    variants: list[dict[str, object]] | None
    standard_assumptions: dict[str, object] | None
    rnd: dict[str, object] | None
    rnd_doc: dict[str, object] | None
    research_guide: dict[str, object] | None
    procedure: dict[str, object] | None
    documents: dict[str, object] | None
    production_overhead: dict[str, object] | None
    packaging: dict[str, object] | None
    costing: dict[str, object] | None
    marketplace: dict[str, object] | None
    history: list[dict[str, object]] | None
    formulation_versions: list[FormulationVersionResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FormulationVersionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    change_notes: str | None = None
    clone_from: uuid.UUID | None = None


class FormulationRowInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_material_id: str | None = None
    name: str
    percentage: float = 0
    quantity: float = 0
    unit: str = "g"
    cost_per_kg: float = 0
    phase: str | None = None
    conv_factor: float = 1
    notes: str | None = None


class FormulationVersionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rows: list[FormulationRowInput] | None = None
    ref_weight: float | None = None
    ref_unit: str | None = None
    change_notes: str | None = None
    status: FormulationVersionStatus | None = None
    rnd_doc_text: str | None = None
    research_guide_text: str | None = None


class ResolveIngredientInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    unit: str | None = None
    cost_per_kg: float | None = None


class ResolveIngredientsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ingredients: list[ResolveIngredientInput]


class ResolvedIngredient(BaseModel):
    name: str
    raw_material_id: uuid.UUID
    unit: str
    cost_per_kg: float
    is_new: bool


class CatalogStatsResponse(BaseModel):
    total: int
    active: int
    discontinued: int
    by_category: list[dict[str, object]]
