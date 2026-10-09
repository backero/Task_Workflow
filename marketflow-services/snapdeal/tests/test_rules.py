"""The Snapdeal rules against 'Snapdeal_Marketplace_Algorithm_Report.md' and README's stated thresholds.
Run:  venv\\Scripts\\python.exe -m pytest tests -q
"""
import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import database as db
from app.engine import rules

TODAY = datetime.date.today()


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB", str(tmp_path / "t.db"))
    db.init()
    yield


def listing(sku="SD-1", title="Aarna Fab Men Solid Cotton Kurta Blue", brand="Aarna Fab", price=449, mrp=999,
            stock=10, rating=4.2, reviews=60, image_ok=1, attrs_filled=9, attrs_total=12, updated=None):
    db.upsert_listings([dict(sku=sku, title=title, brand=brand, category="Men > Kurtas", price=price, mrp=mrp,
                             stock=stock, status="live", rating=rating, reviews=reviews, fulfilment="Dropship",
                             image_ok=image_ok, attrs_filled=attrs_filled, attrs_total=attrs_total,
                             created="2023-01-01", updated=updated or TODAY.isoformat())])


def scorecard(cancellation_pct=0.5, ontime_pct=99.0, rating=4.3, dto_pct=3.0):
    db.upsert_scorecard(dict(day=TODAY.isoformat(), cancellation_pct=cancellation_pct, ontime_pct=ontime_pct,
                             rating=rating, dto_pct=dto_pct))


def open_codes(entity=None):
    rows = db.q("SELECT * FROM alerts WHERE status='open'")
    return {r["code"] for r in rows if entity is None or r["entity"] == entity}


def test_health_gate_thresholds(fresh_db):
    scorecard(cancellation_pct=0.6, ontime_pct=99, rating=4.3, dto_pct=3)
    rules.evaluate()
    assert open_codes("seller-account") == set()

    scorecard(cancellation_pct=1.2, ontime_pct=95, rating=3.8, dto_pct=6.5)
    rules.evaluate()
    assert open_codes("seller-account") == {"CANCEL_HIGH", "ONTIME_LOW", "RATING_LOW", "DTO_HIGH"}


def test_alerts_refresh_in_place_instead_of_spawning_duplicates(fresh_db):
    """Before the 2026-09-26 fix, the title carried the live number and de-dup matched on the exact title, so every
    changed value opened ANOTHER alert forever - and the one 'resolve' call site compared against a title with the
    number missing, so it never matched and never closed anything."""
    scorecard(cancellation_pct=1.1)
    rules.evaluate()
    assert db.q("SELECT COUNT(*) n FROM alerts WHERE code='CANCEL_HIGH'")[0]["n"] == 1

    scorecard(cancellation_pct=1.4)   # still over the line, but a different number
    rules.evaluate()
    rows = db.q("SELECT * FROM alerts WHERE code='CANCEL_HIGH'")
    assert len(rows) == 1 and "1.4" in rows[0]["title"] and rows[0]["status"] == "open"   # same row, fresh number

    scorecard(cancellation_pct=0.3)   # fixed
    rules.evaluate()
    rows = db.q("SELECT * FROM alerts WHERE code='CANCEL_HIGH'")
    assert len(rows) == 1 and rows[0]["status"] == "cleared"                              # closes itself
    assert "CANCEL_HIGH" not in open_codes("seller-account")


def test_owner_marked_alert_is_never_reopened_or_rewritten(fresh_db):
    scorecard(cancellation_pct=1.1)
    rules.evaluate()
    aid = db.q("SELECT id FROM alerts WHERE code='CANCEL_HIGH'")[0]["id"]
    with db.conn() as c:
        c.execute("UPDATE alerts SET status='resolved' WHERE id=?", (aid,))
    scorecard(cancellation_pct=1.6)   # the problem is still there
    rules.evaluate()
    statuses = sorted(r["status"] for r in db.q("SELECT status FROM alerts WHERE code='CANCEL_HIGH'"))
    assert statuses == ["open", "resolved"]   # the operator's row is untouched; a fresh one opens for the live problem


def test_listing_rules_stockout_image_attrs_and_discount_band(fresh_db):
    listing(sku="A", stock=0)
    listing(sku="B", image_ok=0)
    listing(sku="C", attrs_filled=5, attrs_total=12)
    listing(sku="D", price=900, mrp=999)     # 10% off: below the 40-60% band
    listing(sku="E", price=449, mrp=999)     # ~55%: inside the band
    rules.evaluate()
    assert "STOCKOUT" in open_codes("A")
    assert "IMAGE_QC" in open_codes("B")
    assert "ATTRS_LOW" in open_codes("C")
    assert "DISCOUNT_BAND" in open_codes("D")
    assert "DISCOUNT_BAND" not in open_codes("E")


