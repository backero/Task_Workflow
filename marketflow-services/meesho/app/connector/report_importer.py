"""Manual-mode report importer: parse Meesho-exported CSV/XLSX files.

``import_report(conn, filepath)`` auto-detects the report kind from the column
names (case-insensitive, tolerating variants such as "Catalog ID",
"catalog_id", or "Catalog"):

- **catalog performance** (Catalog ID, Catalog Name, Impressions, Views,
  Clicks, Orders, Rating, Ratings, Quality Score, Price, Recommended Price,
  Stock, Dispatch SLA, Returns, RTO) -> upsert each listing and add a snapshot
  with ts=now.
- **orders** (Order ID, SKU/Catalog, Status, Date) -> aggregate per catalog
  into a snapshot for today (orders / returns / rto deltas).
- anything else -> ``{"ok": False, "detail": "unrecognized columns: ..."}``.

For user testing, ``make_sample_catalog_csv(path)`` writes a 5-row sample CSV
in the expected catalog-performance format::

    python -c "from app.connector.report_importer import make_sample_catalog_csv; \
make_sample_catalog_csv('sample_catalog.csv')"

Upload that file on the Sources page (manual mode) to verify the pipeline
end-to-end without needing a real Meesho export.
"""

import os
import re
from datetime import datetime

import pandas as pd

from app.database import add_snapshot, log_data_event, upsert_listing

_TS_FMT = "%Y-%m-%d %H:%M:%S"


def _norm(col) -> str:
    """Normalize a column name: lowercase, alphanumeric words joined by '_'."""
    return re.sub(r"[^a-z0-9]+", "_", str(col).strip().lower()).strip("_")


# canonical field -> accepted normalized column names
_ALIASES = {
    "catalog_id": {"catalog_id", "catalog", "catalogid", "catalogue_id", "catalogue",
                   "catalog_sku", "sku_catalog"},
    "name": {"catalog_name", "name", "product_name", "catalogue_name", "product"},
    "category": {"category", "product_category"},
    "impressions": {"impressions", "impression", "imps"},
    "views": {"views", "view", "product_views", "page_views"},
    "clicks": {"clicks", "click"},
    "orders": {"orders", "order_count", "units", "total_orders"},
    "returns": {"returns", "return_count", "return"},
    "rto": {"rto", "rto_count"},
    "rating": {"rating", "avg_rating", "average_rating", "catalog_rating"},
    "ratings_count": {"ratings", "ratings_count", "rating_count", "no_of_ratings",
                      "number_of_ratings"},
    "bad_ratings": {"bad_ratings", "bad_rating_count"},
    "quality_score": {"quality_score", "qs", "qualityscore"},
    "price": {"price", "selling_price", "meesho_price"},
    "recommended_price": {"recommended_price", "price_recommendation",
                          "recommended_selling_price"},
    "stock": {"stock", "inventory", "quantity", "qty", "available_stock"},
    "dispatch_sla": {"dispatch_sla", "dispatch_sla_percent", "dispatch_sla_pct", "sla"},
    "order_id": {"order_id", "order", "sub_order_id", "sub_order_no", "order_no"},
    "sku": {"sku", "sku_id", "seller_sku"},
    "status": {"status", "order_status"},
    "date": {"date", "order_date", "created_date"},
}

# metrics that map 1:1 onto snapshots columns
_SNAPSHOT_FIELDS = (
    "impressions", "views", "clicks", "orders", "returns", "rto", "rating",
    "ratings_count", "bad_ratings", "quality_score", "price",
    "recommended_price", "stock", "dispatch_sla",
)
_PERF_METRICS = ("impressions", "views", "clicks", "orders", "rating",
                 "quality_score", "price", "stock")


def _resolve_columns(df) -> dict:
    """Map canonical field names to actual DataFrame columns (first match wins)."""
    norm_to_col = {}
    for col in df.columns:
        n = _norm(col)
        if n and n not in norm_to_col:
            norm_to_col[n] = col
    resolved = {}
    for field, aliases in _ALIASES.items():
        for alias in aliases:
            if alias in norm_to_col:
                resolved[field] = norm_to_col[alias]
                break
    return resolved


def _detect_kind(resolved: dict) -> str:
    if "order_id" in resolved and ("catalog_id" in resolved or "sku" in resolved):
        return "orders"
    if "order_id" in resolved and "status" in resolved:
        return "orders"
    if "catalog_id" in resolved:
        if sum(1 for m in _PERF_METRICS if m in resolved) >= 2:
            return "catalog_performance"
        # a lone catalog column with no metrics is still likely a catalog export
        return "catalog_performance"
    return "unknown"


