"""The Meesho rules against the thresholds in 'How the Meesho Marketplace Algorithm Works' (research §4-§6) and the
configuration guide (Guide 2, Part 6). Run:  venv\\Scripts\\python.exe -m pytest tests -q
"""
from datetime import datetime, timedelta

import pytest

from app import database as db
from app import recommender

GOOD_TITLE = "Cotton Office Wear Kurti For Women Under 500 With Pockets Regular Fit"   # 66 characters
NOW = datetime.now()


@pytest.fixture()
def conn(tmp_path, monkeypatch):
    import app.config as config
    monkeypatch.setattr(config, "get", lambda key, default=None: default)    # the built-in defaults, not data/config.yaml
    c = db.get_conn(str(tmp_path / "t.db"))
    db.init_db(c)
    yield c
    c.close()


def add(conn, name=GOOD_TITLE, status="live", created_days_ago=20, refreshed_days_ago=None, ndd=0, is_ad=0, snap=None, cid=None):
    created = (NOW - timedelta(days=created_days_ago)).isoformat(timespec="seconds")
    refreshed = (NOW - timedelta(days=refreshed_days_ago)).isoformat(timespec="seconds") if refreshed_days_ago is not None else created
    lid = db.upsert_listing(conn, cid or f"C{conn.execute('SELECT COUNT(*) FROM listings').fetchone()[0] + 1}", name, "Kurti", 299, status, created,
                            ndd=ndd, is_ad=is_ad, last_refresh_at=refreshed)
    if snap is not None:
        db.add_snapshot(conn, lid, NOW.isoformat(timespec="seconds"), **snap)
    return lid


def codes(conn, lid=None):
    return {r["code"] for r in db.open_recommendations(conn, lid)} if lid is not None else {r["code"] for r in db.open_recommendations(conn)}


def run(conn):
    recommender.evaluate_all(conn)


def test_quality_score_thresholds_15_and_25(conn):
    rows = {}
    for qs in (14.0, 16.0, 25.0, 26.0):
        rows[qs] = add(conn, snap={"quality_score": qs, "ratings_count": 100, "rating": 4.2, "stock": 50})
    run(conn)
    assert not {"QS_WARN", "QS_BLOCK"} & codes(conn, rows[14.0])
    assert "QS_WARN" in codes(conn, rows[16.0])
    assert "QS_WARN" in codes(conn, rows[25.0]) and "QS_BLOCK" not in codes(conn, rows[25.0])   # "> ~25%" is the block zone
    assert "QS_BLOCK" in codes(conn, rows[26.0])
    assert any(a["code"] == "QS_BLOCK" and a["severity"] == "critical" for a in db.alerts(conn))


def test_quality_score_from_three_ratings_is_a_weak_signal_not_a_block(conn):
    lid = add(conn, snap={"bad_ratings": 1, "ratings_count": 3, "rating": 4.0, "stock": 50})    # 33% of 3 ratings
    run(conn)
    got = codes(conn, lid)
    assert "QS_BLOCK" not in got and "QS_WARN" in got
    assert not any(a["code"] == "QS_BLOCK" for a in db.alerts(conn))                            # no critical alert for one unhappy buyer
    assert "only 3 ratings" in db.open_recommendations(conn, lid)[0]["reason"] or any("only 3 ratings" in r["reason"] for r in db.open_recommendations(conn, lid))


def test_rating_floors_37_34_and_ads_minimum_40(conn):
    ok = add(conn, snap={"rating": 3.8, "stock": 50})
    pause = add(conn, snap={"rating": 3.6, "stock": 50})
    stop = add(conn, snap={"rating": 3.3, "stock": 50})
    ad_weak = add(conn, is_ad=1, snap={"rating": 3.9, "stock": 50})
    ad_ready = add(conn, is_ad=0, snap={"rating": 4.2, "orders": 6, "stock": 50})
    run(conn)
    assert not {"RATING_PAUSE", "RATING_STOP"} & codes(conn, ok)
    assert "RATING_PAUSE" in codes(conn, pause) and "RATING_STOP" not in codes(conn, pause)
    assert "RATING_STOP" in codes(conn, stop)
    assert "ADS_ON_WEAK" in codes(conn, ad_weak)
    assert "ADS_READY" in codes(conn, ad_ready)


def test_stock_unknown_is_not_zero(conn):
    unknown = add(conn, snap={"rating": 4.2})                     # a report without a stock column
    zero = add(conn, snap={"rating": 4.2, "stock": 0})
    low = add(conn, snap={"rating": 4.2, "stock": 5})
    fine = add(conn, snap={"rating": 4.2, "stock": 50})
    assert conn.execute("SELECT stock FROM snapshots WHERE listing_id = ?", (unknown,)).fetchone()["stock"] is None
    run(conn)
    assert not {"STOCKOUT", "LOW_STOCK"} & codes(conn, unknown)
    assert "STOCKOUT" in codes(conn, zero)
    assert "LOW_STOCK" in codes(conn, low) and "STOCKOUT" not in codes(conn, low)
    assert not {"STOCKOUT", "LOW_STOCK"} & codes(conn, fine)


