"""Snapdeal panel parsers, checked against pages captured live on 2026-09-26 (tests/fixtures/sd_*.txt)."""
from pathlib import Path

import pytest

from app.connectors import panel_reader as pr

FIX = Path(__file__).parent / "fixtures"


def fx(name):
    return (FIX / name).read_text(encoding="utf-8")


def test_dashboard_summary_and_payments():
    m = pr.parse_dashboard(fx("sd_dashboard.txt"))
    assert m["account_health"] == "Good" and m["order_processing_health"] == "EXCELLENT"
    assert m["sales_completed"] == 11641 and m["sales_returned"] == 1372
    assert m["orders_booked"] == 68 and m["orders_processed"] == 73 and m["orders_returned"] == 8
    assert m["avg_seller_rating"] == 4.4
    assert m["unsettled_cod"] == -24 and m["unsettled_ncod"] == 23
    assert m["last_settled_cod"] == 0 and m["last_settled_ncod"] == 0


def test_dashboard_layout_change_raises():
    with pytest.raises(pr.LayoutChanged):
        pr.parse_dashboard("Dashboard something else entirely")


def test_catalog_page_reads_every_row_with_its_own_numbers():
    rows = pr.parse_catalog_page(fx("sd_catalog_p1.txt"))
    assert len(rows) == 10
    first = rows[0]
    assert first["sku"] == "TRCCFW-150" and first["pog_id"] == "622396024124"
    assert first["price"] == 179 and first["mrp"] == 399 and first["stock"] == 99
    assert first["msp"] == 55 and first["gross_payable"] == 62 and first["product_rating_pct"] == 100
    assert first["title"].startswith("treyfa - Exfoliating Face Wash")
    third = next(r for r in rows if r["sku"] == "TRTFW100")
    assert third["product_rating_pct"] == 67 and third["price"] == 154


def test_catalog_row_without_a_product_rating_is_still_read():
    rows = pr.parse_catalog_page(fx("sd_catalog_p1.txt"))
    last = next(r for r in rows if r["sku"] == "TRNFW100")
    assert last["product_rating_pct"] is None and last["price"] == 163 and last["stock"] == 91


def test_catalog_totals():
    assert pr.parse_catalog_totals(fx("sd_catalog_p1.txt")) == {"in_stock": 37, "out_of_stock": 0}


def test_catalog_with_skus_but_no_matching_rows_raises():
    with pytest.raises(pr.LayoutChanged):
        pr.parse_catalog_page("SKU : ABC | POG ID : 1\nnothing that matches")


def test_pending_orders_and_courier_returns():
    assert pr.parse_pending_orders(fx("sd_orders.txt")) == {"pending_orders_to_print": 1}
    assert pr.parse_courier_returns(fx("sd_returns.txt")) == {"courier_returns_pending": 7}


def test_to_listing_marks_unknown_fields_neutral_not_invented():
    row = pr.parse_catalog_page(fx("sd_catalog_p1.txt"))[0]
    l = pr.to_listing(row)
    assert l["rating"] == 0 and l["reviews"] == 0 and l["brand"] == "treyfa"
    assert l["attrs_filled"] == l["attrs_total"] and l["status"] == "live"


def test_order_processing_health_gate():
    m = pr.parse_order_processing(fx("sd_orderproc.txt"))
    assert m["order_processing_health"] == "Excellent"
    assert m["manifested_last_3_days"] == 6 and m["shipped_last_3_days"] == 14
    assert m["manifest_pct_3_day_lag"] == 100 and m["shipped_pct_3_day_lag"] == 100
    assert m["total_rating_count"] == 64 and m["bad_rating_pct"] == 9


def test_bad_rating_products_carry_their_own_orders_and_sales():
    rows = pr.parse_bad_rating_products(fx("sd_perf_products.txt"))
    assert [r["sku"] for r in rows] == ["TRNFW100", "TRTFW100"]
    assert rows[0]["orders_30d"] == 5 and rows[0]["transfer_amount_30d"] == 526 and rows[0]["bad_pct"] == 100
    assert rows[1]["orders_30d"] == 9 and rows[1]["transfer_amount_30d"] == 829 and rows[1]["bad_pct"] == 50


def test_payments_dashboard_and_settlements():
    m = pr.parse_payments_dashboard(fx("sd_pay_dash.txt"))
    assert m["month_credited"] == 1510.28 and m["month_credited_change_pct"] == 51.17 and m["last_payment"] == 95.66
    rows = pr.parse_settlements(fx("sd_pay_all.txt"))
    assert len(rows) == 10 and rows[0] == {"date": "24 Sep 2026", "amount": 95.66, "ref": "HDFCH01281091398", "transactions": 15}


def test_ads_summary_and_wallet():
    a = pr.parse_ads_summary(fx("sd_ads.txt"))
    assert a["impressions"] == 2413 and a["clicks"] == 5 and a["conversions"] == 1
    assert a["sales"] == 149 and a["spend"] == 57 and a["roi"] == 2.64 and a["wallet_balance"] == 3001.23
    assert a["range_from"] == "28 Aug, 2026" and a["range_to"] == "26 Sep, 2026"


def test_not_live_catalog_including_out_of_stock_rows():
    text = fx("sd_catalog_notlive.txt")
    assert pr.parse_notlive_totals(text) == {"disabled_by_you": 35, "disabled_by_snapdeal": 0, "rejected": 0}
    rows = pr.parse_catalog_page(text)
    assert len(rows) == 10 and rows[5]["stock"] == 0 and rows[0]["stock"] == 47
    assert pr.to_listing(rows[0], "not_live")["status"] == "not_live"
