"""Seller Hub parsers, run against REAL captured pages (tests/fixtures/hub_*.txt)."""
import sqlite3
from pathlib import Path

import pytest

from fkpulse import sellerhub as sh

FX = Path(__file__).parent / "fixtures"


def fx(name: str) -> str:
    return (FX / name).read_text(encoding="utf-8")


def test_home_kpis():
    h = sh.parse_home(fx("hub_home.txt"))
    assert h["units_today"] == 2 and h["sales_today"] == 220 and h["sales_yesterday"] == 297
    assert h["impressions_latest"] == 604 and h["impressions_previous_day"] == 738
    assert h["upcoming_payment"] == 3200          # "₹3.2K"
    assert h["impressions_drop_30d_pct"] == 67


def test_business_health_reads_the_numbers_flipkart_judges_a_seller_on():
    b = sh.parse_business_health(fx("hub_business_health.txt"))
    assert b["pre_dispatch_cancel_pct"] == 15.33
    assert b["dbd_breach_pct"] == 38.21
    assert b["seller_cancel_pct"] == 3.45
    assert b["rto_pct"] == 5.17 and b["buyer_returns_pct"] == 1.45
    assert (b["impressions_7d"], b["impressions_prev_7d"]) == (5600, 6500)
    assert b["units_7d"] == 26 and b["sales_7d"] == 4400
    assert b["low_quality_listings"] == 4 and b["listings_scored"] == 32
    assert b["competitive_flipkart_pct"] == 47.28 and b["buy_now_share_pct"] == 100


def test_traffic_report_and_the_listings_losing_impressions():
    t, drops = sh.parse_traffic(fx("hub_traffic.txt"))
    assert (t["impressions_30d"], t["impressions_prev_30d"]) == (30700, 63700)
    assert t["impressions_change_pct"] == -67
    assert t["units_30d"] == 131 and t["sales_30d"] == 21920
    assert [d["sku"] for d in drops] == ["TRHH100", "TRNFF150", "TRHHO100", "TRCCOI200"]
    assert drops[2]["impressions_drop"] == 30000 and drops[0]["units_lost"] == 19


def test_traffic_report_on_the_2026_09_27_page_layout():
    """Real capture where 'Sources of Impressions' only renders after switching to the 30-day period (see
    sellerhub.py's traffic() - it used to wait on that text before the switch and always timed out)."""
    t, drops = sh.parse_traffic(fx("hub_traffic_2026-09-27.txt"))
    assert (t["impressions_30d"], t["impressions_prev_30d"]) == (29100, 67100)
    assert t["impressions_change_pct"] == -69
    assert t["units_30d"] == 144 and t["sales_30d"] == 23170
    assert len(drops) == 4 and drops[0]["sku"] == "TRHH100" and drops[0]["units_lost"] == 19


def test_ads_summary_and_every_campaign():
    a, campaigns = sh.parse_ads(fx("hub_ads.txt"))
    assert a["spend"] == 976 and a["roi"] == 1.26 and a["clicks"] == 286 and a["units"] == 8
    assert a["wallet_balance"] == 2470.69
    # the page announces 7 campaigns but renders rows lazily: the fixture holds 6. That gap must be visible, not silent.
    assert a["campaigns_total"] == 7 and a["campaigns_read"] == len(campaigns) == 6
    live = [c for c in campaigns if c["status"] == "Live"]
    assert len(live) == 1 and live[0]["name"] == "PLA_Campaign-2026-07-30"
    assert live[0]["spend"] == 975 and live[0]["views"] == 35491 and live[0]["revenue"] == 1226 and live[0]["roi"] == 1.26
    assert {c["status"] for c in campaigns} == {"Live", "Paused", "Draft"}


def test_listing_states_and_rows():
    s = sh.parse_listing_states(fx("hub_listings.txt"))
    assert (s["active"], s["blocked"], s["inactive"], s["archived"]) == (32, 2, 19, 72)
    rows = sh.parse_listing_rows(fx("hub_listings.txt"))
    assert len(rows) >= 10
    first = rows[0]
    assert first["sku"] == "TRCCSC200" and first["mrp"] == 226 and first["price"] == 131
    assert first["final_price"] == 105, "the price after offers is what the customer really pays"
    assert first["stock"] == 102 and first["quality"] == "Good" and first["rating"] == 5
    curry = next(r for r in rows if r["sku"] == "TRCCOI200")
    assert curry["quality"] == "Bad" and curry["rating"] == 2.86


def test_orders_inventory_and_payments():
    assert sh.parse_orders(fx("hub_orders.txt"))["in_transit"] == 18
    assert sh.parse_orders(fx("hub_orders.txt"))["completed"] == 393
    inv = sh.parse_inventory(fx("hub_inventory.txt"))
    assert inv["skus"] == 138 and inv["out_of_stock_skus"] == 0 and inv["units_in_stock"] == 5184
    p = sh.parse_payments(fx("hub_payments.txt"))
    assert p["net_payable_negative"] == 1.0, "payouts of ₹0 because net payable was negative must be detected"
    assert p["previous_payouts_zero"] == 4 and p["outstanding_amount"] == 1830
    assert p["estimate_0_postpaid"] == -2587