def test_ctr_cvr_rto_need_enough_traffic(conn):
    weak = add(conn, snap={"impressions": 2000, "clicks": 10, "views": 300, "orders": 3, "rto": 1, "stock": 50, "rating": 4.2})
    tiny = add(conn, snap={"impressions": 50, "clicks": 0, "views": 10, "orders": 0, "stock": 50, "rating": 4.2})
    risky = add(conn, snap={"orders": 9, "rto": 2, "stock": 50, "rating": 4.2})                 # 22% RTO
    run(conn)
    assert {"CTR_LOW", "CVR_LOW"} <= codes(conn, weak)         # 0.5% CTR (<1%), 1% CVR (<2%)
    assert not {"CTR_LOW", "CVR_LOW"} & codes(conn, tiny)      # too little traffic to judge
    assert "RTO_HIGH" in codes(conn, risky)


def test_price_dispatch_and_ndd(conn):
    dear = add(conn, snap={"price": 320, "recommended_price": 290, "dispatch_sla": 85, "stock": 50, "rating": 4.2})
    fast = add(conn, ndd=0, snap={"price": 280, "recommended_price": 290, "dispatch_sla": 97.5, "stock": 50, "rating": 4.2})
    fast_on = add(conn, ndd=1, snap={"dispatch_sla": 99, "stock": 50, "rating": 4.2})
    run(conn)
    assert {"PRICE_HIGH", "SLOW_DISPATCH"} <= codes(conn, dear)
    assert "NDD_ELIGIBLE" in codes(conn, fast) and not {"PRICE_HIGH", "SLOW_DISPATCH"} & codes(conn, fast)
    assert "NDD_ELIGIBLE" not in codes(conn, fast_on)


def test_freshness_new_window_and_upload_gap(conn):
    stale = add(conn, created_days_ago=60)                                   # never refreshed, 60 days old
    refreshed = add(conn, created_days_ago=60, refreshed_days_ago=10)
    new = add(conn, created_days_ago=1)
    run(conn)
    assert "REFRESH_DUE" in codes(conn, stale) and "REFRESH_DUE" not in codes(conn, refreshed)
    assert "NEW_WINDOW" in codes(conn, new) and "NEW_WINDOW" not in codes(conn, stale)
    assert "UPLOAD_GAP" not in codes(conn)                                    # something was uploaded yesterday
    conn.execute("UPDATE listings SET created_at = ?", ((NOW - timedelta(days=30)).isoformat(timespec="seconds"),))
    conn.commit()
    run(conn)
    assert "UPLOAD_GAP" in codes(conn)


def test_blocked_and_block_cluster(conn):
    one = add(conn, status="blocked")
    run(conn)
    assert "BLOCKED" in codes(conn, one) and "BLOCK_CLUSTER" not in codes(conn)   # one block is a block, not a pattern
    two = add(conn, status="blocked")
    run(conn)
    assert "BLOCK_CLUSTER" in codes(conn)
    assert any(a["code"] == "BLOCK_CLUSTER" and a["severity"] == "critical" for a in db.alerts(conn))


def test_title_length_60_to_100(conn):
    short = add(conn, name="Kurti for women")
    good = add(conn, name=GOOD_TITLE)
    long_ = add(conn, name="Kurti " * 25)
    run(conn)
    assert "TITLE_LEN" in codes(conn, short) and "TITLE_LEN" in codes(conn, long_)
    assert "TITLE_LEN" not in codes(conn, good)


def test_recommendations_follow_the_data(conn):
    lid = add(conn, snap={"quality_score": 18.0, "ratings_count": 100, "rating": 4.2, "stock": 50})
    run(conn)
    rec = db.open_recommendations(conn, lid)[0]
    assert rec["code"] == "QS_WARN" and "18.0%" in rec["reason"]

    db.add_snapshot(conn, lid, (NOW + timedelta(hours=1)).isoformat(timespec="seconds"), quality_score=22.0, ratings_count=100, rating=4.2, stock=50)
    run(conn)
    assert len(db.open_recommendations(conn, lid)) == 1 and "22.0%" in db.open_recommendations(conn, lid)[0]["reason"]   # same card, fresh numbers

    # a later report that does not include the Quality Score at all must NOT be read as "fixed"
    db.add_snapshot(conn, lid, (NOW + timedelta(hours=2)).isoformat(timespec="seconds"), rating=4.2, stock=50)
    run(conn)
    assert "QS_WARN" in codes(conn, lid)

    db.add_snapshot(conn, lid, (NOW + timedelta(hours=3)).isoformat(timespec="seconds"), quality_score=8.0, ratings_count=100, rating=4.2, stock=50)
    run(conn)
    assert "QS_WARN" not in codes(conn, lid)                                            # measured, and healthy: closes itself
    assert conn.execute("SELECT status FROM recommendations WHERE listing_id = ? AND code = 'QS_WARN'", (lid,)).fetchone()["status"] == "resolved"


def test_owner_done_is_never_reopened_or_rewritten(conn):
    lid = add(conn, snap={"rating": 3.6, "stock": 50})
    run(conn)
    rec = db.open_recommendations(conn, lid)[0]
    db.close_recommendation(conn, rec["id"])                                           # owner marks it done
    run(conn)
    statuses = sorted(r["status"] for r in conn.execute("SELECT status FROM recommendations WHERE listing_id = ? AND code = 'RATING_PAUSE'", (lid,)))
    assert statuses == ["done", "open"]                                                 # the done one stays done; the still-true problem opens anew


def test_database_uses_a_crash_safe_journal(conn):
    assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
    assert conn.execute("PRAGMA synchronous").fetchone()[0] == 1                        # NORMAL
