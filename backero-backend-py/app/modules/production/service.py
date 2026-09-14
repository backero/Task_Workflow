"""Production business logic — ported from production.routes.js (inline
handlers, no separate controller), productioncustomer.routes.js, and
productionusage.controller.js's core routes.

`ProductionOrder` runs two overlapping lifecycles on the same row, exactly
as the source does: a coarse legacy `status` enum (`update_order_status`)
and the real UI-driven 8-stage "Batch Tracker" (`stage` 0-7, one function
per stage transition below) — `_BATCH_STAGE_TO_STATUS` keeps `status` in
sync as a derived mirror of `stage`, matching the source's own constant.

FIFO batch deduction (`_deduct_fifo`/`_recompute_stock`) is shared between
`record_issue` (ProductionUsage ledger) and `weigh_ingredient` (Batch
Tracker stage 3) — ported once here rather than duplicated, per the
source's own `services/inventory.service.js` sharing pattern.

Deliberate improvements over the source (documented, not silent): (1) the
`DELETE /production/:id` completed-order guard is a real source bug —it
compares `status==='completed'` (lowercase) against the actual enum value
`'Completed'`, so the check never fires and completed orders are NOT
protected from deletion today. This port compares against the real enum
value, so completed orders genuinely can't be hard-deleted. (2) `weighing`'s
no-batches-insufficient-stock fallback silently no-ops in the source
(quietly skips the deduction) instead of erroring, unlike `record_issue`'s
symmetric path which does error — this port makes both paths consistently
error with 400 when stock is insufficient, since silently not deducting
stock the UI just told the operator it deducted is a real correctness bug,
not a deliberate design choice worth preserving.

Deliberately deferred: the ≥50%-paid-invoice gate on work-assignment
(`Invoice` model is Phase 4), all WhatsApp/client-milestone dispatch (Phase
5 — the underlying state changes still happen), and the entire
`ScheduleWeek` Batch Tracker scheduling subsystem (Phase 3b).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.core.pagination import Page, PageParams
from app.models.inventory import InventoryItem, StockMovement, StockMovementType
from app.models.lead import Lead, LeadStageHistoryEntry, LeadStatus
from app.models.production import (
    CatalogProduct,
    ProductionCustomer,
    ProductionOrder,
    ProductionOrderStatus,
    ProductionUsage,
    ProductionUsageType,
)
from app.models.workflow_user import WorkflowUser
from app.schemas.production import (
    FinalQCRequest,
    ProcessStepRequest,
    ProductionCustomerCreateRequest,
    ProductionCustomerUpdateRequest,
    ProductionOrderCreateRequest,
    ProductionOrderEditRequest,
    ProductionOrderResponse,
    QualityCheckRequest,
    StatusUpdateRequest,
    UsageIssueRequest,
    UsageReturnRequest,
    WeighingRequest,
)

_BATCH_STAGE_TO_STATUS: dict[int, ProductionOrderStatus] = {
    1: ProductionOrderStatus.PLANNED,
    2: ProductionOrderStatus.MATERIAL_ALLOCATED,
    3: ProductionOrderStatus.IN_PRODUCTION,
    4: ProductionOrderStatus.QUALITY_CHECK,
    5: ProductionOrderStatus.PACKAGING,
    6: ProductionOrderStatus.QUALITY_CHECK,
    7: ProductionOrderStatus.COMPLETED,
}
_BATCH_PROCESS_STEPS = [
    "Heating",
    "Mixing",
    "Cooling",
    "pH Adjustment",
    "Viscosity Check",
    "Coloring",
    "Fragrance",
    "Filtration",
]


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


def _as_str(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _as_rows(value: object) -> list[dict[str, object]]:
    return value if isinstance(value, list) else []


# --- Production Customers ---


def list_customers(db: Session, *, org_id: uuid.UUID, search: str | None) -> list[ProductionCustomer]:
    conditions = [ProductionCustomer.organization_id == org_id]
    if search:
        conditions.append(ProductionCustomer.name.ilike(f"%{search}%"))
    return list(
        db.execute(select(ProductionCustomer).where(*conditions).order_by(ProductionCustomer.name.asc()).limit(200))
        .scalars()
        .all()
    )


def create_customer(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: ProductionCustomerCreateRequest
) -> ProductionCustomer:
    customer = ProductionCustomer(
        organization_id=org_id,
        name=data.name.strip(),
        contact=data.contact,
        lead_id=data.lead_id,
        default_container=data.default_container,
        saved_crm_spec=data.saved_crm_spec or {},
        created_by_id=actor.id,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def update_customer(
    db: Session, *, org_id: uuid.UUID, customer_id: uuid.UUID, data: ProductionCustomerUpdateRequest
) -> ProductionCustomer:
    customer = db.execute(
        select(ProductionCustomer).where(
            ProductionCustomer.id == customer_id, ProductionCustomer.organization_id == org_id
        )
    ).scalar_one_or_none()
    if customer is None:
        raise NotFoundError("Production customer not found.")

    if data.name is not None:
        customer.name = data.name
    if data.contact is not None:
        customer.contact = data.contact
    if data.default_container is not None:
        customer.default_container = data.default_container
    if data.saved_crm_spec is not None:
        customer.saved_crm_spec = {**(customer.saved_crm_spec or {}), **data.saved_crm_spec}

    db.commit()
    db.refresh(customer)
    return customer


# --- FIFO batch deduction (shared: record_issue / weigh_ingredient) ---


def _deduct_fifo(batches: list[dict[str, object]], qty: float) -> list[dict[str, object]] | None:
    remaining = qty
    ordered = sorted(batches, key=lambda b: str(b.get("received_date") or ""))
    deductions: list[dict[str, object]] = []
    for batch in ordered:
        if remaining <= 0:
            break
        available = _as_float(batch.get("quantity"), 0)
        if available <= 0:
            continue
        take = min(available, remaining)
        deductions.append({"batch_id": batch.get("batch_id"), "batch_number": batch.get("batch_number"), "qty": take})
        remaining -= take
    if remaining > 1e-9:
        return None
    return deductions


def _apply_fifo_deductions(item: InventoryItem, deductions: list[dict[str, object]]) -> None:
    # Rebuild fresh dicts rather than mutating batches already referenced by
    # item.batches in place — SQLAlchemy's JSONB history compares old-vs-new
    # by value, so an in-place mutation makes both sides look equal and the
    # UPDATE silently never gets issued.
    by_batch: dict[object, float] = {}
    for deduction in deductions:
        key = deduction.get("batch_id")
        by_batch[key] = by_batch.get(key, 0.0) + _as_float(deduction.get("qty"))

    new_batches: list[dict[str, object]] = []
    for batch in item.batches or []:
        key = batch.get("batch_id")
        if key in by_batch:
            updated = dict(batch)
            updated["quantity"] = _as_float(batch.get("quantity")) - by_batch[key]
            new_batches.append(updated)
        else:
            new_batches.append(batch)
    item.batches = new_batches
    item.current_stock = sum(_as_float(b.get("quantity")) for b in new_batches)


def _deduct_material(item: InventoryItem, qty: float) -> list[dict[str, object]] | None:
    """Returns FIFO deductions if the item has batch tracking, else `None`
    after falling back to a direct `current_stock` decrement. Raises if
    stock (batch or direct) is insufficient — see module docstring's
    deliberate-fix note for why this is now symmetric everywhere it's used."""
    batches = item.batches or []
    batch_stock = sum(_as_float(b.get("quantity"), 0) for b in batches)
    if batches and batch_stock >= qty:
        deductions = _deduct_fifo(batches, qty)
        if deductions is None:
            raise AppError("insufficient_stock", f"Insufficient stock for {item.name}.", status_code=400)
        _apply_fifo_deductions(item, deductions)
        return deductions

    if item.current_stock < qty:
        raise AppError("insufficient_stock", f"Insufficient stock for {item.name}.", status_code=400)
    item.current_stock -= qty
    return None


