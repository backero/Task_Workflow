"""SQLite schema and connection helpers for FK-Pulse.

Schema is the frozen contract from SPEC.md — do not alter column names or
types without updating the spec.
"""

from __future__ import annotations

import sqlite3

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS listings(
  fsn TEXT PRIMARY KEY, sku TEXT, title TEXT, brand TEXT, category TEXT,
  price REAL, mrp REAL, stock INTEGER, status TEXT,
  attributes_json TEXT,       -- JSON dict of attribute name->value
  attributes_total INTEGER,   -- how many attributes the category template expects
  image_count INTEGER,
  rating_avg REAL, rating_count INTEGER, review_count INTEGER,
  listed_date TEXT,           -- ISO date; used for Usual Price 15-day rule
  updated_at TEXT);
CREATE TABLE IF NOT EXISTS orders(
  order_id TEXT PRIMARY KEY, fsn TEXT, sku TEXT, qty INTEGER, price REAL,
  order_date TEXT, status TEXT,                      -- e.g. DELIVERED, SHIPPED, CANCELLED
  cancelled INTEGER DEFAULT 0, rtd_breach INTEGER DEFAULT 0, rto INTEGER DEFAULT 0,
  pincode TEXT, payment_type TEXT);                  -- COD | PREPAID
CREATE TABLE IF NOT EXISTS returns(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, fsn TEXT,
  type TEXT, reason TEXT, return_date TEXT);         -- type: CUSTOMER|COURIER_RTO
CREATE TABLE IF NOT EXISTS settlements(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, amount REAL,
  fees_json TEXT, order_date TEXT, settled_date TEXT);
CREATE TABLE IF NOT EXISTS rank_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, keyword TEXT,
  position INTEGER, page INTEGER, serp_median_price REAL, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS tracked_keywords(
  id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, keyword TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS metrics_snapshots(
  id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, key TEXT, value REAL,
  detail TEXT, computed_at TEXT);                    -- scope: account | fsn:<FSN>
CREATE TABLE IF NOT EXISTS recommendations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, fsn TEXT, rule_id TEXT,
  severity TEXT, title TEXT, detail TEXT, status TEXT DEFAULT 'open', created_at TEXT);
CREATE TABLE IF NOT EXISTS ad_spend(
  id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, date TEXT, spend REAL,
  sales REAL, source TEXT DEFAULT 'csv');
CREATE TABLE IF NOT EXISTS kv_config(key TEXT PRIMARY KEY, value TEXT);
"""


def get_conn(db_path: str) -> sqlite3.Connection:
    """Open a SQLite connection with Row factory and WAL journal mode.

    Args:
        db_path: Filesystem path to the SQLite database file.

    Returns:
        A ``sqlite3.Connection`` with ``row_factory=sqlite3.Row`` and
        ``PRAGMA journal_mode=WAL`` applied.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: str) -> None:
    """Create all FK-Pulse tables if they do not already exist.

    Args:
        db_path: Filesystem path to the SQLite database file.
    """
    conn = get_conn(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    finally:
        conn.close()