def _num(value):
    """Coerce a cell to float; returns None for blanks/NaN/garbage."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, str):
        value = value.replace("\u20b9", "").replace(",", "").replace("%", "").strip()
        if not value:
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _text(value, default=""):
    if value is None:
        return default
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _read_report(filepath) -> pd.DataFrame:
    ext = os.path.splitext(str(filepath))[1].lower()
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(filepath)
    if ext == ".csv":
        return pd.read_csv(filepath)
    raise ValueError("unsupported file type %r (expected .csv or .xlsx)" % ext)


def import_report(conn, filepath) -> dict:
    """Import a Meesho-exported CSV/XLSX report. Returns {ok, rows, kind, detail}."""
    now = datetime.now().strftime(_TS_FMT)
    try:
        df = _read_report(filepath)
    except Exception as e:
        detail = "failed to read file: %s" % e
        _safe_log(conn, "manual_upload", "error", detail)
        return {"ok": False, "rows": 0, "kind": "unknown", "detail": detail}

    df = df.dropna(how="all")
    if df.empty or len(df.columns) == 0:
        detail = "report is empty"
        _safe_log(conn, "manual_upload", "error", detail)
        return {"ok": False, "rows": 0, "kind": "unknown", "detail": detail}

    resolved = _resolve_columns(df)
    kind = _detect_kind(resolved)
    if kind == "unknown":
        detail = "unrecognized columns: %s" % ", ".join(str(c) for c in df.columns)
        _safe_log(conn, "manual_upload", "error", detail)
        return {"ok": False, "rows": 0, "kind": "unknown", "detail": detail}

    if kind == "catalog_performance":
        result = _import_catalog_performance(conn, df, resolved, now)
    else:
        result = _import_orders(conn, df, resolved, now)

    _safe_log(conn, "manual_upload", "ok" if result["ok"] else "error", result["detail"])
    return result


def _import_catalog_performance(conn, df, resolved, now) -> dict:
    rows = 0
    errors = []
    for _, rec in df.iterrows():
        try:
            catalog_id = _text(rec.get(resolved["catalog_id"]))
            if not catalog_id:
                continue
            name = _text(rec.get(resolved["name"])) if "name" in resolved else ""
            category = _text(rec.get(resolved["category"])) if "category" in resolved else ""
            price = _num(rec.get(resolved["price"])) if "price" in resolved else None
            listing_id = upsert_listing(
                conn,
                catalog_id=catalog_id,
                name=name or "Catalog %s" % catalog_id,
                category=category or None,
                price=price,
                status="live",
                created_at=now,
            )
            metrics = {}
            for field in _SNAPSHOT_FIELDS:
                if field not in resolved:
                    continue
                val = _num(rec.get(resolved[field]))
                if val is None:
                    continue
                if field in ("impressions", "views", "clicks", "orders", "returns",
                             "rto", "ratings_count", "bad_ratings", "stock"):
                    val = int(val)
                metrics[field] = val
            add_snapshot(conn, listing_id, now, **metrics)
            rows += 1
        except Exception as e:
            errors.append(str(e))
    detail = "imported %d catalog rows" % rows
    if errors:
        detail += " (%d row errors: %s)" % (len(errors), "; ".join(errors[:3]))
    return {"ok": rows > 0, "rows": rows, "kind": "catalog_performance",
            "detail": detail}


def _import_orders(conn, df, resolved, now) -> dict:
    cat_col = resolved.get("catalog_id") or resolved.get("sku")
    status_col = resolved.get("status")
    today = now.split(" ")[0] + " 00:00:00"

    per_catalog = {}
    total_rows = 0
    for _, rec in df.iterrows():
        catalog_id = _text(rec.get(cat_col)) if cat_col else ""
        if not catalog_id:
            continue
        bucket = per_catalog.setdefault(catalog_id, {"orders": 0, "returns": 0, "rto": 0})
        bucket["orders"] += 1
        status = _text(rec.get(status_col)).lower() if status_col else ""
        if "rto" in status:
            bucket["rto"] += 1
        elif "return" in status:
            bucket["returns"] += 1
        total_rows += 1

    imported = 0
    errors = []
    for catalog_id, agg in per_catalog.items():
        try:
            listing_id = upsert_listing(
                conn,
                catalog_id=catalog_id,
                name="Catalog %s" % catalog_id,
                category=None,
                price=None,
                status="live",
                created_at=now,
            )
            add_snapshot(conn, listing_id, today,
                         orders=agg["orders"], returns=agg["returns"], rto=agg["rto"])
            imported += 1
        except Exception as e:
            errors.append(str(e))

    detail = "aggregated %d order rows across %d catalogs" % (total_rows, imported)
    if errors:
        detail += " (%d catalog errors: %s)" % (len(errors), "; ".join(errors[:3]))
    return {"ok": total_rows > 0, "rows": total_rows, "kind": "orders",
            "detail": detail}


def _safe_log(conn, source, status, detail):
    try:
        log_data_event(conn, source, status, detail)
    except Exception:
        pass


_SAMPLE_ROWS = [
    # catalog_id, name, category, impressions, views, clicks, orders, rating,
    # ratings, quality_score, price, recommended_price, stock, dispatch_sla,
    # returns, rto
    ("KC-1001", "Floral Anarkali Kurti", "Kurtis", 12400, 1830, 145, 38, 4.3, 212, 8.5, 449, 429, 56, 96.5, 2, 1),
    ("KC-1002", "Solid Cotton Kurti", "Kurtis", 8600, 1210, 61, 14, 3.6, 148, 21.0, 329, 315, 0, 92.0, 3, 2),
    ("BD-2001", "Glaze Cotton Bedsheet King", "Bedsheets", 15200, 2400, 198, 52, 4.5, 305, 6.0, 699, 679, 74, 98.0, 1, 0),
    ("PC-3001", "Marble Print Phone Cover", "Phone Covers", 9800, 1560, 44, 9, 4.1, 96, 12.5, 199, 189, 8, 94.0, 1, 1),
    ("SR-4001", "Banarasi Silk Saree", "Sarees", 18300, 2950, 260, 61, 4.6, 410, 5.5, 1099, 1049, 42, 97.5, 2, 1),
]


def make_sample_catalog_csv(path) -> None:
    """Write a 5-row sample catalog-performance CSV for user testing."""
    header = ("Catalog ID,Catalog Name,Category,Impressions,Views,Clicks,Orders,"
              "Rating,Ratings,Quality Score,Price,Recommended Price,Stock,"
              "Dispatch SLA,Returns,RTO\n")
    lines = [header]
    for r in _SAMPLE_ROWS:
        lines.append(",".join('"%s"' % v if isinstance(v, str) and "," in v else str(v)
                              for v in r) + "\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