def _next_usage_number(db: Session, *, org_id: uuid.UUID, usage_type: ProductionUsageType) -> str:
    prefix = "PMI" if usage_type == ProductionUsageType.ISSUE else "PMR"
    count = db.execute(
        select(func.count(ProductionUsage.id)).where(
            ProductionUsage.organization_id == org_id, ProductionUsage.type == usage_type
        )
    ).scalar_one()
    return f"{prefix}-{count + 1:04d}"


# --- Production Usage (issue / return ledger) ---


def list_usage(
    db: Session, *, org_id: uuid.UUID, material_id: uuid.UUID | None, usage_type: ProductionUsageType | None
) -> list[ProductionUsage]:
    conditions = [ProductionUsage.organization_id == org_id]
    if material_id is not None:
        conditions.append(ProductionUsage.material_id == material_id)
    if usage_type is not None:
        conditions.append(ProductionUsage.type == usage_type)
    return list(
        db.execute(select(ProductionUsage).where(*conditions).order_by(ProductionUsage.created_at.desc()).limit(200))
        .scalars()
        .all()
    )


def record_issue(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: UsageIssueRequest) -> ProductionUsage:
    item = db.execute(
        select(InventoryItem).where(
            InventoryItem.id == data.material_id,
            InventoryItem.organization_id == org_id,
            InventoryItem.is_raw_material.is_(True),
        )
    ).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Raw material not found.")

    deductions = _deduct_material(item, data.quantity)

    usage = ProductionUsage(
        organization_id=org_id,
        issue_number=_next_usage_number(db, org_id=org_id, usage_type=ProductionUsageType.ISSUE),
        type=ProductionUsageType.ISSUE,
        material_id=item.id,
        material_code=item.sku,
        material_name=item.name,
        unit=item.unit,
        quantity=data.quantity,
        purpose=data.purpose,
        notes=data.notes,
        taken_by_id=actor.id,
        batch_deductions=deductions,
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)
    return usage


