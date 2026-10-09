"""Tests for fkpulse.recommend — builds a temp SQLite DB per SPEC schema
directly (no dependency on Agent A's db.py). Dates are relative to real
now() because rule checks read wall-clock time for 30d windows.
"""

import json
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fkpulse.kpi import compute_all          # noqa: E402
from fkpulse.recommend import RULES, generate  # noqa: E402

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

NOW = datetime.now()


def build_db(tmp_path):
    path = tmp_path / "test.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    return str(path)


def add_listing(db_path, fsn, **kw):
    defaults = dict(fsn=fsn, sku=fsn, title=f"Niacinamide Serum {fsn}",
                    brand="B",
                    category="C", price=499.0, mrp=599.0, stock=100,
                    status="ACTIVE",
                    attributes_json=json.dumps({"a": "1", "b": "2"}),
                    attributes_total=2, image_count=4,
                    rating_avg=4.5, rating_count=100, review_count=40,
                    listed_date=(NOW - timedelta(days=60)).isoformat(),
                    updated_at=NOW.isoformat())
    defaults.update(kw)
    conn = sqlite3.connect(db_path)
    cols = ", ".join(defaults)
    conn.execute(f"INSERT INTO listings({cols}) VALUES "
                 f"({', '.join('?' for _ in defaults)})",
                 list(defaults.values()))
    conn.commit()
    conn.close()


