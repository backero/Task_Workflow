"""Meesho panel readers, checked against real captured Supplier Panel pages
(tests/fixtures/meesho_*.txt, from scripts/capture_supplier_panel.py). Run:
    venv\\Scripts\\python.exe -m pytest tests -q
"""
import sqlite3
from pathlib import Path

import pytest

from app.connectors import panel_reader as pr

FIX = Path(__file__).parent / "fixtures"


def fx(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def test_business_overview_reads_every_totals_tile():
    m = pr.parse_business_overview(fx("meesho_08-business-dashboard.txt"))
    assert m["views"] == 6997 and m["views_change_pct"] == 21.8
    assert m["clicks"] == 219 and m["orders"] == 7
    assert m["conversion_pct"] == 100.0 and m["sales"] == 961 and m["return_pct"] == 0.0


def test_business_overview_missing_totals_raises_layout_changed():
    with pytest.raises(pr.LayoutChanged):
        pr.parse_business_overview("Business Dashboard\nsomething entirely different")


def test_payments_upcoming_and_completed_totals():
    m = pr.parse_payments(fx("meesho_07-payments.txt"))
    assert m["upcoming_days"] == 7 and m["upcoming_total"] == 225.81
    assert m["completed_days"] == 30 and m["completed_total"] == 5460.0   # "₹5.46K" -> 5460
    assert m["upcoming_sales_and_returns"] == 73.05
    assert m["upcoming_ads_cost"] == -12.46                                # "– ₹12.46" is a cost, kept negative


def test_payments_completed_block_is_optional():
    m = pr.parse_payments("Upcoming Payments Next 7 days (₹100.00)")
    assert m["upcoming_total"] == 100.0 and "completed_total" not in m


def test_quality_score_na_is_a_real_state_not_missing_data():
    m = pr.parse_quality(fx("meesho_05-quality.txt"))
    assert m["total_ratings"] == 0 and m["bad_ratings"] == 0
    assert "quality_score" in m and m["quality_score"] is None    # N/A, reported as such
    assert m["blocking_soon"] == 0 and m["action_pending"] == 0 and m["fixed"] == 0


def test_quality_score_with_a_real_percentage():
    m = pr.parse_quality("1 and 2 star ratings 4 . Total Ratings 40 . Quality Score = 10.0%")
    assert m["total_ratings"] == 40 and m["bad_ratings"] == 4 and m["quality_score"] == 10.0


def test_returns_summary_rates_and_counts():
    m = pr.parse_returns_summary(fx("meesho_03-returns.txt"))
    assert m["return_rate_pct"] == 3.85 and m["return_rate_category_avg_pct"] == 16.15
    assert m["returned"] == 1 and m["delivered"] == 26
    assert m["rto_rate_pct"] == 3.70 and m["rto_count"] == 1 and m["dispatched"] == 27
    assert m["avg_reverse_shipping_cost"] == 157.0


def test_num_handles_k_suffix_negatives_and_blanks():
    assert pr._num("6,997") == 6997
    assert pr._num("₹5.46K") == 5460
    assert pr._num("– ₹12.46") == -12.46
    assert pr._num("--") is None
    assert pr._num(None) is None


def test_store_metrics_and_read_write_roundtrip(tmp_path):
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    pr.init_panel_tables(conn)
    pr.store_metrics(conn, "quality", {"quality_score": None, "total_ratings": 40.0}, "2026-09-26T10:00:00")
    conn.commit()
    rows = {r[0]: r[1] for r in conn.execute("SELECT key, value FROM panel_metrics WHERE area = 'quality'")}
    assert rows["total_ratings"] == 40.0 and rows["quality_score"] is None
    conn.close()


def test_read_in_open_browser_raises_session_expired_when_signed_out(monkeypatch):
    class FakePage:
        url = "https://supplier.meesho.com/panel/v3/new/root/login"
        def goto(self, *a, **k): pass
        def wait_for_timeout(self, *a): pass
        def inner_text(self, *a): return "Start Selling to Crores"

    class FakeCtx:
        pages = [FakePage()]

    with pytest.raises(pr.SessionExpired):
        pr.read_in_open_browser(FakeCtx(), ":memory:")


def test_home_todo_dispatch_health_and_daily_figures():
    m = pr.parse_home(fx("meesho_home.txt"))
    assert m["pending_orders"] == 0 and m["labels_to_download"] == 1 and m["out_of_stock"] == 0 and m["low_stock"] == 0
    assert m["daily_views"] == 1120 and m["daily_orders"] == 1 and m["dispatch_health_pct"] == 57
    assert m["catalogs_blocked"] == 0 and m["catalogs_at_risk"] == 6


def test_pending_orders_count():
    assert pr.parse_pending_orders(fx("meesho_pending_orders.txt")) == {"pending_orders_list": 0}


def test_ads_overview_and_campaign_tabs():
    a = pr.parse_ads_overview(fx("meesho_ads.txt"))
    assert a["ad_spend_30d"] == 364.46 and a["ad_revenue_30d"] == 997 and a["ad_roi_30d"] == 2.74
    assert a["ad_views_30d"] == 43472 and a["ad_clicks_30d"] == 514 and a["ad_orders_30d"] == 5
    assert (a["campaigns_total"], a["campaigns_live"], a["campaigns_paused"]) == (6, 1, 5)


def test_catalog_upload_totals_and_qc_states():
    m = pr.parse_catalog_uploads(fx("meesho_catalog_uploads.txt"))
    assert (m["uploads_total"], m["uploads_bulk"], m["uploads_single"]) == (96, 3, 93)
    assert (m["qc_action_required"], m["qc_in_progress"], m["qc_error"], m["qc_pass"]) == (1, 0, 2, 1)


def test_store_products_replaces_demo_and_fills_listings(tmp_path):
    import json

    from app import database as db
    conn = db.get_conn(str(tmp_path / "p.db"))
    db.init_db(conn)
    db.upsert_listing(conn, "CAT-1000", "Demo Kurti", "x", 199, "live", "2026-01-01")
    rows = pr.parse_product_dom_rows(json.loads(fx("meesho_products_dom_page1.json")))
    pr.store_products(conn, rows, "2026-09-26T20:00:00", complete=True)
    names = [r["name"] for r in conn.execute("SELECT name FROM listings")]
    assert len(names) == 10 and not any("Demo" in n for n in names)
    snap = conn.execute("SELECT views, clicks, orders, rating FROM snapshots s JOIN listings l ON l.id = s.listing_id "
                        "WHERE l.catalog_id = '507683275'").fetchone()
    assert tuple(snap) == (2069, 79, 2, 4.0)
    pr.store_products(conn, rows, "2026-09-26T21:00:00", complete=True)      # second read: demo already cleared, no duplicates
    assert conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0] == 10