def record_return(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, issue_id: uuid.UUID, data: UsageReturnRequest
) -> ProductionUsage:
    issue = db.execute(
        select(ProductionUsage).where(
            ProductionUsage.id == issue_id,
            ProductionUsage.organization_id == org_id,
            ProductionUsage.type == ProductionUsageType.ISSUE,
        )
    ).scalar_one_or_none()
    if issue is None:
        raise NotFoundError("Issue record not found.")

    already_returned = db.execute(
        select(func.coalesce(func.sum(ProductionUsage.quantity), 0)).where(
            ProductionUsage.return_of_id == issue.id, ProductionUsage.type == ProductionUsageType.RETURN
        )
    ).scalar_one()
    max_returnable = issue.quantity - float(already_returned or 0)
    if data.quantity <= 0 or data.quantity > max_returnable:
        raise AppError(
            "invalid_return_quantity", f"Return quantity must be between 0 and {max_returnable}.", status_code=400
        )

    item = db.execute(select(InventoryItem).where(InventoryItem.id == issue.material_id)).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Raw material not found.")

    return_deductions: list[dict[str, object]] | None = None
    if issue.batch_deductions:
        remaining = data.quantity
        return_deductions = []
        give_back_by_batch: dict[object, float] = {}
        for deduction in issue.batch_deductions:
            if remaining <= 0:
                break
            original_qty = _as_float(deduction.get("qty"))
            give_back = min(original_qty, remaining)
            key = deduction.get("batch_id")
            give_back_by_batch[key] = give_back_by_batch.get(key, 0.0) + give_back
            return_deductions.append(
                {"batch_id": deduction.get("batch_id"), "batch_number": deduction.get("batch_number"), "qty": give_back}
            )
            remaining -= give_back

        # Fresh dicts, not in-place mutation — see _apply_fifo_deductions.
        new_batches: list[dict[str, object]] = []
        for batch in item.batches or []:
            key = batch.get("batch_id")
            if key in give_back_by_batch:
                updated = dict(batch)
                updated["quantity"] = _as_float(batch.get("quantity")) + give_back_by_batch[key]
                new_batches.append(updated)
            else:
                new_batches.append(batch)
        item.batches = new_batches
        item.current_stock = sum(_as_float(b.get("quantity")) for b in new_batches)
    else:
        item.current_stock += data.quantity

    usage = ProductionUsage(
        organization_id=org_id,
        issue_number=_next_usage_number(db, org_id=org_id, usage_type=ProductionUsageType.RETURN),
        type=ProductionUsageType.RETURN,
        material_id=item.id,
        material_code=item.sku,
        material_name=item.name,
        unit=item.unit,
        quantity=data.quantity,
        notes=data.notes,
        taken_by_id=actor.id,
        return_of_id=issue.id,
        batch_deductions=return_deductions,
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)
    return usage


# --- Production Orders ---


