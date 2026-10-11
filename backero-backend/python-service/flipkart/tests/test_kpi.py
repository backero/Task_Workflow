"""Tests for fkpulse.kpi — builds a temp SQLite DB per SPEC schema directly
(no dependency on Agent A's db.py). Deterministic via injected ``now``.
"""

import json
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fkpulse.kpi import compute_all  # noqa: E402

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings(
  fsn TEXT PRIMARY KEY, sku TEXT, title TEXT, brand TEXT, category TEXT,
  price REAL, mrp REAL, stock INTEGER, status TEXT,
  attributes_json TEXT, attributes_total INTEGER, image_count INTEGER,
  rating_avg REAL, rating_count INTEGER, review_count INTEGER,
  listed_date TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS orders(
  order_id TEXT PRIMARY KEY, fsn TEXT, sku TEXT, qty INTEGER, price REAL,
  order_date TEXT, status TEXT,
  cancelled INTEGER DEFAULT 0, rtd_breach INTEGER DEFAULT 0,
  rto INTEGER DEFAULT 0, pincode TEXT, payment_type TEXT);
CREATE TABLE IF NOT EXISTS returns(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, fsn TEXT,
  type TEXT, reason TEXT, return_date TEXT);
CREATE TABLE IF NOT EXISTS settlements(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, amount REAL,
  fees_json TEXT, order_date TEXT, settled_date TEXT);
CREATE TABLE IF NOT EXISTS rank_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, keyword TEXT,
  position INTEGER, page INTEGER, serp_median_price REAL, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS tracked_keywords(
  id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, keyword TEXT,
  active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS metrics_snapshots(
  id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, key TEXT, value REAL,
  detail TEXT, computed_at TEXT);
CREATE TABLE IF NOT EXISTS recommendations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, fsn TEXT, rule_id TEXT,
  severity TEXT, title TEXT, detail TEXT, status TEXT DEFAULT 'open',
  created_at TEXT);
CREATE TABLE IF NOT EXISTS ad_spend(
  id INTEGER PRIMARY KEY AUTOINCREMENT, fsn TEXT, date TEXT, spend REAL,
  sales REAL, source TEXT DEFAULT 'csv');
CREATE TABLE IF NOT EXISTS kv_config(key TEXT PRIMARY KEY, value TEXT);
"""

CONFIG = {
    "thresholds": {
        "cancellation_max": 0.0025,
        "rtd_breach_max": 0.005,
        "rating_min": 4.2,
        "stock_cover_days_min": 14,
        "price_vs_median_max": 1.05,
        "attribute_completeness_min": 0.9,
    }
}

NOW = datetime(2025, 6, 30, 12, 0, 0)


@pytest.fixture()
def db_path(tmp_path):
    path = tmp_path / "test.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    return str(path)


def add_listing(db_path, fsn, **kw):
    defaults = dict(fsn=fsn, sku=fsn, title=f"Title {fsn}", brand="B",
                    category="C",
                    price=499.0, mrp=599.0, stock=100, status="ACTIVE",
                    attributes_json=json.dumps({"a": "1", "b": "2"}),
                    attributes_total=2, image_count=4,
                    rating_avg=4.5, rating_count=100, review_count=40,
                    listed_date=(NOW - timedelta(days=60)).isoformat(),
                    updated_at=NOW.isoformat())
    defaults.update(kw)
    cols = ", ".join(defaults)
    conn = sqlite3.connect(db_path)
    conn.execute(f"INSERT INTO listings({cols}) VALUES "
                 f"({', '.join('?' for _ in defaults)})",
                 list(defaults.values()))
    conn.commit()
    conn.close()


def add_order(db_path, order_id, fsn="FSN1", qty=1, days_ago=5,
              status="DELIVERED", cancelled=0, rtd_breach=0, rto=0,
              pincode="560001", payment_type="COD", now=NOW):
    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO orders(order_id, fsn, sku, qty, price, order_date,
                              status, cancelled, rtd_breach, rto, pincode,
                              payment_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (order_id, fsn, fsn, qty, 499.0, (now - timedelta(days=days_ago))
         .isoformat(), status, cancelled, rtd_breach, rto, pincode,
         payment_type))
    conn.commit()
    conn.close()


def snapshot(db_path, scope, key):
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        """SELECT value FROM metrics_snapshots
           WHERE scope = ? AND key = ? ORDER BY id DESC LIMIT 1""",
        (scope, key)).fetchone()
    conn.close()
    return row[0] if row else None


def test_cancellation_rtd_rto_cod_math(db_path):
    add_listing(db_path, "FSN1")
    # 10 in-window orders: 2 cancelled (one via flag, one via status),
    # 1 RTD breach, 1 RTO, 6 COD. One old order outside the 30d window.
    for i in range(10):
        add_order(db_path, f"O{i}", payment_type="COD" if i < 6
                  else "PREPAID")
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE orders SET cancelled = 1, status = 'CANCELLED' "
                 "WHERE order_id = 'O0'")
    conn.execute("UPDATE orders SET status = 'CANCELLED' "
                 "WHERE order_id = 'O1'")
    conn.execute("UPDATE orders SET rtd_breach = 1 WHERE order_id = 'O2'")
    conn.execute("UPDATE orders SET rto = 1 WHERE order_id = 'O3'")
    conn.commit()
    conn.close()
    add_order(db_path, "OLD", days_ago=45)  # outside 30d window

    compute_all(db_path, CONFIG, now=NOW)

    assert snapshot(db_path, "account", "cancellation_rate_30d") == \
        pytest.approx(0.2)
    assert snapshot(db_path, "account", "rtd_breach_rate_30d") == \
        pytest.approx(0.1)
    assert snapshot(db_path, "account", "rto_rate_30d") == pytest.approx(0.1)
    # O0, O1 are COD-cancelled; still counted in COD share denominator
    assert snapshot(db_path, "account", "cod_share_30d") == pytest.approx(0.6)


def test_stock_cover_days(db_path):
    add_listing(db_path, "FSN1", stock=30)
    add_listing(db_path, "FSN2", stock=10)
    # 60 sellable units in 30d -> 2/day -> 30/2 = 15 days cover
    for i in range(6):
        add_order(db_path, f"S{i}", qty=10, days_ago=2 + i)
    # cancelled order must not count toward velocity
    add_order(db_path, "SC", qty=50, cancelled=1, status="CANCELLED")
    # FSN2 has no orders -> zero velocity -> NULL cover
    compute_all(db_path, CONFIG, now=NOW)

    assert snapshot(db_path, "fsn:FSN1", "stock_cover_days") == \
        pytest.approx(15.0)
    assert snapshot(db_path, "fsn:FSN2", "stock_cover_days") is None


def test_tacos_null_without_ad_data(db_path):
    add_listing(db_path, "FSN1")
    compute_all(db_path, CONFIG, now=NOW)
    assert snapshot(db_path, "account", "tacos_30d") is None


def test_tacos_with_ad_data(db_path):
    add_listing(db_path, "FSN1")
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO ad_spend(fsn, date, spend, sales) VALUES (?, ?, ?, ?)",
        ("FSN1", (NOW - timedelta(days=3)).isoformat(), 350.0, 1000.0))
    conn.commit()
    conn.close()
    compute_all(db_path, CONFIG, now=NOW)
    assert snapshot(db_path, "account", "tacos_30d") == pytest.approx(0.35)


def test_usual_price_window(db_path):
    add_listing(db_path, "NEW", listed_date=(NOW - timedelta(days=5))
                .isoformat())
    add_listing(db_path, "OLD", listed_date=(NOW - timedelta(days=20))
                .isoformat())
    compute_all(db_path, CONFIG, now=NOW)
    assert snapshot(db_path, "fsn:NEW", "usual_price_window_open") == 1.0
    assert snapshot(db_path, "fsn:OLD", "usual_price_window_open") == 0.0


def test_weighted_rating_settlement_lag_and_velocity(db_path):
    add_listing(db_path, "FSN1", rating_avg=4.0, rating_count=100)
    add_listing(db_path, "FSN2", rating_avg=5.0, rating_count=300)
    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO settlements(order_id, amount, order_date, settled_date)
           VALUES ('O1', 100.0, ?, ?)""",
        ((NOW - timedelta(days=20)).isoformat(),
         (NOW - timedelta(days=5)).isoformat()))
    # 8-day-old rating baseline snapshot (400 - 50 new since then)
    conn.execute(
        """INSERT INTO metrics_snapshots(scope, key, value, detail,
                                         computed_at)
           VALUES ('account', 'rating_avg_weighted', 4.6, ?, ?)""",
        (json.dumps({"rating_count": 350}),
         (NOW - timedelta(days=8)).isoformat()))
    conn.commit()
    conn.close()

    compute_all(db_path, CONFIG, now=NOW)

    assert snapshot(db_path, "account", "rating_avg_weighted") == \
        pytest.approx((4.0 * 100 + 5.0 * 300) / 400)
    assert snapshot(db_path, "account", "settlement_lag_days_avg") == \
        pytest.approx(15.0)
    # (400 - 350) new ratings / 7 days
    assert snapshot(db_path, "account", "review_velocity_7d") == \
        pytest.approx(50 / 7)


def test_attribute_completeness_and_image_count(db_path):
    add_listing(db_path, "FSN1",
                attributes_json=json.dumps({"a": "1", "b": "", "c": None}),
                attributes_total=4, image_count=2)
    compute_all(db_path, CONFIG, now=NOW)
    # 1 of 4 template attributes filled
    assert snapshot(db_path, "fsn:FSN1", "attribute_completeness") == \
        pytest.approx(0.25)
    assert snapshot(db_path, "fsn:FSN1", "image_count_ok") == 0.0