def test_product_table_rows_are_read_from_the_real_cells():
    import json
    raw = json.loads(fx("meesho_products_dom_page1.json"))
    rows = pr.parse_product_dom_rows(raw)
    assert len(rows) == len(raw) == 10
    by_id = {r["product_id"]: r for r in rows}
    hib = by_id["507683275"]
    assert hib["title"].startswith("TREYFA Hibiscus Hair Conditioner") and hib["rating"] == 4.0
    assert (hib["views"], hib["clicks"], hib["orders"], hib["sales"], hib["returns_pct"]) == (2069, 79, 2, 247, 0)
    assert hib["views_change_pct"] == 27.3
    assert all(r["views"] is not None and r["title"] for r in rows)      # no row dropped or left half-read


def test_pricing_rows_current_vs_recommended():
    rows = pr.parse_pricing_rows(fx("meesho_pricing_page1.txt"))
    assert pr.parse_pricing_total(fx("meesho_pricing_page1.txt")) == 29
    assert len(rows) == 23
    first = rows[0]
    assert first["catalog_id"] == "367434925" and first["style_id"] == "wZTJSpZ8"
    assert first["stock"] == 10 and first["price"] == 158 and first["bank_transfer"] == 81
    assert first["recommended_price"] == 147 and first["recommended_bank_transfer"] == 70
    assert first["insight"] == "Losing Views" and first["action"] == "Accept / Edit"
    best_priced = rows[1]
    assert best_priced["recommended_price"] is None and best_priced["insight"] == "Best Price" and best_priced["action"] == "Edit"


def test_pricing_missing_header_raises_layout_changed():
    with pytest.raises(pr.LayoutChanged):
        pr.parse_pricing_rows("Manage Pricing - nothing recognisable here")


def test_store_pricing_roundtrip(tmp_path):
    conn = sqlite3.connect(str(tmp_path / "p.db"))
    rows = pr.parse_pricing_rows(fx("meesho_pricing_page1.txt"))
    pr.store_pricing(conn, rows, "2026-09-27T13:00:00")
    conn.commit()
    got = conn.execute("SELECT title, price, insight FROM panel_pricing WHERE catalog_id=? AND style_id=?",
                        ("367434925", "wZTJSpZ8")).fetchone()
    assert got[1] == 158 and got[2] == "Losing Views"
    assert conn.execute("SELECT COUNT(*) FROM panel_pricing").fetchone()[0] == 23


def test_dispatch_performance_health_gate():
    m = pr.parse_dispatch_performance(fx("meesho_dispatch_perf.txt"))
    assert m["dispatch_health_pct"] == 56 and m["on_time_dispatch"] == 15 and m["total_dispatched"] == 27
    assert m["catalogs_at_risk"] == 6 and m["seller_cancellation_pct"] == 12.5
