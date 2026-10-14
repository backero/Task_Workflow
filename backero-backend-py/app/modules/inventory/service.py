"""Inventory business logic — ported from inventory.controller.js's core
routes. See app/models/inventory.py for the raw-material-model consolidation
decision. Deliberately NOT ported: xlsx import/template (`openpyxl`, a new
dependency decision not made yet), the `/qr` SVG endpoint (`qrcode`
package, low priority) — both left as follow-ups, not silently dropped.

Deliberate improvement over the source: batch add/update and raw-material
creation-with-initial-stock now DO create a `StockMovement` audit row (type
`IN`) — the source's own inventory.controller.js never does this for these
three write paths (only stock-in/out/adjustment get movement rows there),
a real audit-trail gap flagged in this port's Phase-3 research and worth
closing rather than faithfully reproducing.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.core.pagination import Page, PageParams
from app.models.inventory import InventoryItem, StockMovement, StockMovementType
from app.models.workflow_user import WorkflowUser
from app.schemas.inventory import (
    AdjustmentRequest,
    BatchInput,
    InventoryItemCreateRequest,
    InventoryItemResponse,
    InventoryItemUpdateRequest,
    RawMaterialStatsResponse,
    StockInRequest,
    StockMovementResponse,
    StockOutRequest,
)


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


def _get_item_or_404(db: Session, *, org_id: uuid.UUID, item_id: uuid.UUID) -> InventoryItem:
    item = db.execute(
        select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.organization_id == org_id)
    ).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Inventory item not found.")
    return item


def _next_sku(db: Session, *, org_id: uuid.UUID) -> str:
    count = db.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.organization_id == org_id, InventoryItem.is_raw_material.is_(True)
        )
    ).scalar_one()
    return f"RM-{count + 1:04d}"


def _recompute_from_batches(item: InventoryItem) -> None:
    """Weighted-average cost across all batches + summed stock — same
    formula as the source's `batches[].price`/`quantity` reduce."""
    batches = item.batches or []
    total_qty = sum(_as_float(b.get("quantity")) for b in batches)
    total_value = sum(_as_float(b.get("quantity")) * _as_float(b.get("price")) for b in batches)
    item.current_stock = total_qty
    if total_qty > 0:
        item.cost_price = round(total_value / total_qty, 2)


