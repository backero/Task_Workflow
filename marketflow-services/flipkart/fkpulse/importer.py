"""Ads CSV importer — loads Flipkart ad-campaign report exports into ad_spend.

Flipkart's Seller API does not expose advertising metrics in v1 of FK-Pulse,
so sellers export the ads report CSV from Seller Hub (Ads / Advertising →
Reports) and import it here.

Header mapping is flexible and case-insensitive. Recognised columns:

- FSN:      "FSN", "FSN ID", "Listing ID", "Product FSN";
            fallback (when the seller names campaigns/ad groups after the
            SKU): "Ad Group", "Campaign"
- Date:     "Date", "Day", "Report Date", "Start Date"
- Spend:    "Spend", "Ad Spend", "Total Spend", "Cost", "Amount Spent"
- Sales:    "Sales", "Revenue", "Direct Revenue", "Total Revenue",
            "Ad Sales", "Conversion Revenue"

Numbers may include ₹, commas and whitespace. Dates may be ISO
(YYYY-MM-DD) or DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY. Rows without a
parseable FSN or date are skipped.
"""

from __future__ import annotations

import csv
import re
import sqlite3
from datetime import datetime

# normalized-header -> canonical field, checked in listed order
_FSN_HEADERS = (
    "fsn", "fsnid", "fsn_id", "listingid", "listing_id", "productfsn",
    "product_fsn", "sku",
)
_FSN_FALLBACK_HEADERS = ("adgroup", "ad_group", "campaign", "campaignname")
_DATE_HEADERS = ("date", "day", "reportdate", "report_date", "startdate",
                 "start_date")
_SPEND_HEADERS = ("spend", "adspend", "ad_spend", "totalspend",
                  "total_spend", "cost", "amountspent", "amount_spent",
                  "spends")
_SALES_HEADERS = ("sales", "revenue", "directrevenue", "direct_revenue",
                  "totalrevenue", "total_revenue", "adsales", "ad_sales",
                  "conversionrevenue", "conversion_revenue")

_DATE_FORMATS = (
    "%Y-%m-%d", "%Y/%m/%d",
    "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
    "%m/%d/%Y", "%m-%d-%Y",
    "%d-%b-%Y", "%d %b %Y", "%Y-%m-%d %H:%M:%S",
)


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (h or "").lower())


def _pick_column(fieldnames: list[str], candidates: tuple[str, ...]) -> str | None:
    normed = {_norm_header(f): f for f in fieldnames}
    for cand in candidates:
        if _norm_header(cand) in normed:
            return normed[_norm_header(cand)]
    return None


def _parse_number(raw) -> float | None:
    if raw is None:
        return None
    text = re.sub(r"[^\d.\-]", "", str(raw))
    if text in ("", "-", "."):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_date(raw) -> str | None:
    """Return ISO date (YYYY-MM-DD) or None."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    # last resort: ISO-from-text like "2024-06-01T00:00:00"
    try:
        return datetime.fromisoformat(text).date().isoformat()
    except ValueError:
        return None


def _connect(db_path: str) -> sqlite3.Connection:
    try:
        from fkpulse.db import get_conn, init_db  # Agent A's helpers

        init_db(db_path)
        return get_conn(db_path)
    except ImportError:
        # db.py not present yet (standalone use / tests): ensure the table.
        conn = sqlite3.connect(db_path)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS ad_spend("
            " id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, date TEXT,"
            " spend REAL, sales REAL, source TEXT DEFAULT 'csv')"
        )
        conn.commit()
        return conn


def import_ads_csv(db_path: str, csv_path: str) -> int:
    """Import a Flipkart ads report CSV into the ad_spend table.

    Returns the number of rows inserted. Raises ValueError if the CSV has
    no recognizable FSN/Date columns.
    """
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        fsn_col = _pick_column(fieldnames, _FSN_HEADERS) or _pick_column(
            fieldnames, _FSN_FALLBACK_HEADERS
        )
        date_col = _pick_column(fieldnames, _DATE_HEADERS)
        spend_col = _pick_column(fieldnames, _SPEND_HEADERS)
        sales_col = _pick_column(fieldnames, _SALES_HEADERS)
        if not fsn_col or not date_col:
            raise ValueError(
                "CSV must contain an FSN (or Ad Group/Campaign) column and a "
                f"Date column. Found headers: {fieldnames}"
            )

        rows: list[tuple] = []
        for row in reader:
            fsn = (row.get(fsn_col) or "").strip()
            date = _parse_date(row.get(date_col))
            if not fsn or not date:
                continue  # skip totals/blank/garbage rows
            rows.append((
                fsn,
                date,
                _parse_number(row.get(spend_col)) if spend_col else None,
                _parse_number(row.get(sales_col)) if sales_col else None,
                "csv",
            ))

    conn = _connect(db_path)
    try:
        conn.executemany(
            "INSERT INTO ad_spend(fsn, date, spend, sales, source)"
            " VALUES(?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()
    finally:
        conn.close()
    return len(rows)
