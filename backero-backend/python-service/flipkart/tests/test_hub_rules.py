"""HUB-* rules, driven by the REAL captured Seller Hub pages."""
import sqlite3
from pathlib import Path

import pytest

from fkpulse import recommend, sellerhub as sh
from fkpulse.db import init_db

FX = Path(__file__).parent / "fixtures"
CFG = {"thresholds": {}}


def fx(name):
    return (FX / name).read_text(encoding="utf-8")


@pytest.fixture()
def db_path(tmp_path):
    path = str(tmp_path / "hub.db")
    init_db(path)
    conn = sqlite3.connect(path)
    sh.init_hub_tables(conn)
    now = "2026-09-25T14:00:00"
    sh.store_metrics(conn, "business_health", sh.parse_business_health(fx("hub_business_health.txt")), now)
    t, drops = sh.parse_traffic(fx("hub_traffic.txt"))
    sh.store_metrics(conn, "traffic", t, now)
    for d in drops:
        conn.execute("INSERT INTO hub_traffic_drops(captured_at, sku, name, impressions_drop, units_lost) VALUES (?,?,?,?,?)", (now, d["sku"], d["name"], d["impressions_drop"], d["units_lost"]))
    a, camps = sh.parse_ads(fx("hub_ads.txt"))
    sh.store_metrics(conn, "ads", a, now)
    sh.store_metrics(conn, "listing_states", sh.parse_listing_states(fx("hub_listings.txt")), now)
    sh.store_metrics(conn, "payments", sh.parse_payments(fx("hub_payments.txt")), now)
    for r in sh.parse_listing_rows(fx("hub_listings.txt")):
        conn.execute("INSERT INTO hub_listing_rows(captured_at, sku, title, category, mrp, price, final_price, stock, days_on_hand, return_rate_pct, quality, rating) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                     (now, r["sku"], r["title"], r["category"], r["mrp"], r["price"], r["final_price"], r["stock"], r["days_on_hand"], r["return_rate_pct"], r["quality"], r["rating"]))
    conn.execute("INSERT INTO listings(fsn, sku, title, brand, status) VALUES ('HOLGKXDZNRCRKKJX', 'TRCCOI200', 't', 'TREYFA', 'ACTIVE')")
    conn.commit()
    conn.close()
    return path


def recs(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        return {r["rule_id"]: r for r in conn.execute("SELECT * FROM recommendations WHERE rule_id LIKE 'HUB-%'")}
    finally:
        conn.close()


def test_real_account_numbers_raise_every_relevant_alert(db_path):
    recommend.generate(db_path, CFG)
    got = recs(db_path)
    assert {"HUB-01", "HUB-02", "HUB-03", "HUB-04", "HUB-05", "HUB-06", "HUB-07", "HUB-08"} <= set(got), sorted(got)
    assert got["HUB-01"]["severity"] == "high" and "3.45%" in got["HUB-01"]["title"]
    assert got["HUB-02"]["severity"] == "high" and "38.2%" in got["HUB-02"]["title"]
    assert got["HUB-03"]["severity"] == "high" and "52%" in got["HUB-03"]["title"] and "TRHHO100" in got["HUB-03"]["detail"] and "67%" in got["HUB-03"]["detail"]
    assert "1.25" in got["HUB-04"]["title"] or "1.26" in got["HUB-04"]["title"]
    assert "2 listings are blocked" in got["HUB-05"]["title"]
    assert got["HUB-06"]["severity"] == "high" and "4 of the last 4 payouts were" in got["HUB-06"]["detail"]
    # more than one listing can be rated Bad — check the one we mapped to an FSN, not whichever row came last
    conn = sqlite3.connect(db_path)
    hub07 = conn.execute("SELECT fsn, title FROM recommendations WHERE rule_id = 'HUB-07'").fetchall()
    conn.close()
    assert ("HOLGKXDZNRCRKKJX", "Flipkart rates listing quality 'Bad' — TRCCOI200") in hub07, hub07


def test_rules_are_quiet_when_the_numbers_are_healthy(tmp_path):
    path = str(tmp_path / "ok.db")
    init_db(path)
    conn = sqlite3.connect(path)
    sh.init_hub_tables(conn)
    sh.store_metrics(conn, "business_health", {"seller_cancel_pct": 0.1, "dbd_breach_pct": 0.2, "competitive_flipkart_pct": 90.0}, "2026-09-25T14:00:00")
    sh.store_metrics(conn, "traffic", {"impressions_30d": 70000.0, "impressions_prev_30d": 60000.0}, "2026-09-25T14:00:00")
    sh.store_metrics(conn, "ads", {"spend": 1000.0, "roi": 6.0, "wallet_balance": 5000.0}, "2026-09-25T14:00:00")
    sh.store_metrics(conn, "listing_states", {"blocked": 0.0}, "2026-09-25T14:00:00")
    sh.store_metrics(conn, "payments", {"net_payable_negative": 0.0, "previous_payouts_zero": 0.0, "previous_payouts_listed": 4.0}, "2026-09-25T14:00:00")
    conn.commit(); conn.close()
    recommend.generate(path, CFG)
    assert recs(path) == {}


def test_rules_do_nothing_before_the_seller_hub_has_ever_been_read(tmp_path):
    path = str(tmp_path / "empty.db")
    init_db(path)   # no hub tables at all — must not crash the daily digest
    recommend.generate(path, CFG)
    assert recs(path) == {}