@pytest.mark.parametrize("fn", [sh.parse_home, sh.parse_business_health, sh.parse_traffic, sh.parse_ads, sh.parse_listing_states, sh.parse_orders, sh.parse_inventory, sh.parse_payments])
def test_a_changed_layout_fails_loudly_instead_of_reporting_zeros(fn):
    with pytest.raises(sh.LayoutChanged):
        fn("some completely different page")


def test_number_helper_understands_flipkarts_units():
    assert sh._num("5.6K") == 5600 and sh._num("₹1,226.00") == 1226 and sh._num("-2,587") == -2587 and sh._num("--") is None


def test_storage_round_trip(tmp_path):
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    sh.init_hub_tables(conn)
    sh.store_metrics(conn, "business_health", {"dbd_breach_pct": 38.21, "note": "x", "flag": None}, "2026-09-25T14:00:00")
    sh.store_metrics(conn, "business_health", {"dbd_breach_pct": 12.0}, "2026-09-25T18:00:00")
    conn.commit()
    assert sh.latest_metric(conn, "business_health", "dbd_breach_pct") == 12.0   # newest wins
    assert sh.latest_metric(conn, "business_health", "missing") is None


def test_merge_listing_pages_counts_each_sku_once():
    page1 = fx("hub_listings.txt")
    only_first = sh.parse_listing_rows(page1)
    # the same page read twice (a lazy table re-rendering) adds nothing
    assert len(sh.merge_listing_pages([page1, page1])) == len(only_first)
    # a second page with one new listing adds exactly that one, and an empty page adds nothing
    extra = page1.replace("TRCCSC200", "NEWSKU999", 1)
    merged = sh.merge_listing_pages([page1, "", extra])
    assert len(merged) == len(only_first) + 1
    assert {r["sku"] for r in merged} >= {"TRCCSC200", "NEWSKU999"}
    # first sighting wins (the price on page 1 is not overwritten by a later duplicate)
    assert next(r for r in merged if r["sku"] == "TRCCOI200")["quality"] == "Bad"


def test_hub_read_refreshes_the_listings_table(tmp_path):
    import sqlite3
    db = str(tmp_path / "t.db")
    conn = sqlite3.connect(db)
    conn.executescript("""CREATE TABLE listings(fsn TEXT, sku TEXT, title TEXT, price REAL, mrp REAL, stock INTEGER, rating_avg REAL, updated_at TEXT);
        INSERT INTO listings VALUES ('F1','SKU1','one',100,150,5,3.0,'2026-09-18T00:00:00'),('F2','SKU2','two',200,250,7,4.0,'2026-09-18T00:00:00');""")
    sh.init_hub_tables(conn)
    conn.execute("INSERT INTO hub_listing_rows(captured_at, sku, title, category, mrp, price, final_price, stock, days_on_hand, return_rate_pct, quality, rating) "
                 "VALUES ('2026-09-25T10:00:00','SKU1','one','c',160,110,99,42,'',0,'Good',4.5),"
                 "('2026-09-25T10:00:00','NOT-IN-LISTINGS','x','c',1,1,1,1,'',0,'Good',1)")
    conn.commit(); conn.close()
    assert sh.refresh_listings_from_hub(db) == 1                         # only the SKU that exists is touched
    row = sqlite3.connect(db).execute("SELECT price, mrp, stock, rating_avg, updated_at FROM listings WHERE sku = 'SKU1'").fetchone()
    assert row[:4] == (110, 160, 42, 4.5) and row[4] > "2026-09-25"
    assert sqlite3.connect(db).execute("SELECT price, updated_at FROM listings WHERE sku = 'SKU2'").fetchone() == (200, "2026-09-18T00:00:00")


def test_pending_order_groups_single_and_combo_skus():
    text = fx("hub_pending_orders.txt")
    groups = sh.parse_pending_order_groups(text)
    assert len(groups) == 10
    single = groups[0]
    assert single["orders"] == 3 and single["price_low"] == 99 and single["price_high"] == 109
    assert single["items"] == [{"qty": 1, "title": "TREYFA Choco Coffee foaming face wash Anti aging, Deep exf...",
                                "sku": "TRCCFW150", "fsn": "FCWGJZXGMCTMZE2E"}]
    one_price = next(g for g in groups if g["items"][0]["sku"] == "TRNFF150" and g["orders"] == 1 and g["items"][0]["qty"] == 1)
    assert one_price["price_low"] == one_price["price_high"] == 101   # a single price ("₹101"), not a range

    combo = next(g for g in groups if len(g["items"]) == 3)
    assert combo["orders"] == 1 and combo["price_low"] == combo["price_high"] == 330
    assert [i["sku"] for i in combo["items"]] == ["TRCCOI200", "TRHHO100", "TRTSC200"]
    assert all(i["qty"] == 1 for i in combo["items"])

    two_item = next(g for g in groups if len(g["items"]) == 2)
    assert [i["sku"] for i in two_item["items"]] == ["TRCHCI200", "TRNHO100"]


def test_pending_order_groups_empty_queue_is_not_an_error():
    assert sh.parse_pending_order_groups("Orders\nTo Accept\n0\nNothing here") == []


def test_returns_summary():
    metrics = sh.parse_returns(fx("hub_returns_empty.txt"))
    assert metrics == {"in_progress": 0.0, "completed": 0.0}


def test_returns_missing_summary_raises_layout_changed():
    with pytest.raises(sh.LayoutChanged):
        sh.parse_returns("Self Ship Returns\nsomething else entirely")