def add_order(db_path, order_id, fsn, qty=1, days_ago=5, rto=0,
              pincode="560001"):
    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO orders(order_id, fsn, sku, qty, price, order_date,
                              status, cancelled, rtd_breach, rto, pincode,
                              payment_type)
           VALUES (?, ?, ?, ?, 499.0, ?, 'DELIVERED', 0, 0, ?, ?, 'COD')""",
        (order_id, fsn, fsn, qty,
         (NOW - timedelta(days=days_ago)).isoformat(), rto, pincode))
    conn.commit()
    conn.close()


def recs(db_path, rule_id=None):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    sql = "SELECT * FROM recommendations"
    params = ()
    if rule_id:
        sql += " WHERE rule_id = ?"
        params = (rule_id,)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return rows


def test_rules_registry_complete():
    ids = {r.id for r in RULES}
    assert ids == {"LQS-01", "LQS-02", "RAT-01", "RAT-02", "STK-01",
                   "PRC-02", "PRC-03", "OPS-01", "OPS-02", "RTO-01",
                   "SET-01", "ADS-01", "EVT-01", "EVT-02", "KWD-01",
                   "RNK-01", "HUB-01", "HUB-02", "HUB-03", "HUB-04", "HUB-05",
                   "HUB-06", "HUB-07", "HUB-08"}
    for r in RULES:
        assert r.rationale_ref, f"{r.id} missing rationale_ref"


def test_prc03_commission_cliff(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "CLIFF", price=1099.0)   # inside (1000, 1150) -> fires
    add_listing(db, "BELOW", price=999.0)    # below cliff -> no
    add_listing(db, "ABOVE", price=1200.0)   # above band -> no
    add_listing(db, "EDGE", price=1000.0)    # exactly 1000 -> no

    generate(db, CONFIG)

    rows = recs(db, "PRC-03")
    assert [r["fsn"] for r in rows] == ["CLIFF"]
    assert "999" in rows[0]["detail"]
    assert "Ch.5" in next(r for r in RULES if r.id == "PRC-03").rationale_ref


def test_evt02_usual_price_window(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "NEW", listed_date=(NOW - timedelta(days=5))
                .isoformat())
    add_listing(db, "OLD", listed_date=(NOW - timedelta(days=20))
                .isoformat())
    compute_all(db, CONFIG, now=NOW)

    generate(db, CONFIG)

    rows = recs(db, "EVT-02")
    assert [r["fsn"] for r in rows] == ["NEW"]
    assert "day 15" in rows[0]["detail"]


def test_dedup_open_recs_by_rule_and_fsn(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "CLIFF", price=1099.0)
    first = generate(db, CONFIG)
    assert first >= 1
    # second run must insert nothing while recs are still open
    assert generate(db, CONFIG) == 0
    assert len(recs(db, "PRC-03")) == 1

    # mark done -> rule may re-fire (dedup only covers open recs)
    conn = sqlite3.connect(db)
    conn.execute("UPDATE recommendations SET status = 'done' "
                 "WHERE rule_id = 'PRC-03'")
    conn.commit()
    conn.close()
    assert generate(db, CONFIG) == 1
    assert len(recs(db, "PRC-03")) == 2


def test_stk01_stock_cover_severity(tmp_path):
    db = build_db(tmp_path)
    # MED: 12 units/30d -> 0.4/day; stock 5 -> 12.5 days cover (< 14)
    add_listing(db, "MED", stock=5)
    for i in range(12):
        add_order(db, f"M{i}", "MED")
    # HIGH: stock 2, same velocity -> 5 days cover (< 7)
    add_listing(db, "HIGH", stock=2)
    for i in range(12):
        add_order(db, f"H{i}", "HIGH")
    compute_all(db, CONFIG, now=NOW)

    generate(db, CONFIG)

    rows = {r["fsn"]: r for r in recs(db, "STK-01")}
    assert rows["MED"]["severity"] == "medium"
    assert rows["HIGH"]["severity"] == "high"
    # restock suggestion = velocity x 30 = 0.4 * 30 = 12 units
    assert "~12 units" in rows["HIGH"]["detail"]


def test_rat01_severity_bands(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "LOW", rating_avg=4.0)      # < 4.2 -> medium
    add_listing(db, "BAD", rating_avg=3.5)      # < 3.8 -> high
    add_listing(db, "GOOD", rating_avg=4.6)     # fine
    generate(db, CONFIG)
    rows = {r["fsn"]: r for r in recs(db, "RAT-01")}
    assert set(rows) == {"LOW", "BAD"}
    assert rows["LOW"]["severity"] == "medium"
    assert rows["BAD"]["severity"] == "high"


def test_rto01_per_fsn_pincode_clusters(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "RTO1")
    add_listing(db, "OK")
    # RTO1: 4 orders, 2 RTO = 50% > 25% -> fires; OK: 4 orders 0 RTO
    add_order(db, "A1", "RTO1", rto=1, pincode="110001")
    add_order(db, "A2", "RTO1", rto=1, pincode="110001")
    add_order(db, "A3", "RTO1", pincode="560001")
    add_order(db, "A4", "RTO1", pincode="560001")
    for i in range(4):
        add_order(db, f"B{i}", "OK")
    compute_all(db, CONFIG, now=NOW)
    generate(db, CONFIG)

    rows = [r for r in recs(db, "RTO-01") if r["fsn"] == "RTO1"]
    assert len(rows) == 1
    assert "110001" in rows[0]["detail"]  # top RTO pincode cluster listed
    # account rate: 2 RTO / 8 orders = 25% > 20% -> account finding too
    assert any(r["scope"] == "account" for r in recs(db, "RTO-01"))


def test_rat01_unknown_rating_count_is_one_weak_low_signal(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "UNK1", rating_avg=3.8, rating_count=None)   # count never collected
    add_listing(db, "UNK2", rating_avg=3.2, rating_count=None)
    add_listing(db, "KNOWN", rating_avg=3.8, rating_count=120)   # a solid 3.8
    generate(db, CONFIG)
    rows = recs(db, "RAT-01")
    assert len(rows) == 2                                        # KNOWN gets its own card; the unknowns are grouped into one
    grouped = next(r for r in rows if r["fsn"] is None)
    assert grouped["severity"] == "low" and "2 listings" in grouped["title"] and "not known" in grouped["detail"]
    known = next(r for r in rows if r["fsn"] == "KNOWN")
    assert known["severity"] == "medium" and "based on 120 ratings" in known["detail"]


def test_ads01_is_silent_when_seller_hub_reports_ads_or_reviews_unknown(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "A", review_count=None)                     # review counts never collected
    generate(db, CONFIG)
    assert recs(db, "ADS-01") == []                             # unknown is not "0 reviews"

    # a low review count with no Seller Hub ads data does get the cold-start note...
    conn = sqlite3.connect(db)
    conn.execute('UPDATE listings SET review_count = 3')
    conn.commit()
    conn.close()
    generate(db, CONFIG)
    assert [r['rule_id'] for r in recs(db, 'ADS-01')] == ['ADS-01']
    # ...but not once Seller Hub is reporting the ads directly (HUB-04 judges them)
    conn = sqlite3.connect(db)
    conn.executescript("CREATE TABLE IF NOT EXISTS hub_metrics(id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT, area TEXT, key TEXT, value REAL, text TEXT);")
    conn.execute("INSERT INTO hub_metrics(captured_at, area, key, value) VALUES (?, 'ads', 'spend', 1010)", (NOW.isoformat(),))
    conn.commit()
    conn.close()
    conn = sqlite3.connect(db)
    conn.execute("DELETE FROM recommendations WHERE rule_id = 'ADS-01'")
    conn.commit()
    conn.close()
    generate(db, CONFIG)
    assert recs(db, 'ADS-01') == []


def test_open_recommendations_follow_the_data(tmp_path):
    db = build_db(tmp_path)
    add_listing(db, "R1", rating_avg=4.0, rating_count=50)
    generate(db, CONFIG)
    first = recs(db, "RAT-01")
    assert len(first) == 1 and "4.00" in first[0]["detail"] and first[0]["severity"] == "medium"

    conn = sqlite3.connect(db)
    conn.execute("UPDATE listings SET rating_avg = 3.5 WHERE fsn = 'R1'")   # worse: same rec, fresh numbers
    conn.commit(); conn.close()
    assert generate(db, CONFIG) == 0                                        # nothing new opened
    again = recs(db, "RAT-01")
    assert len(again) == 1 and again[0]["id"] == first[0]["id"]
    assert "3.50" in again[0]["detail"] and again[0]["severity"] == "high"

    conn = sqlite3.connect(db)
    conn.execute("UPDATE listings SET rating_avg = 4.6 WHERE fsn = 'R1'")   # fixed: the recommendation closes itself
    conn.commit(); conn.close()
    generate(db, CONFIG)
    assert [r["status"] for r in recs(db, "RAT-01")] == ["resolved"]

    # something the owner marked done is never reopened or rewritten
    conn = sqlite3.connect(db)
    conn.execute("UPDATE recommendations SET status = 'done'")
    conn.execute("UPDATE listings SET rating_avg = 3.0 WHERE fsn = 'R1'")
    conn.commit(); conn.close()
    generate(db, CONFIG)
    statuses = sorted(r["status"] for r in recs(db, "RAT-01"))
    assert statuses == ["done", "open"]                                     # the old one stays done; a new one opens