def _get_order_or_404(db: Session, *, org_id: uuid.UUID, order_id: uuid.UUID) -> ProductionOrder:
    order = db.execute(
        select(ProductionOrder).where(ProductionOrder.id == order_id, ProductionOrder.organization_id == org_id)
    ).scalar_one_or_none()
    if order is None:
        raise NotFoundError("Production order not found.")
    return order


def _next_order_number(db: Session, *, org_id: uuid.UUID) -> str:
    count = db.execute(
        select(func.count(ProductionOrder.id)).where(ProductionOrder.organization_id == org_id)
    ).scalar_one()
    year = datetime.now(UTC).year
    return f"PO-{year}-{count + 1:04d}"


def _build_ingredients_from_catalog(
    catalog_product: CatalogProduct, batch_size_kg: float | None
) -> list[dict[str, object]]:
    formulation = catalog_product.formulation or {}
    rows = _as_rows(formulation.get("rows"))
    ref_weight = _as_float(formulation.get("ref_weight"), 100)
    if not batch_size_kg or ref_weight <= 0:
        return []
    scale = (batch_size_kg * 1000) / ref_weight
    ingredients = []
    for row in rows:
        qty = _as_float(row.get("quantity"), 0)
        ingredients.append(
            {
                "raw_material_id": row.get("raw_material_id"),
                "name": row.get("name"),
                "unit": row.get("unit") or "g",
                "target_qty": round(qty * scale, 2),
            }
        )
    return ingredients