def test_discount_band_upper_edge_matches_the_documented_60_not_75(fresh_db):
    listing(sku="X", price=350, mrp=999)     # 65%: over the report's stated 60% ceiling
    rules.evaluate()
    assert "DISCOUNT_BAND" in open_codes("X")


def test_rating_drag_and_low_reviews_need_enough_volume(fresh_db):
    listing(sku="A", rating=3.5, reviews=25)
    listing(sku="B", rating=3.5, reviews=5)     # too few reviews to call it "dragging rank"
    listing(sku="C", reviews=10, stock=5)       # below the ~50 threshold
    listing(sku="D", reviews=80, stock=5)
    rules.evaluate()
    assert "RATING_DRAG" in open_codes("A") and "RATING_DRAG" not in open_codes("B")
    assert "LOW_REVIEWS" in open_codes("C") and "LOW_REVIEWS" not in open_codes("D")


def test_title_syntax_checks_the_brand_prefix(fresh_db):
    listing(sku="A", brand="Aarna Fab", title="Aarna Fab Men Solid Cotton Kurta Blue")
    listing(sku="B", brand="Aarna Fab", title="Men Solid Cotton Kurta Blue by Aarna Fab")
    rules.evaluate()
    assert "TITLE_SYNTAX" not in open_codes("A")
    assert "TITLE_SYNTAX" in open_codes("B")


def test_duplicate_title_flags_both_skus(fresh_db):
    listing(sku="A", title="Same Product Title Here")
    listing(sku="B", title="Same Product Title Here")
    listing(sku="C", title="A Different Title Entirely")
    rules.evaluate()
    assert "DUPLICATE_TITLE" in open_codes("A") and "DUPLICATE_TITLE" in open_codes("B")
    assert "DUPLICATE_TITLE" not in open_codes("C")
    a = next(r for r in db.q("SELECT * FROM alerts WHERE code='DUPLICATE_TITLE' AND entity='A'"))
    assert "B" in a["title"]


def test_freshness_stale_window(fresh_db):
    old = (TODAY - datetime.timedelta(days=30)).isoformat()
    listing(sku="A", updated=old)
    listing(sku="B", updated=TODAY.isoformat())
    rules.evaluate()
    assert "STALE" in open_codes("A") and "STALE" not in open_codes("B")


def test_velocity_and_ctr_need_a_track_record(fresh_db):
    listing(sku="A")
    rows = []
    for i in range(20):
        day = (TODAY - datetime.timedelta(days=i)).isoformat()
        orders = 0 if i < 7 else 2   # last 7 days: 0 orders; prior 7: 14 orders -> a stall
        rows.append(dict(sku="A", day=day, impressions=50, clicks=2, orders=orders,
                         cancellations=0, dto=0, rto=0, revenue=orders * 449))
    db.upsert_metrics(rows)
    rules.evaluate()
    assert "VELOCITY_STALL" in open_codes("A")


def test_ads_rules_acos_and_zero_orders(fresh_db):
    rows = [dict(campaign="C1", sku="A", day=TODAY.isoformat(), spend=1000, impressions=5000, clicks=150,
                orders=2, revenue=1500)]
    rows.append(dict(campaign="C2", sku="B", day=TODAY.isoformat(), spend=200, impressions=3000, clicks=120,
                     orders=0, revenue=0))
    db.upsert_ads(rows)
    rules.evaluate()
    assert "ACOS_HIGH" in open_codes("C1")            # 1000/1500 = 67% > 40%
    assert "ADS_ZERO_ORDERS" in open_codes("C2")       # 120 clicks, 0 orders


def test_ads_alert_clears_when_acos_recovers(fresh_db):
    db.upsert_ads([dict(campaign="C1", sku="A", day=TODAY.isoformat(), spend=1000, impressions=5000,
                        clicks=150, orders=2, revenue=1500)])
    rules.evaluate()
    assert "ACOS_HIGH" in open_codes("C1")
    with db.conn() as c:
        c.execute("DELETE FROM ads_daily")
    db.upsert_ads([dict(campaign="C1", sku="A", day=TODAY.isoformat(), spend=600, impressions=5000,
                        clicks=150, orders=8, revenue=3600)])   # still enough spend to judge (>500), now a healthy ACOS
    rules.evaluate()
    assert "ACOS_HIGH" not in open_codes("C1")
    assert db.q("SELECT status FROM alerts WHERE code='ACOS_HIGH'")[0]["status"] == "cleared"
