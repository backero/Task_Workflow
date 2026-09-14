"""Product Catalog business logic — ported from catalog.controller.js's
core routes. `formulationVersions` mirrors the same versioned-subdocument
pattern already used for CRM's LeadCustomFormula/LeadFormulaVersion (see
app/modules/leads/service.py's add_formula/update_formula) — lazy-seeds a
"V1" locked version from the live formulation the first time a version is
ever created, then draft/testing/locked/archived lifecycle with
clone-from-version and activate-copies-rows-back-onto-parent.

Deliberately NOT ported: image/attachment/R&D-attachment uploads
(Cloudinary — 3 separate upload flows in the source), the bulk JSON import
endpoint. `resolve_ingredients` IS ported since it's pure DB logic (no
upload) and is real, load-bearing business logic — it silently mutates the
raw-material master data (auto-creates an `InventoryItem` for any
ingredient name that doesn't already exist), exactly like the source.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.models.inventory import InventoryItem
from app.models.production import CatalogFormulationVersion, CatalogProduct, FormulationVersionStatus
from app.models.workflow_user import WorkflowUser
from app.schemas.catalog import (
    CatalogProductCreateRequest,
    CatalogProductResponse,
    CatalogProductUpdateRequest,
    FormulationVersionCreateRequest,
    FormulationVersionResponse,
    FormulationVersionUpdateRequest,
    ResolvedIngredient,
    ResolveIngredientsRequest,
)

_DEFAULT_PACKAGING = {
    "items": [
        {"name": "Bottle", "qty": 1, "rate": 0, "amount": 0, "optional": False},
        {"name": "Cap", "qty": 1, "rate": 0, "amount": 0, "optional": False},
        {"name": "Label", "qty": 1, "rate": 0, "amount": 0, "optional": False},
        {"name": "Carton", "qty": 1, "rate": 0, "amount": 0, "optional": False},
    ],
    "charges": {"machine": 0, "shrink_wrap": 0, "other": 0},
}
_DEFAULT_MARKETPLACE = {
    "packaging": [],
    "fees": {
        "flipkart": {"commission": 15, "fixed": 30, "shipping": 50, "collection": 2},
        "amazon": {"commission": 15, "fixed": 40, "shipping": 50, "fba": 3},
        "meesho": {"commission": 0, "shipping": 70, "collection": 0, "penalty": 2},
        "snapdeal": {"commission": 12, "fixed": 20, "shipping": 50, "collection": 1.5},
    },
    "margins": {"flipkart": 25, "amazon": 25, "meesho": 30, "snapdeal": 25},
}
_DEFAULT_STANDARD_ASSUMPTIONS = {
    "equipment_pct": 3,
    "consumables_pct": 1,
    "storage_pct": 2,
    "housekeeping_pct": 1,
    "admin_pct": 5,
    "wastage_pct": 2,
}
_DEFAULT_RND = {
    "testing": 0,
    "consumables": 0,
    "samples": 0,
    "overhead": 0,
    "other_overhead": 0,
    "qc": 0,
    "lifecycle": 1000,
}
_DEFAULT_COSTING = {
    "margins": {"ex_factory": 10, "dealer": 15, "distributor": 20, "retailer": 25, "selling": 35, "b2b": 20, "b2c": 40}
}


def _as_float(value: object, default: float = 0.0) -> float:
    if isinstance(value, bool) or value is None:
        return default
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _as_rows(value: object) -> list[dict[str, object]] | None:
    return value if isinstance(value, list) else None


def _text_field(blob: dict[str, object] | None) -> str | None:
    if not blob:
        return None
    value = blob.get("text")
    return str(value) if value is not None else None


def _get_product_or_404(db: Session, *, org_id: uuid.UUID, product_id: uuid.UUID) -> CatalogProduct:
    product = db.execute(
        select(CatalogProduct).where(CatalogProduct.id == product_id, CatalogProduct.organization_id == org_id)
    ).scalar_one_or_none()
    if product is None:
        raise NotFoundError("Catalog product not found.")
    return product


def _build_response(db: Session, *, product: CatalogProduct) -> CatalogProductResponse:
    versions = (
        db.execute(
            select(CatalogFormulationVersion)
            .where(CatalogFormulationVersion.catalog_product_id == product.id)
            .order_by(CatalogFormulationVersion.created_at.asc())
        )
        .scalars()
        .all()
    )
    return CatalogProductResponse(
        id=product.id,
        organization_id=product.organization_id,
        code=product.code,
        name=product.name,
        category=product.category,
        sub_category=product.sub_category,
        type=product.type,
        unit=product.unit,
        weight=product.weight,
        gst_rate=product.gst_rate,
        hsn_code=product.hsn_code,
        shelf_life=product.shelf_life,
        status=product.status,
        discontinued_date=product.discontinued_date,
        description=product.description,
        storage=product.storage,
        certifications=product.certifications,
        barcode=product.barcode,
        image=product.image,
        formulation=product.formulation,
        variants=product.variants,
        standard_assumptions=product.standard_assumptions,
        rnd=product.rnd,
        rnd_doc=product.rnd_doc,
        research_guide=product.research_guide,
        procedure=product.procedure,
        documents=product.documents,
        production_overhead=product.production_overhead,
        packaging=product.packaging,
        costing=product.costing,
        marketplace=product.marketplace,
        history=product.history,
        formulation_versions=[FormulationVersionResponse.model_validate(v) for v in versions],
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


def get_stats(db: Session, *, org_id: uuid.UUID) -> dict[str, object]:
    total = db.execute(
        select(func.count(CatalogProduct.id)).where(CatalogProduct.organization_id == org_id)
    ).scalar_one()
    active = db.execute(
        select(func.count(CatalogProduct.id)).where(
            CatalogProduct.organization_id == org_id, CatalogProduct.status == "ACTIVE"
        )
    ).scalar_one()
    discontinued = db.execute(
        select(func.count(CatalogProduct.id)).where(
            CatalogProduct.organization_id == org_id, CatalogProduct.status == "DISCONTINUED"
        )
    ).scalar_one()
    category_rows = db.execute(
        select(CatalogProduct.category, func.count(CatalogProduct.id))
        .where(CatalogProduct.organization_id == org_id)
        .group_by(CatalogProduct.category)
    ).all()
    return {
        "total": total,
        "active": active,
        "discontinued": discontinued,
        "by_category": [{"category": c, "count": cnt} for c, cnt in category_rows],
    }


def list_products(db: Session, *, org_id: uuid.UUID, search: str | None, category: str | None) -> list[CatalogProduct]:
    conditions = [CatalogProduct.organization_id == org_id]
    if category is not None:
        conditions.append(CatalogProduct.category == category)
    if search:
        like = f"%{search}%"
        conditions.append(CatalogProduct.name.ilike(like) | CatalogProduct.code.ilike(like))
    return list(
        db.execute(select(CatalogProduct).where(*conditions).order_by(CatalogProduct.name.asc()).limit(500))
        .scalars()
        .all()
    )


def get_product(db: Session, *, org_id: uuid.UUID, product_id: uuid.UUID) -> CatalogProductResponse:
    product = _get_product_or_404(db, org_id=org_id, product_id=product_id)
    return _build_response(db, product=product)


def create_product(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: CatalogProductCreateRequest
) -> CatalogProductResponse:
    code = data.code.strip().upper()
    existing = db.execute(
        select(CatalogProduct).where(CatalogProduct.organization_id == org_id, CatalogProduct.code == code)
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError("code_exists", f"Catalog product code {code} already exists.", status_code=409)

    now = datetime.now(UTC)
    product = CatalogProduct(
        organization_id=org_id,
        code=code,
        name=data.name,
        category=data.category,
        sub_category=data.sub_category,
        type=data.type,
        unit=data.unit,
        weight=data.weight,
        gst_rate=data.gst_rate,
        hsn_code=data.hsn_code,
        shelf_life=data.shelf_life,
        description=data.description,
        storage=data.storage,
        certifications=data.certifications,
        barcode=data.barcode,
        packaging=data.packaging or _DEFAULT_PACKAGING,
        marketplace=data.marketplace or _DEFAULT_MARKETPLACE,
        standard_assumptions=data.standard_assumptions or _DEFAULT_STANDARD_ASSUMPTIONS,
        rnd=data.rnd or _DEFAULT_RND,
        costing=data.costing or _DEFAULT_COSTING,
        history=[{"action": "Product created", "date": now.isoformat(), "detail": f"SKU: {code}"}],
        created_by_id=actor.id,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return _build_response(db, product=product)


def update_product(
    db: Session, *, org_id: uuid.UUID, product_id: uuid.UUID, data: CatalogProductUpdateRequest
) -> CatalogProductResponse:
    product = _get_product_or_404(db, org_id=org_id, product_id=product_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return _build_response(db, product=product)


def delete_product(db: Session, *, org_id: uuid.UUID, product_id: uuid.UUID) -> None:
    product = _get_product_or_404(db, org_id=org_id, product_id=product_id)
    db.delete(product)
    db.commit()


def _append_history(product: CatalogProduct, action: str, detail: str | None = None) -> None:
    history = list(product.history or [])
    history.append({"action": action, "date": datetime.now(UTC).isoformat(), "detail": detail})
    product.history = history


def add_formulation_version(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, product_id: uuid.UUID, data: FormulationVersionCreateRequest
) -> CatalogProductResponse:
    product = _get_product_or_404(db, org_id=org_id, product_id=product_id)
    versions = (
        db.execute(
            select(CatalogFormulationVersion)
            .where(CatalogFormulationVersion.catalog_product_id == product.id)
            .order_by(CatalogFormulationVersion.version_label.asc())
        )
        .scalars()
        .all()
    )

    if not versions:
        formulation = product.formulation or {}
        seed = CatalogFormulationVersion(
            catalog_product_id=product.id,
            version_label="V1",
            status=FormulationVersionStatus.LOCKED,
            ref_weight=_as_float(formulation.get("ref_weight"), 100),
            ref_unit=str(formulation.get("ref_unit") or "ml"),
            rows=_as_rows(formulation.get("rows")),
            rnd_doc_text=_text_field(product.rnd_doc),
            research_guide_text=_text_field(product.research_guide),
            created_by_id=actor.id,
            created_at=product.created_at,
            activated_at=product.created_at,
        )
        db.add(seed)
        db.flush()
        versions = [seed]

    clone_source: CatalogFormulationVersion | None = None
    if data.clone_from is not None:
        clone_source = next((v for v in versions if v.id == data.clone_from), None)

    now = datetime.now(UTC)
    if clone_source is not None:
        rows = clone_source.rows
        ref_weight = clone_source.ref_weight
        ref_unit = clone_source.ref_unit
        rnd_doc_text = clone_source.rnd_doc_text
        research_guide_text = clone_source.research_guide_text
        change_notes = data.change_notes or f"Cloned from {clone_source.version_label}"
    else:
        formulation = product.formulation or {}
        rows = _as_rows(formulation.get("rows"))
        ref_weight = _as_float(formulation.get("ref_weight"), 100)
        ref_unit = str(formulation.get("ref_unit") or "ml")
        rnd_doc_text = _text_field(product.rnd_doc)
        research_guide_text = _text_field(product.research_guide)
        change_notes = data.change_notes or "Cloned from live formulation"

    new_version = CatalogFormulationVersion(
        catalog_product_id=product.id,
        version_label=f"V{len(versions) + 1}",
        status=FormulationVersionStatus.DRAFT,
        ref_weight=ref_weight,
        ref_unit=ref_unit,
        rows=rows,
        change_notes=change_notes,
        rnd_doc_text=rnd_doc_text,
        research_guide_text=research_guide_text,
        created_by_id=actor.id,
        created_at=now,
    )
    db.add(new_version)
    _append_history(product, "Formulation version created", new_version.version_label)
    db.commit()
    db.refresh(product)
    return _build_response(db, product=product)


def _get_version_or_404(db: Session, *, product_id: uuid.UUID, version_id: uuid.UUID) -> CatalogFormulationVersion:
    version = db.execute(
        select(CatalogFormulationVersion).where(
            CatalogFormulationVersion.id == version_id, CatalogFormulationVersion.catalog_product_id == product_id
        )
    ).scalar_one_or_none()
    if version is None:
        raise NotFoundError("Formulation version not found.")
    return version


def update_formulation_version(
    db: Session,
    *,
    org_id: uuid.UUID,
    product_id: uuid.UUID,
    version_id: uuid.UUID,
    data: FormulationVersionUpdateRequest,
) -> CatalogProductResponse:
    product = _get_product_or_404(db, org_id=org_id, product_id=product_id)
    version = _get_version_or_404(db, product_id=product.id, version_id=version_id)
    if version.status in (FormulationVersionStatus.LOCKED, FormulationVersionStatus.ARCHIVED):
        raise AppError("version_locked", "This version is locked or archived and cannot be edited.", status_code=400)

    if data.rows is not None:
        version.rows = [r.model_dump() for r in data.rows]
    if data.ref_weight is not None:
        version.ref_weight = data.ref_weight
    if data.ref_unit is not None:
        version.ref_unit = data.ref_unit
    if data.change_notes is not None:
        version.change_notes = data.change_notes
    if data.status is not None and data.status in (FormulationVersionStatus.DRAFT, FormulationVersionStatus.TESTING):
        version.status = data.status
    if data.rnd_doc_text is not None:
        version.rnd_doc_text = data.rnd_doc_text
    if data.research_guide_text is not None:
        version.research_guide_text = data.research_guide_text

    db.commit()
    db.refresh(product)
    return _build_response(db, product=product)


def activate_formulation_version(
    db: Session, *, org_id: uuid.UUID, product_id: uuid.UUID, version_id: uuid.UUID
) -> CatalogProductResponse:
    product = _get_product_or_404(db, org_id=org_id, product_id=product_id)
    target = _get_version_or_404(db, product_id=product.id, version_id=version_id)

    other_versions = (
        db.execute(
            select(CatalogFormulationVersion).where(
                CatalogFormulationVersion.catalog_product_id == product.id,
                CatalogFormulationVersion.id != target.id,
                CatalogFormulationVersion.status == FormulationVersionStatus.LOCKED,
            )
        )
        .scalars()
        .all()
    )
    for other in other_versions:
        other.status = FormulationVersionStatus.ARCHIVED

    target.status = FormulationVersionStatus.LOCKED
    target.activated_at = datetime.now(UTC)

    product.formulation = {"ref_weight": target.ref_weight, "ref_unit": target.ref_unit, "rows": target.rows}
    product.rnd_doc = {**(product.rnd_doc or {}), "text": target.rnd_doc_text}
    product.research_guide = {**(product.research_guide or {}), "text": target.research_guide_text}
    _append_history(product, "Formulation version activated", target.version_label)

    db.commit()
    db.refresh(product)
    return _build_response(db, product=product)


def delete_formulation_version(db: Session, *, org_id: uuid.UUID, product_id: uuid.UUID, version_id: uuid.UUID) -> None:
    product = _get_product_or_404(db, org_id=org_id, product_id=product_id)
    version = _get_version_or_404(db, product_id=product.id, version_id=version_id)
    if version.status in (FormulationVersionStatus.LOCKED, FormulationVersionStatus.ARCHIVED):
        raise AppError("version_locked", "This version is locked or archived and cannot be deleted.", status_code=400)
    db.delete(version)
    db.commit()


def resolve_ingredients(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: ResolveIngredientsRequest
) -> list[ResolvedIngredient]:
    results: list[ResolvedIngredient] = []
    for ing in data.ingredients:
        existing = db.execute(
            select(InventoryItem).where(
                InventoryItem.organization_id == org_id,
                InventoryItem.is_raw_material.is_(True),
                func.lower(InventoryItem.name) == ing.name.strip().lower(),
            )
        ).scalar_one_or_none()
        if existing is not None:
            results.append(
                ResolvedIngredient(
                    name=ing.name,
                    raw_material_id=existing.id,
                    unit=existing.unit,
                    cost_per_kg=existing.cost_price,
                    is_new=False,
                )
            )
            continue

        count = db.execute(
            select(func.count(InventoryItem.id)).where(
                InventoryItem.organization_id == org_id, InventoryItem.is_raw_material.is_(True)
            )
        ).scalar_one()
        new_item = InventoryItem(
            organization_id=org_id,
            name=ing.name.strip(),
            sku=f"RM-{count + 1:04d}",
            category="Raw Materials",
            unit=ing.unit or "g",
            cost_price=ing.cost_per_kg or 0,
            current_stock=0,
            is_raw_material=True,
            is_finished_good=False,
            is_sellable=False,
            created_by_id=actor.id,
        )
        db.add(new_item)
        db.flush()
        results.append(
            ResolvedIngredient(
                name=ing.name,
                raw_material_id=new_item.id,
                unit=new_item.unit,
                cost_per_kg=new_item.cost_price,
                is_new=True,
            )
        )

    db.commit()
    return results