def list_orders(
    db: Session, *, org_id: uuid.UUID, page_params: PageParams, status: ProductionOrderStatus | None, search: str | None
) -> Page[ProductionOrderResponse]:
    conditions = [ProductionOrder.organization_id == org_id]
    if status is not None:
        conditions.append(ProductionOrder.status == status)
    if search:
        like = f"%{search}%"
        conditions.append(or_(ProductionOrder.order_number.ilike(like), ProductionOrder.batch.ilike(like)))

    total = db.execute(select(func.count(ProductionOrder.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(ProductionOrder)
            .where(*conditions)
            .order_by(ProductionOrder.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[ProductionOrderResponse](
        items=[ProductionOrderResponse.model_validate(r) for r in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def get_order(db: Session, *, org_id: uuid.UUID, order_id: uuid.UUID) -> ProductionOrder:
    return _get_order_or_404(db, org_id=org_id, order_id=order_id)


def create_order(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: ProductionOrderCreateRequest
) -> ProductionOrder:
    ingredients: list[dict[str, object]] = []
    if data.catalog_product_id is not None:
        catalog_product = db.execute(
            select(CatalogProduct).where(
                CatalogProduct.id == data.catalog_product_id, CatalogProduct.organization_id == org_id
            )
        ).scalar_one_or_none()
        if catalog_product is None:
            raise NotFoundError("Catalog product not found.")
        ingredients = _build_ingredients_from_catalog(catalog_product, data.batch_size_kg)

    order = ProductionOrder(
        organization_id=org_id,
        order_number=_next_order_number(db, org_id=org_id),
        batch=f"BATCH-{int(datetime.now(UTC).timestamp() * 1000)}",
        status=ProductionOrderStatus.PLANNED,
        stage=1,
        catalog_product_id=data.catalog_product_id,
        batch_size_kg=data.batch_size_kg,
        planned_quantity=data.planned_quantity,
        unit=data.unit,
        customer=data.customer,
        contact=data.contact,
        container=data.container,
        priority=data.priority,
        delivery_date=data.delivery_date,
        notes=data.notes,
        lead_id=data.lead_id,
        crm_spec=data.crm_spec or {},
        ingredients=ingredients or None,
        process_steps=[{"name": name, "done": False} for name in _BATCH_PROCESS_STEPS],
        created_by_id=actor.id,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def update_order_status(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: StatusUpdateRequest
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    previous_status = order.status
    order.status = data.status
    order.updated_by_id = actor.id

    if (
        previous_status == ProductionOrderStatus.MATERIAL_ALLOCATED
        and data.status == ProductionOrderStatus.IN_PRODUCTION
    ):
        order.actual_start_date = datetime.now(UTC)
        for bom_item in order.bom or []:
            product_id = bom_item.get("product_id")
            if not product_id:
                continue
            item = db.execute(
                select(InventoryItem).where(InventoryItem.id == uuid.UUID(str(product_id)))
            ).scalar_one_or_none()
            if item is None:
                continue
            qty = _as_float(bom_item.get("quantity"), 0)
            previous_stock = item.current_stock
            item.current_stock = max(0.0, item.current_stock - qty)
            db.add(
                StockMovement(
                    organization_id=org_id,
                    product_id=item.id,
                    type=StockMovementType.PRODUCTION_USE,
                    quantity=-qty,
                    previous_stock=previous_stock,
                    new_stock=item.current_stock,
                    reference_type="ProductionOrder",
                    reference_id=order.id,
                    reference_number=order.order_number,
                    created_by_id=actor.id,
                )
            )

    if data.status == ProductionOrderStatus.COMPLETED:
        order.actual_end_date = datetime.now(UTC)
        order.completed_quantity = order.planned_quantity
        if order.finished_product_id is not None:
            item = db.execute(
                select(InventoryItem).where(InventoryItem.id == order.finished_product_id)
            ).scalar_one_or_none()
            if item is not None:
                previous_stock = item.current_stock
                item.current_stock += order.completed_quantity
                db.add(
                    StockMovement(
                        organization_id=org_id,
                        product_id=item.id,
                        type=StockMovementType.PRODUCTION_OUTPUT,
                        quantity=order.completed_quantity,
                        previous_stock=previous_stock,
                        new_stock=item.current_stock,
                        batch=order.batch,
                        reference_type="ProductionOrder",
                        reference_id=order.id,
                        reference_number=order.order_number,
                        created_by_id=actor.id,
                    )
                )

    db.commit()
    db.refresh(order)
    return order


def add_quality_check(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: QualityCheckRequest
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    checks = list(order.quality_checks or [])
    checks.append(
        {
            "check_type": data.check_type,
            "result": data.result,
            "notes": data.notes,
            "checked_by_id": str(actor.id),
            "checked_at": datetime.now(UTC).isoformat(),
            "images": data.images or [],
        }
    )
    order.quality_checks = checks
    order.quality_status = data.result  # type: ignore[assignment]
    db.commit()
    db.refresh(order)
    return order


def delete_order(db: Session, *, org_id: uuid.UUID, order_id: uuid.UUID) -> None:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    if order.status == ProductionOrderStatus.COMPLETED:
        raise AppError("order_completed", "Completed orders cannot be deleted.", status_code=400)
    db.delete(order)
    db.commit()


def get_stats_overview(db: Session, *, org_id: uuid.UUID) -> dict[str, int]:
    rows = db.execute(
        select(ProductionOrder.status, func.count(ProductionOrder.id))
        .where(ProductionOrder.organization_id == org_id)
        .group_by(ProductionOrder.status)
    ).all()
    return {status.value: count for status, count in rows}


# --- Batch Tracker (8-stage) ---


def update_order_edit(
    db: Session, *, org_id: uuid.UUID, order_id: uuid.UUID, data: ProductionOrderEditRequest
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    updates = data.model_dump(exclude_unset=True, exclude={"crm_spec"})
    for field, value in updates.items():
        setattr(order, field, value)
    if data.crm_spec is not None:
        order.crm_spec = {**(order.crm_spec or {}), **data.crm_spec}
    db.commit()
    db.refresh(order)
    return order


def apply_work_assignment(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: dict[str, object]
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    order.work_assignment = {**(order.work_assignment or {}), **data}

    if order.stage == 1:
        order.stage = 2
        order.status = _BATCH_STAGE_TO_STATUS[2]
        order.procurement_id = f"{order.order_number}-PROC"

    order.updated_by_id = actor.id
    db.commit()
    db.refresh(order)
    return order


def confirm_procurement(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    if order.stage != 2:
        raise AppError("invalid_stage", "Order is not at the procurement stage.", status_code=400)

    ingredients = order.ingredients or []
    valid_ids = []
    for ing in ingredients:
        raw_id = ing.get("raw_material_id")
        try:
            valid_ids.append(uuid.UUID(str(raw_id)))
        except (ValueError, TypeError):
            continue

    stock_by_id: dict[uuid.UUID, float] = {}
    if valid_ids:
        rows = db.execute(
            select(InventoryItem.id, InventoryItem.current_stock).where(
                InventoryItem.id.in_(valid_ids), InventoryItem.organization_id == org_id
            )
        ).all()
        stock_by_id = {row[0]: row[1] for row in rows}

    shortages = []
    for ing in ingredients:
        raw_id_str = ing.get("raw_material_id")
        try:
            raw_id = uuid.UUID(str(raw_id_str))
        except (ValueError, TypeError):
            continue
        target = _as_float(ing.get("target_qty"), 0)
        have = stock_by_id.get(raw_id, 0.0)
        if have < target:
            shortages.append(f"{ing.get('name')}: need {target}, have {have}")

    if shortages:
        raise AppError("insufficient_stock", "Insufficient stock: " + "; ".join(shortages), status_code=422)

    order.stage = 3
    order.status = _BATCH_STAGE_TO_STATUS[3]
    order.weighing_id = f"{order.order_number}-WGH"
    order.updated_by_id = actor.id
    db.commit()
    db.refresh(order)
    return order


def weigh_ingredient(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: WeighingRequest
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    existing_ingredients = order.ingredients or []
    target = next(
        (ing for ing in existing_ingredients if str(ing.get("raw_material_id")) == data.raw_material_id), None
    )
    if target is None:
        raise NotFoundError("Ingredient not found on this order.")

    qty = data.actual_qty if data.actual_qty is not None else _as_float(target.get("target_qty"), 0)
    deductions = None
    try:
        material_uuid = uuid.UUID(data.raw_material_id)
    except ValueError:
        material_uuid = None

    if material_uuid is not None:
        item = db.execute(
            select(InventoryItem).where(InventoryItem.id == material_uuid, InventoryItem.is_raw_material.is_(True))
        ).scalar_one_or_none()
        if item is not None:
            deductions = _deduct_material(item, qty)
            db.add(
                ProductionUsage(
                    organization_id=org_id,
                    issue_number=_next_usage_number(db, org_id=org_id, usage_type=ProductionUsageType.ISSUE),
                    type=ProductionUsageType.ISSUE,
                    material_id=item.id,
                    material_code=item.sku,
                    material_name=item.name,
                    unit=item.unit,
                    quantity=qty,
                    purpose=f"Batch {order.batch} — {order.order_number}",
                    taken_by_id=actor.id,
                    production_order_id=order.id,
                    batch_deductions=deductions,
                )
            )

    # Fresh dicts, not in-place mutation of `target` — see
    # _apply_fifo_deductions's comment for why that would silently no-op.
    now_iso = datetime.now(UTC).isoformat()
    new_ingredients: list[dict[str, object]] = []
    for ing in existing_ingredients:
        if str(ing.get("raw_material_id")) == data.raw_material_id:
            updated = dict(ing)
            updated["actual_qty"] = qty
            updated["weighed_by_id"] = str(actor.id)
            updated["weighed_at"] = now_iso
            new_ingredients.append(updated)
        else:
            new_ingredients.append(ing)
    order.ingredients = new_ingredients

    db.commit()
    db.refresh(order)
    return order


def complete_process_step(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: ProcessStepRequest
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    steps = list(order.process_steps or [])
    if data.index >= len(steps):
        raise NotFoundError("Process step not found.")
    steps[data.index] = {
        **steps[data.index],
        "done": True,
        "completed_by_id": str(actor.id),
        "completed_at": datetime.now(UTC).isoformat(),
    }
    order.process_steps = steps
    db.commit()
    db.refresh(order)
    return order


def advance_to_bulk_qc(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    if order.stage != 3:
        raise AppError("invalid_stage", "Order is not at the weighing stage.", status_code=400)

    ingredients = order.ingredients or []
    if any(ing.get("actual_qty") is None for ing in ingredients):
        raise AppError("weighing_incomplete", "All ingredients must be weighed before advancing.", status_code=400)
    steps = order.process_steps or []
    if any(not step.get("done") for step in steps):
        raise AppError("steps_incomplete", "All process steps must be completed before advancing.", status_code=400)

    order.stage = 4
    order.status = _BATCH_STAGE_TO_STATUS[4]
    order.bulk_qc_id = f"{order.order_number}-BQC"
    order.updated_by_id = actor.id
    db.commit()
    db.refresh(order)
    return order


def submit_bulk_qc(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: dict[str, object]
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    result = "PASS" if data.get("result") == "PASS" else "FAIL"
    order.bulk_qc = {
        **data,
        "result": result,
        "checked_by_id": str(actor.id),
        "checked_at": datetime.now(UTC).isoformat(),
    }

    if result == "PASS":
        order.stage = 5
        order.status = _BATCH_STAGE_TO_STATUS[5]
        order.packaging_id = f"{order.order_number}-PKG"

    order.updated_by_id = actor.id
    db.commit()
    db.refresh(order)
    return order


def submit_packaging(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: dict[str, object]
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    if order.stage != 5:
        raise AppError("invalid_stage", "Order is not at the packaging stage.", status_code=400)

    order.packaging = {**data, "completed_by_id": str(actor.id), "completed_at": datetime.now(UTC).isoformat()}
    order.stage = 6
    order.status = _BATCH_STAGE_TO_STATUS[6]
    order.final_qc_id = f"{order.order_number}-FQC"
    order.updated_by_id = actor.id
    db.commit()
    db.refresh(order)
    return order


def submit_final_qc(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: FinalQCRequest
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    if order.stage != 6:
        raise AppError("invalid_stage", "Order is not at the final QC stage.", status_code=400)

    order.final_qc = {
        "weight_check": data.weight_check,
        "visual_check": data.visual_check,
        "label_check": data.label_check,
        "seal_check": data.seal_check,
        "leak_check": data.leak_check,
        "print_check": data.print_check,
        "carton_check": data.carton_check,
        "comment": data.comment,
        "checked_by_id": str(actor.id),
        "checked_at": datetime.now(UTC).isoformat(),
    }

    if data.approve:
        order.stage = 7
        order.status = _BATCH_STAGE_TO_STATUS[7]
        order.actual_end_date = datetime.now(UTC)
        packaging = order.packaging or {}
        filled = _as_float(packaging.get("filled"), 0)
        rejected = _as_float(packaging.get("rejected"), 0)
        order.completed_quantity = max(0.0, filled - rejected) if filled else order.completed_quantity

        if order.finished_product_id is not None:
            item = db.execute(
                select(InventoryItem).where(InventoryItem.id == order.finished_product_id)
            ).scalar_one_or_none()
            if item is not None:
                previous_stock = item.current_stock
                item.current_stock += order.completed_quantity
                db.add(
                    StockMovement(
                        organization_id=org_id,
                        product_id=item.id,
                        type=StockMovementType.PRODUCTION_OUTPUT,
                        quantity=order.completed_quantity,
                        previous_stock=previous_stock,
                        new_stock=item.current_stock,
                        batch=order.batch,
                        reference_type="ProductionOrder",
                        reference_id=order.id,
                        reference_number=order.order_number,
                        created_by_id=actor.id,
                    )
                )

    order.updated_by_id = actor.id
    db.commit()
    db.refresh(order)
    return order


def dispatch_order(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, order_id: uuid.UUID, data: dict[str, object]
) -> ProductionOrder:
    order = _get_order_or_404(db, org_id=org_id, order_id=order_id)
    order.dispatch_record = {**data, "dispatched_by_id": str(actor.id), "dispatched_at": datetime.now(UTC).isoformat()}
    order.updated_by_id = actor.id

    if order.lead_id is not None:
        lead = db.execute(select(Lead).where(Lead.id == order.lead_id)).scalar_one_or_none()
        if lead is not None and lead.status not in (
            LeadStatus.READY_TO_DISPATCH,
            LeadStatus.WON,
            LeadStatus.DISPATCHED,
            LeadStatus.LOST,
        ):
            now = datetime.now(UTC)
            last_entry = (
                db.execute(
                    select(LeadStageHistoryEntry)
                    .where(LeadStageHistoryEntry.lead_id == lead.id)
                    .order_by(LeadStageHistoryEntry.entered_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if last_entry is not None and last_entry.exited_at is None:
                last_entry.exited_at = now
            db.add(
                LeadStageHistoryEntry(
                    lead_id=lead.id, stage=LeadStatus.READY_TO_DISPATCH.value, entered_at=now, moved_by_id=actor.id
                )
            )
            lead.status = LeadStatus.READY_TO_DISPATCH
            lead.updated_by_id = actor.id

    db.commit()
    db.refresh(order)
    return order