def list_items(
    db: Session,
    *,
    org_id: uuid.UUID,
    page_params: PageParams,
    category: str | None,
    is_raw_material: bool | None,
    low_stock: bool | None,
    search: str | None,
) -> Page[InventoryItemResponse]:
    conditions = [InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True)]
    if category is not None:
        conditions.append(InventoryItem.category == category)
    if is_raw_material is not None:
        conditions.append(InventoryItem.is_raw_material.is_(is_raw_material))
    if low_stock:
        conditions.append(InventoryItem.current_stock <= InventoryItem.min_stock_level)
    if search:
        like = f"%{search}%"
        conditions.append(
            or_(
                InventoryItem.name.ilike(like),
                InventoryItem.sku.ilike(like),
                InventoryItem.category.ilike(like),
                InventoryItem.supplier.ilike(like),
            )
        )

    total = db.execute(select(func.count(InventoryItem.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(InventoryItem)
            .where(*conditions)
            .order_by(InventoryItem.name.asc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[InventoryItemResponse](
        items=[InventoryItemResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def get_item(db: Session, *, org_id: uuid.UUID, item_id: uuid.UUID) -> InventoryItem:
    return _get_item_or_404(db, org_id=org_id, item_id=item_id)


def create_item(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: InventoryItemCreateRequest
) -> InventoryItem:
    sku = (data.sku or "").strip().upper() or _next_sku(db, org_id=org_id)
    existing = db.execute(
        select(InventoryItem).where(InventoryItem.organization_id == org_id, InventoryItem.sku == sku)
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError("sku_exists", f"SKU {sku} already exists.", status_code=409)

    now = datetime.now(UTC)
    batches: list[dict[str, object]] = []
    current_stock = 0.0
    cost_price = data.cost_price
    if data.is_raw_material and data.initial_stock and data.initial_stock > 0:
        batch = {
            "batch_id": f"BATCH-{int(now.timestamp() * 1000)}",
            "quantity": data.initial_stock,
            "price": data.cost_price,
            "batch_number": data.initial_batch_number or f"LOT-{sku}",
            "expiry_date": data.initial_expiry.isoformat() if data.initial_expiry else None,
            "received_date": now.date().isoformat(),
            "notes": "Initial stock",
        }
        batches = [batch]
        current_stock = data.initial_stock

    item = InventoryItem(
        organization_id=org_id,
        name=data.name,
        sku=sku,
        barcode=data.barcode,
        category=data.category,
        sub_category=data.sub_category,
        unit=data.unit,
        description=data.description,
        cost_price=cost_price,
        selling_price=data.selling_price,
        mrp=data.mrp,
        gst_rate=data.gst_rate,
        hsn_code=data.hsn_code,
        current_stock=current_stock,
        min_stock_level=data.min_stock_level,
        max_stock_level=data.max_stock_level,
        reorder_point=data.reorder_point,
        reorder_quantity=data.reorder_quantity,
        warehouse_location=data.warehouse_location,
        shelf=data.shelf,
        supplier=data.supplier,
        enable_min_stock=data.enable_min_stock,
        batches=batches or None,
        qc_checker=data.qc_checker,
        qc_number=data.qc_number,
        ref_check_number=data.ref_check_number,
        qc_passed=data.qc_passed,
        qc_notes=data.qc_notes,
        product_type=data.product_type,
        shelf_life=data.shelf_life,
        certifications=data.certifications,
        storage_conditions=data.storage_conditions,
        is_raw_material=data.is_raw_material,
        is_finished_good=data.is_finished_good,
        is_sellable=data.is_sellable,
        last_stock_in=now if current_stock > 0 else None,
        created_by_id=actor.id,
    )
    db.add(item)
    db.flush()

    if current_stock > 0:
        db.add(
            StockMovement(
                organization_id=org_id,
                product_id=item.id,
                type=StockMovementType.IN,
                quantity=current_stock,
                previous_stock=0,
                new_stock=current_stock,
                unit_price=cost_price,
                total_value=current_stock * cost_price,
                notes="Initial stock",
                created_by_id=actor.id,
            )
        )

    db.commit()
    db.refresh(item)
    return item


def update_item(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, item_id: uuid.UUID, data: InventoryItemUpdateRequest
) -> InventoryItem:
    item = _get_item_or_404(db, org_id=org_id, item_id=item_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)
    item.updated_by_id = actor.id
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, *, org_id: uuid.UUID, item_id: uuid.UUID) -> None:
    item = _get_item_or_404(db, org_id=org_id, item_id=item_id)
    db.delete(item)
    db.commit()


def add_batch(
    db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, item_id: uuid.UUID, data: BatchInput
) -> InventoryItem:
    item = _get_item_or_404(db, org_id=org_id, item_id=item_id)
    batches = list(item.batches or [])

    price = data.price
    if price is None and data.total_price is not None and data.quantity:
        price = round(data.total_price / data.quantity, 2)
    if price is None:
        price = item.cost_price

    batch_number = data.batch_number or f"LOT-{item.sku}-{len(batches) + 1}"
    now = datetime.now(UTC)
    batches.append(
        {
            "batch_id": data.batch_id or f"BATCH-{int(now.timestamp() * 1000)}",
            "quantity": data.quantity,
            "total_price": data.total_price,
            "price": price,
            "batch_number": batch_number,
            "expiry_date": data.expiry_date.isoformat() if data.expiry_date else None,
            "received_date": (data.received_date or now.date()).isoformat(),
            "location": data.location,
            "supplier": data.supplier,
            "invoice": data.invoice,
            "notes": data.notes,
            "qc_checked_by": data.qc_checked_by,
            "qc_date": data.qc_date or now.date().isoformat(),
            "qc_status": data.qc_status,
            "qc_notes": data.qc_notes,
        }
    )
    previous_stock = item.current_stock
    item.batches = batches
    _recompute_from_batches(item)
    item.last_stock_in = now
    item.updated_by_id = actor.id

    db.add(
        StockMovement(
            organization_id=org_id,
            product_id=item.id,
            type=StockMovementType.IN,
            quantity=data.quantity,
            previous_stock=previous_stock,
            new_stock=item.current_stock,
            unit_price=price,
            total_value=data.quantity * price,
            batch=batch_number,
            notes=data.notes,
            created_by_id=actor.id,
        )
    )

    db.commit()
    db.refresh(item)
    return item


def update_batch(
    db: Session, *, org_id: uuid.UUID, item_id: uuid.UUID, batch_id: str, data: BatchInput
) -> InventoryItem:
    item = _get_item_or_404(db, org_id=org_id, item_id=item_id)
    updates = data.model_dump(exclude_unset=True, exclude={"batch_id"})
    found = False
    new_batches: list[dict[str, object]] = []
    for batch in item.batches or []:
        if batch.get("batch_id") == batch_id:
            found = True
            updated = dict(batch)
            for field, value in updates.items():
                if value is not None:
                    updated[field] = value.isoformat() if hasattr(value, "isoformat") else value
            new_batches.append(updated)
        else:
            new_batches.append(batch)
    if not found:
        raise NotFoundError("Batch not found.")

    # Rebuilding fresh dicts (not mutating in place) matters here: SQLAlchemy's
    # JSONB change-history compares old-vs-new by value, and mutating a dict
    # already referenced by item.batches in place makes both sides compare
    # equal — the UPDATE would silently never be issued.
    item.batches = new_batches
    _recompute_from_batches(item)
    db.commit()
    db.refresh(item)
    return item


def stock_in(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: StockInRequest) -> InventoryItem:
    item = _get_item_or_404(db, org_id=org_id, item_id=data.product_id)
    previous_stock = item.current_stock
    unit_price = data.unit_price if data.unit_price is not None else item.cost_price
    item.current_stock += data.quantity
    item.last_stock_in = datetime.now(UTC)

    db.add(
        StockMovement(
            organization_id=org_id,
            product_id=item.id,
            type=StockMovementType.IN,
            quantity=data.quantity,
            previous_stock=previous_stock,
            new_stock=item.current_stock,
            unit_price=unit_price,
            total_value=data.quantity * unit_price,
            notes=data.notes,
            batch=data.batch,
            reference_type="Manual",
            reference_number=data.reference,
            created_by_id=actor.id,
        )
    )
    db.commit()
    db.refresh(item)
    return item


def stock_out(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: StockOutRequest) -> InventoryItem:
    item = _get_item_or_404(db, org_id=org_id, item_id=data.product_id)
    if item.current_stock < data.quantity:
        raise AppError("insufficient_stock", "Not enough stock for this operation.", status_code=400)

    previous_stock = item.current_stock
    item.current_stock -= data.quantity

    db.add(
        StockMovement(
            organization_id=org_id,
            product_id=item.id,
            type=StockMovementType.OUT,
            quantity=-data.quantity,
            previous_stock=previous_stock,
            new_stock=item.current_stock,
            unit_price=item.cost_price,
            total_value=data.quantity * item.cost_price,
            notes=data.notes,
            reference_type="Manual",
            reference_number=data.reference,
            created_by_id=actor.id,
        )
    )
    db.commit()
    db.refresh(item)
    return item


def adjustment(db: Session, *, org_id: uuid.UUID, actor: WorkflowUser, data: AdjustmentRequest) -> InventoryItem:
    item = _get_item_or_404(db, org_id=org_id, item_id=data.product_id)
    previous_stock = item.current_stock
    diff = data.new_stock - previous_stock
    item.current_stock = data.new_stock

    db.add(
        StockMovement(
            organization_id=org_id,
            product_id=item.id,
            type=StockMovementType.ADJUSTMENT,
            quantity=diff,
            previous_stock=previous_stock,
            new_stock=item.current_stock,
            unit_price=item.cost_price,
            total_value=abs(diff) * item.cost_price,
            notes=data.notes,
            created_by_id=actor.id,
        )
    )
    db.commit()
    db.refresh(item)
    return item


def list_movements(
    db: Session,
    *,
    org_id: uuid.UUID,
    page_params: PageParams,
    product_id: uuid.UUID | None,
    movement_type: StockMovementType | None,
) -> Page[StockMovementResponse]:
    conditions = [StockMovement.organization_id == org_id]
    if product_id is not None:
        conditions.append(StockMovement.product_id == product_id)
    if movement_type is not None:
        conditions.append(StockMovement.type == movement_type)

    total = db.execute(select(func.count(StockMovement.id)).where(*conditions)).scalar_one()
    rows = (
        db.execute(
            select(StockMovement)
            .where(*conditions)
            .order_by(StockMovement.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
        .scalars()
        .all()
    )
    return Page[StockMovementResponse](
        items=[StockMovementResponse.model_validate(row) for row in rows],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
    )


def get_alerts(db: Session, *, org_id: uuid.UUID) -> list[InventoryItemResponse]:
    rows = (
        db.execute(
            select(InventoryItem)
            .where(InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True))
            .where(InventoryItem.current_stock <= InventoryItem.min_stock_level)
            .order_by(InventoryItem.current_stock.asc())
        )
        .scalars()
        .all()
    )
    return [InventoryItemResponse.model_validate(r) for r in rows]


def get_analytics(db: Session, *, org_id: uuid.UUID) -> dict[str, object]:
    total_active = db.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True)
        )
    ).scalar_one()
    low_stock_count = db.execute(
        select(func.count(InventoryItem.id))
        .where(InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True))
        .where(InventoryItem.current_stock <= InventoryItem.min_stock_level)
    ).scalar_one()
    category_rows = db.execute(
        select(InventoryItem.category, func.count(InventoryItem.id), func.sum(InventoryItem.current_stock))
        .where(InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True))
        .group_by(InventoryItem.category)
    ).all()
    total_value = db.execute(
        select(func.coalesce(func.sum(InventoryItem.current_stock * InventoryItem.cost_price), 0)).where(
            InventoryItem.organization_id == org_id, InventoryItem.is_active.is_(True)
        )
    ).scalar_one()

    return {
        "total_active": total_active,
        "low_stock_count": low_stock_count,
        "by_category": [{"category": c, "count": cnt, "total_stock": float(s or 0)} for c, cnt, s in category_rows],
        "total_value": float(total_value or 0),
    }


def get_raw_material_stats(db: Session, *, org_id: uuid.UUID) -> RawMaterialStatsResponse:
    items = (
        db.execute(
            select(InventoryItem).where(
                InventoryItem.organization_id == org_id,
                InventoryItem.is_raw_material.is_(True),
                InventoryItem.is_active.is_(True),
            )
        )
        .scalars()
        .all()
    )
    total_value = 0.0
    out_of_stock = 0
    low_stock = 0
    expiring = 0
    today = datetime.now(UTC).date()
    for item in items:
        stock = item.current_stock
        total_value += stock * item.cost_price
        if stock <= 0:
            out_of_stock += 1
        elif item.enable_min_stock and stock <= item.min_stock_level:
            low_stock += 1
        for batch in item.batches or []:
            expiry_raw = batch.get("expiry_date")
            if not expiry_raw:
                continue
            try:
                expiry = datetime.fromisoformat(str(expiry_raw)).date()
            except ValueError:
                continue
            if 0 <= (expiry - today).days <= 30:
                expiring += 1

    return RawMaterialStatsResponse(
        total_value=round(total_value, 2),
        out_of_stock_count=out_of_stock,
        low_stock_count=low_stock,
        expiring_count=expiring,
    )
