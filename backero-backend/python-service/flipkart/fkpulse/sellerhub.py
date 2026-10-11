"""Flipkart Seller Hub reader — the data the Seller API doesn't give us, read from Seller Hub's own pages.

Why: the API sync is dead (lost vault password) and, even when alive, exposes neither the numbers Flipkart actually
judges a seller on (Business Health: cancellations, dispatch-by-date breaches, returns), nor ads, traffic, listing
quality labels, or payouts. Seller Hub shows all of them. This reads those pages (READ-ONLY page views — nothing is
clicked that changes anything, nothing is downloaded) through a dedicated logged-in browser profile
(``sellerhub-profile/``, created by ``scripts/sellerhub_login.py``).

The parsers are pure functions over a page's visible text so they can be tested against real captured pages
(``tests/fixtures/hub_*.txt``). A page whose layout changed raises :class:`LayoutChanged` — reporting zeros instead
would be the worst possible failure for a page that exists to warn.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable

BASE = "https://seller.flipkart.com/index.html"
URL_HOME = BASE + "#dashboard/home-page"
URL_LISTINGS = BASE + "#dashboard/listings-management?listingState=ACTIVE"
URL_INVENTORY = BASE + "#dashboard/unifiedInventoryNew"
URL_ORDERS = BASE + "#dashboard/my-orders?serviceProfile=seller-fulfilled&shipmentType=easy-ship&orderState=shipments"
URL_PAYMENTS = BASE + "#dashboard/payments/account-summary"
URL_RETURNS = BASE + "#dashboard/returns"
URL_GROWTH = BASE + "#dashboard/growth/seller-insights?touch_point=navigation-menu"
URL_ADS = BASE + "#dashboard/ads/campaigns"


class LayoutChanged(Exception):
    """A Seller Hub page no longer looks the way the parser expects."""


class SessionExpired(Exception):
    """Seller Hub redirected to the public landing/login page — the operator must sign in again."""


# --------------------------------------------------------------------------- helpers
def _flat(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", ln.replace("\xa0", " ")).strip() for ln in text.splitlines() if ln.strip()]


def _num(s: str | None) -> float | None:
    """'5.6K' -> 5600, '₹1,226.00' -> 1226, '21.92K' -> 21920, '-2,587' -> -2587, '--' -> None."""
    if s is None:
        return None
    t = str(s).replace("₹", "").replace(",", "").strip()
    if t in ("", "--", "-", "NA", "N/A"):
        return None
    mult = 1.0
    if t[-1:] in "kK":
        mult, t = 1000.0, t[:-1]
    elif t[-1:] in "mM":
        mult, t = 1_000_000.0, t[:-1]
    try:
        return float(t) * mult
    except ValueError:
        return None


def _need(pattern: str, text: str, what: str, flags: int = 0) -> re.Match:
    m = re.search(pattern, text, flags)
    if not m:
        raise LayoutChanged(f"could not find {what}")
    return m


# --------------------------------------------------------------------------- parsers
def parse_home(text: str) -> dict:
    """Today's / yesterday's headline numbers. Flipkart's own real-time figures ("may be inconsistent as data matures")."""
    t = _flat(text)
    m = _need(r"Impressions: (\d+ \w+) ([\d.,K]+) (\d+ \w+): ([\d.,K]+) Today.s Units ([\d,]+) Yesterday.s total: ([\d,]+) "
              r"Today.s Sales ₹([\d.,K]+) Yesterday.s total: ₹([\d.,K]+)", t, "the home KPIs")
    out = {
        "impressions_latest": _num(m.group(2)), "impressions_previous_day": _num(m.group(4)),
        "units_today": _num(m.group(5)), "units_yesterday": _num(m.group(6)),
        "sales_today": _num(m.group(7)), "sales_yesterday": _num(m.group(8)),
    }
    r = re.search(r"New Orders ([\d,]+) Pending RTD: ([\d,]+) Today.s Returns ([\d,]+)", t)
    if r:
        out.update(new_orders=_num(r.group(1)), pending_rtd=_num(r.group(2)), returns_today=_num(r.group(3)))
    p = re.search(r"Upcoming Payment ₹([\d.,K-]+)", t)
    if p:
        out["upcoming_payment"] = _num(p.group(1))
    d = re.search(r"Impressions have dropped by (\d+)% over last 30 days", t)
    if d:
        out["impressions_drop_30d_pct"] = float(d.group(1))
    return out


def parse_business_health(text: str) -> dict:
    """Growth → Business Health: the numbers Flipkart judges a seller on."""
    t = _flat(text)
    m7 = _need(r"Impressions ([\d.,K]+) ([\d.,K]+) From previous 7 days Conversion Rate ([\d.]+)% ([\d.]+)% From previous 7 days "
               r"Gross Units & Sales (\d+) \(₹([\d.,K]+)\) (\d+) Units", t, "the 7-day performance block")
    rc = _need(r"Buyer Returns ([\d.]+)% Pre Dispatch Cancellations ([\d.]+)% Logistics Returns \(RTO\) ([\d.]+)%", t, "returns & cancellations")
    sq = _need(r"Seller Cancellations ([\d.]+)% DBD Breach ([\d.]+)%", t, "service quality")
    out = {
        "impressions_7d": _num(m7.group(1)), "impressions_prev_7d": _num(m7.group(2)),
        "conversion_7d_pct": float(m7.group(3)), "conversion_prev_7d_pct": float(m7.group(4)),
        "units_7d": _num(m7.group(5)), "sales_7d": _num(m7.group(6)), "units_prev_7d": _num(m7.group(7)),
        "buyer_returns_pct": float(rc.group(1)), "pre_dispatch_cancel_pct": float(rc.group(2)), "rto_pct": float(rc.group(3)),
        "seller_cancel_pct": float(sq.group(1)), "dbd_breach_pct": float(sq.group(2)),
    }
    q = re.search(r"Listings scored Average or Bad (\d+)/(\d+)", t)
    if q:
        out.update(low_quality_listings=float(q.group(1)), listings_scored=float(q.group(2)))
    fa = re.search(r"Flipkart Assured Units ([\d.]+)%", t)
    if fa:
        out["f_assured_units_pct"] = float(fa.group(1))
    for key, label in (("out_of_stock_listings", "Out of Stock Listings"), ("low_stock_listings", "Low in Stock Listings")):
        s = re.search(label + r" (\d+)/(\d+)", t)
        if s:
            out[key] = float(s.group(1))
    fb = re.search(r"FBF Units Share \d+ \(([\d.]+)%\) Regional Utilization ([\d.]+)%", t)
    if fb:
        out.update(fbf_units_share_pct=float(fb.group(1)), regional_utilization_pct=float(fb.group(2)))
    pr = re.search(r"Buy Now Share ([\d.]+)% Competitive on Flipkart ([\d.]+)% Competitive on E-commerce ([\d.]+)%", t)
    if pr:
        out.update(buy_now_share_pct=float(pr.group(1)), competitive_flipkart_pct=float(pr.group(2)), competitive_ecom_pct=float(pr.group(3)))
    return out


def parse_traffic(text: str) -> tuple[dict, list[dict]]:
    """Growth → Traffic Report: 30-day impressions/conversion vs the previous 30, and the listings losing the most."""
    t = _flat(text)
    m = _need(r"Impressions ([\d.,K]+) ([\d.,K]+) From previous 30 days Conversion Rate ([\d.]+)% ([\d.]+) From previous 30 days "
              r"Gross Units & Sales (\d+) \(₹([\d.,K]+)\) (\d+) Units", t, "the 30-day traffic block")
    out = {
        "impressions_30d": _num(m.group(1)), "impressions_prev_30d": _num(m.group(2)),
        "conversion_30d_pct": float(m.group(3)), "conversion_prev_30d_pct": float(m.group(4)),
        "units_30d": _num(m.group(5)), "sales_30d": _num(m.group(6)), "units_prev_30d": _num(m.group(7)),
    }
    src = re.search(r"Search Results \(([\d.,K]+)\)", t)
    if src:
        out["impressions_from_search"] = _num(src.group(1))
    # "Impressions dropped by 67%" only appears when there is a drop
    d = re.search(r"Impressions (dropped|grew|increased) by (\d+)%", t)
    if d:
        out["impressions_change_pct"] = -float(d.group(2)) if d.group(1) == "dropped" else float(d.group(2))

    drops: list[dict] = []
    lines = _lines(text)
    try:
        start = lines.index("Recommended Action") + 1
    except ValueError:
        return out, drops
    i = start
    # rows are: name, SKU, impressions lost, units lost
    while i + 3 < len(lines):
        name, sku, imp, units = lines[i:i + 4]
        if not re.fullmatch(r"[A-Za-z0-9_\-]{4,}", sku) or _num(imp) is None or _num(units) is None:
            break
        drops.append({"name": name, "sku": sku, "impressions_drop": _num(imp), "units_lost": _num(units)})
        i += 4
    return out, drops


_CAMPAIGN = re.compile(
    r"(?P<name>.+?) (?P<status>Live|Paused|Draft|Ended|Scheduled) (?P<kind>PLA|PCA|PLA\+|Display) (?P<cid>[A-Z0-9]{8,14}) "
    r"(?P<dates>\d{1,2} \w{3} '\d{2} - .+?) (?P<budget>[\d,]+\.\d\d) (?P<btype>Daily|Total) ₹(?P<spend>[\d,]+\.\d\d) < ₹(?P<remaining>[\d,]+\.\d\d)"
    r"(?: For Today)? (?P<views>[\d,]+) (?P<clicks>[\d,]+) (?P<units>[\d,]+) ₹(?P<revenue>[\d,]+\.\d\d) (?P<roi>[\d.]+) (?P<ctr>[\d.]+)% (?P<cvr>[\d.]+)%")


def parse_ads(text: str) -> tuple[dict, list[dict]]:
    """Ads → Campaign Manager: the totals for the range shown, the wallet, and every campaign."""
    t = _flat(text)
    rng = _need(r"Showing data from (.+?) to (.+?) All Campaigns", t, "the ads date range")
    s = _need(r"Ad Spends ₹([\d.,K]+) [-+]?[\d.]+% Previous 7 Days : ₹([\d.,K]+) ROI ([\d.]+) [-+]?[\d.]+% Previous 7 Days : ([\d.]+) "
              r"Views ([\d.,K]+) [-+]?[\d.]+% Previous 7 Days : ([\d.,K]+) Clicks ([\d.,K]+) [-+]?[\d.]+% Previous 7 Days : ([\d.,K]+) "
              r"CTR ([\d.]+)% [-+]?[\d.]+% Previous 7 Days : ([\d.]+)% Total Units Sold ([\d.,K]+) [-+]?[\d.]+% Previous 7 Days : ([\d.,K]+) "
              r"CVR ([\d.]+)% [-+]?[\d.]+% Previous 7 Days : ([\d.]+)% Revenue ₹([\d.,K]+)", t, "the ads summary block")
    out = {
        "range_label": f"{rng.group(1)} to {rng.group(2)}",
        "spend": _num(s.group(1)), "spend_prev": _num(s.group(2)), "roi": float(s.group(3)), "roi_prev": float(s.group(4)),
        "views": _num(s.group(5)), "clicks": _num(s.group(7)), "ctr_pct": float(s.group(9)), "units": _num(s.group(11)),
        "cvr_pct": float(s.group(13)), "revenue": _num(s.group(15)),
    }
    w = re.search(r"Available wallet balance: ₹([\d,]+\.?\d*)", t)
    if w:
        out["wallet_balance"] = _num(w.group(1))
    body = t.split("CVR Actions ", 1)[1] if "CVR Actions " in t else t
    campaigns = []
    for m in _CAMPAIGN.finditer(body):
        d = m.groupdict()
        campaigns.append({
            "name": d["name"].strip(), "status": d["status"], "kind": d["kind"], "campaign_id": d["cid"], "dates": d["dates"],
            "budget": _num(d["budget"]), "budget_type": d["btype"], "spend": _num(d["spend"]), "views": _num(d["views"]),
            "clicks": _num(d["clicks"]), "units": _num(d["units"]), "revenue": _num(d["revenue"]),
            "roi": float(d["roi"]), "ctr_pct": float(d["ctr"]), "cvr_pct": float(d["cvr"]),
        })
    # Flipkart renders the table lazily as you scroll, so a read can legitimately hold fewer rows than the page
    # announces. The summary totals above are complete either way; record both counts so a partial list is visible.
    n = re.search(r"Showing (\d+) Campaigns", t)
    if n:
        out["campaigns_total"] = float(n.group(1))
    out["campaigns_read"] = float(len(campaigns))
    if n and not campaigns:
        raise LayoutChanged(f"the page lists {n.group(1)} campaigns but none could be read")
    return out, campaigns


def parse_listing_states(text: str) -> dict:
    t = _flat(text)
    m = _need(r"Active (\d+) Ready for Activation (\d+) Blocked (\d+) Inactive (\d+) Archived (\d+)", t, "the listing-state counts")
    return dict(zip(("active", "ready_for_activation", "blocked", "inactive", "archived"), (float(x) for x in m.groups())))


def parse_listing_rows(text: str) -> list[dict]:
    """The per-listing table: price, what the customer actually pays, stock, returns, and Flipkart's own quality label."""
    lines = _lines(text)
    rows: list[dict] = []
    for i, ln in enumerate(lines):
        if ln != "Listing:" or i < 3:
            continue
        cat, title, sku = lines[i - 3], lines[i - 2], lines[i - 1]
        rest = lines[i + 1:i + 12]
        money = [_num(x) for x in rest if re.fullmatch(r"₹\s?[\d,]+", x)]
        units = next((re.match(r"([\d,]+) units", x) for x in rest if re.match(r"[\d,]+ units", x)), None)
        doh = next((x for x in rest if x.startswith("DoH")), None)
        pcts = [x for x in rest if re.fullmatch(r"[+-]?[\d.]+%", x)]
        quality = next((x for x in rest if x in ("Good", "Average", "Bad", "Excellent", "Poor")), None)
        rating = next((x for x in rest if re.fullmatch(r"\d(\.\d+)?", x)), None)
        rows.append({
            "sku": sku, "title": title, "category": cat,
            "mrp": money[0] if len(money) > 0 else None, "price": money[1] if len(money) > 1 else None,
            "final_price": money[3] if len(money) > 3 else None,   # after seller/bank offers — what the customer really pays
            "stock": _num(units.group(1)) if units else None, "days_on_hand": doh,
            "return_rate_pct": float(pcts[0].rstrip("%")) if pcts else None,
            "quality": quality, "rating": float(rating) if rating else None,
        })
    return rows


def merge_listing_pages(page_texts: list[str]) -> list[dict]:
    """Rows from several pages of the Listings table, each SKU once (first sighting wins).

    Seller Hub shows 20 listings a page; a page that repeats rows (or a lazy table that re-renders them) must not
    double-count, and an empty page simply adds nothing.
    """
    seen: dict[str, dict] = {}
    for text in page_texts:
        for row in parse_listing_rows(text):
            seen.setdefault(row["sku"], row)
    return list(seen.values())


def parse_orders(text: str) -> dict:
    t = _flat(text)
    m = _need(r"(\d+) To Accept (\d+) To Pack (\d+) To Dispatch (\d+) In Transit (\d+) Pending Service ([\d,]+) Completed Orders (\d+) Upcoming Orders",
              t, "the order pipeline")
    return dict(zip(("to_accept", "to_pack", "to_dispatch", "in_transit", "pending_service", "completed", "upcoming"), (_num(x) for x in m.groups())))


def parse_pending_order_groups(text: str) -> list[dict]:
    """The 'To Accept' queue (same page `parse_orders` reads), broken down by SKU: which product(s), how many
    orders, and at what price. This is Flipkart's own packing queue, grouped by identical SKU combination - it has
    no order ID, buyer or date, so it is a live snapshot of what needs packing today, not an order history. Reuses
    the page text `orders()` already fetched; visits nothing extra.

    Groups are delimited by a literal '...' line in Seller Hub's own layout; within a group, each SKU appears as a
    (quantity, title, "SKU ID: x | FSN: y") triplet, one to a group with a single SKU, several for a combo order.
    """
    lines = _lines(text)
    try:
        start = next(i for i, ln in enumerate(lines) if re.fullmatch(r"\d+\s+Orders?", ln))
    except StopIteration:
        return []  # nothing pending right now - an empty queue, not a layout break
    groups: list[dict] = []
    block: list[str] = []
    for ln in lines[start:]:
        if ln == "...":
            g = _parse_one_pending_group(block)
            if g:
                groups.append(g)
            block = []
        else:
            block.append(ln)
    return groups


def _parse_one_pending_group(block: list[str]) -> dict | None:
    if not block:
        return None
    m = re.fullmatch(r"(\d+)\s+Orders?", block[0])
    if not m:
        return None
    items = []
    i = 1
    while i + 2 < len(block) and re.fullmatch(r"\d+", block[i]):
        sku_m = re.match(r"SKU ID:\s*(\S+)\s*\|\s*FSN:\s*(\S+)", block[i + 2])
        if not sku_m:
            break
        items.append({"qty": int(block[i]), "title": block[i + 1], "sku": sku_m.group(1), "fsn": sku_m.group(2)})
        i += 3
    if not items:
        return None
    price_low = price_high = None
    if "Sold at" in block:
        pi = block.index("Sold at")
        if pi + 1 < len(block):
            pm = re.match(r"₹([\d,]+)(?:\s*[–-]\s*₹([\d,]+))?", block[pi + 1])
            if pm:
                price_low = _num(pm.group(1))
                price_high = _num(pm.group(2)) if pm.group(2) else price_low
    return {"orders": int(m.group(1)), "items": items, "price_low": price_low, "price_high": price_high}


def parse_returns(text: str) -> dict:
    """Self-ship returns queue: how many are in progress / completed. Row-level detail (per-return SKU, reason) is
    not built yet - every real read so far has shown zero returns, so there is no captured example to build the row
    parser from; add one once a return exists (see hub-debug/ for how earlier parsers were built from real pages)."""
    t = _flat(text)
    m = _need(r"Return Request (\d+) In Progress (\d+) Completed", t, "the returns summary")
    return {"in_progress": _num(m.group(1)), "completed": _num(m.group(2))}


def parse_inventory(text: str) -> dict:
    t = _flat(text)
    m = _need(r"All Inventory ([\d,]+)\s?SKUs Low Stock (\d+)\s?SKUs Out of Stock (\d+)\s?SKUs", t, "the inventory summary")
    out = {"skus": _num(m.group(1)), "low_stock_skus": _num(m.group(2)), "out_of_stock_skus": _num(m.group(3))}
    u = re.search(r"([\d,]+) units", t)
    if u:
        out["units_in_stock"] = _num(u.group(1))
    return out


def parse_payments(text: str) -> dict:
    """Payments overview. The important part is what is NOT paid: payouts that came to ₹0 because net payable was negative."""
    t = _flat(text)
    out: dict = {}
    for i, m in enumerate(re.finditer(r"Payment Estimate for (\w+ \d+) ₹(-?[\d,]+) Prepaid ₹(-?[\d,]+) Postpaid ₹(-?[\d,]+)", t)):
        out[f"estimate_{i}_total"] = _num(m.group(2))
        out[f"estimate_{i}_postpaid"] = _num(m.group(4))
        out[f"estimate_{i}_label"] = m.group(1)
    o = re.search(r"Total Outstanding Amount ₹(-?[\d,]+)", t)
    if o:
        out["outstanding_amount"] = _num(o.group(1))
    prev = re.findall(r"(\d+)(?:st|nd|rd|th) \w{3} \(₹(-?[\d,]+)\)", t)
    if prev:
        out["previous_payouts_listed"] = float(len(prev))
        out["previous_payouts_zero"] = float(sum(1 for _, amt in prev if _num(amt) == 0))
    out["net_payable_negative"] = 1.0 if "Net payable value was negative" in t else 0.0
    if not out.get("net_payable_negative") and "outstanding_amount" not in out and "estimate_0_total" not in out:
        raise LayoutChanged("could not find any payment figures")
    return out


# --------------------------------------------------------------------------- storage
HUB_SCHEMA = """
CREATE TABLE IF NOT EXISTS hub_metrics(
  id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, area TEXT NOT NULL, key TEXT NOT NULL,
  value REAL, text TEXT);
CREATE INDEX IF NOT EXISTS hub_metrics_lookup ON hub_metrics(area, key, captured_at);
CREATE TABLE IF NOT EXISTS hub_ads_campaigns(
  id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, range_label TEXT, campaign_id TEXT, name TEXT, status TEXT,
  kind TEXT, budget REAL, budget_type TEXT, spend REAL, views REAL, clicks REAL, units REAL, revenue REAL, roi REAL, ctr_pct REAL, cvr_pct REAL);
CREATE TABLE IF NOT EXISTS hub_traffic_drops(
  id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, sku TEXT, name TEXT, impressions_drop REAL, units_lost REAL);
CREATE TABLE IF NOT EXISTS hub_pending_order_groups(
  -- The "To Accept" packing queue, one row per SKU (a combo order's several SKUs share captured_at+orders+price).
  -- No order ID, buyer or date is shown here - it is what needs packing right now, not an order history.
  id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, sku TEXT, fsn TEXT, title TEXT, qty INTEGER,
  orders INTEGER, price_low REAL, price_high REAL);
CREATE TABLE IF NOT EXISTS hub_listing_rows(
  id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, sku TEXT, title TEXT, category TEXT, mrp REAL, price REAL,
  final_price REAL, stock REAL, days_on_hand TEXT, return_rate_pct REAL, quality TEXT, rating REAL);
"""


def init_hub_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(HUB_SCHEMA)


def store_metrics(conn: sqlite3.Connection, area: str, metrics: dict, captured_at: str) -> None:
    for key, value in metrics.items():
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            conn.execute("INSERT INTO hub_metrics(captured_at, area, key, value) VALUES (?,?,?,?)", (captured_at, area, key, float(value)))
        elif value is not None:
            conn.execute("INSERT INTO hub_metrics(captured_at, area, key, text) VALUES (?,?,?,?)", (captured_at, area, key, str(value)))


def latest_metric(conn: sqlite3.Connection, area: str, key: str) -> float | None:
    row = conn.execute("SELECT value FROM hub_metrics WHERE area=? AND key=? AND value IS NOT NULL ORDER BY captured_at DESC, id DESC LIMIT 1", (area, key)).fetchone()
    return None if row is None else row[0]


# --------------------------------------------------------------------------- live reader
def _is_landing(page) -> bool:
    url = (page.url or "").lower()
    if "referral_url" in url or "/login" in url:
        return True
    try:
        body = page.inner_text("body")[:4000].lower()
    except Exception:  # noqa: BLE001
        return False
    return "start selling" in body and "become an online seller" in body


def _scroll_everything(page, rounds: int = 6) -> None:
    """Scroll the window AND every inner scrollable box to the bottom, stepwise.

    Seller Hub tables live in their own scroll containers and render rows lazily, so scrolling only the window
    (what the first version did) left the 7th ad campaign and rows 21+ of the listings unrendered.
    """
    for _ in range(rounds):
        try:
            page.evaluate("""() => {
                window.scrollBy(0, 4000);
                for (const el of document.querySelectorAll('*')) {
                    if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollBy(0, 4000);
                }
            }""")
            page.mouse.wheel(0, 4000)
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(500)


_NEXT_PAGE_SELECTORS = (
    "[aria-label*='next' i]:not([disabled]):not([aria-disabled='true'])",
    "button:has-text('Next'):not([disabled])",
    "[class*='next' i]:not([disabled]):not([aria-disabled='true'])",
    "button:text-is('>'):not([disabled])",
    "button:text-is('›'):not([disabled])",
    "li:text-is('>'), li:text-is('›')",
)


def _click_next_page(page) -> bool:
    """Click the Listings table's "next page" control. False when there is none (or it is disabled)."""
    for sel in _NEXT_PAGE_SELECTORS:
        try:
            loc = page.locator(sel)
            for i in range(min(loc.count(), 6)):
                el = loc.nth(i)
                if el.is_visible() and el.is_enabled():
                    el.scroll_into_view_if_needed(timeout=3_000)
                    el.click(timeout=5_000)
                    return True
        except Exception:  # noqa: BLE001 — try the next selector
            continue
    return False


def _read_listing_pages(page) -> tuple[list[dict], int | None]:
    """Every listing row Seller Hub will show: first raise the page size, then walk the pages. Returns (rows, total announced).

    Best effort by design: if a control can't be driven the caller still gets what was read, the shortfall is recorded
    (rows_read < rows_total) and the page's real markup is saved to hub-debug/ so the selector can be fixed from evidence.
    """
    m = re.search(r"All \((\d+)\)", page.inner_text("body"))
    total = int(m.group(1)) if m else None
    _scroll_everything(page)
    texts = [page.inner_text("body")]
    if total is not None and len(merge_listing_pages(texts)) < total:
        try:  # 1) a bigger page size, if the dropdown can be driven
            page.locator("button", has_text="Items / page").first.click(timeout=8_000)
            page.wait_for_timeout(900)
            for size in ("100", "50", "40", "30"):
                option = page.locator("li, [role=option], [role=menuitem]").filter(has_text=re.compile(rf"^{size}$"))
                if option.count():
                    option.first.click(timeout=5_000)
                    page.wait_for_timeout(6_000)
                    _scroll_everything(page)
                    texts.append(page.inner_text("body"))
                    break
        except Exception:  # noqa: BLE001
            pass
    # 2) walk the pages until nothing new appears
    for _ in range(8):
        if total is not None and len(merge_listing_pages(texts)) >= total:
            break
        before = len(merge_listing_pages(texts))
        if not _click_next_page(page):
            break
        page.wait_for_timeout(4_000)
        _scroll_everything(page, rounds=3)
        texts.append(page.inner_text("body"))
        if len(merge_listing_pages(texts)) == before:
            break
    rows = merge_listing_pages(texts)
    if total is not None and len(rows) < total:
        _save_debug(page, "listings-pagination")
    return rows, total


def _save_debug(page, name: str) -> None:
    """When a control can't be driven, keep what the page looked like so the selector can be fixed from real markup
    (a screenshot, the paging area's HTML, and a list of every clickable thing with its label/class) instead of
    guessing again. Never raises."""
    try:
        out = Path(__file__).resolve().parents[1] / "hub-debug"
        out.mkdir(exist_ok=True)
        page.screenshot(path=str(out / f"{name}.png"), full_page=True)
        html = page.evaluate(r"""() => {
            const b = [...document.querySelectorAll('button')].find(x => /Items \/ page/.test(x.textContent));
            const root = b ? (b.closest('div[class*=agination]') || b.parentElement.parentElement) : document.body;
            return root.outerHTML.replace(/\s+/g, ' ').slice(0, 6000);
        }""")
        (out / f"{name}.html.txt").write_text(html, encoding="utf-8")
        clickables = page.evaluate(r"""() => [...document.querySelectorAll('button,[role=button],[role=option],li,a')]
            .map(e => ({t: (e.textContent || '').trim().slice(0, 30), a: e.getAttribute('aria-label'), c: (e.className && e.className.toString ? e.className.toString() : '').slice(0, 60), d: !!e.disabled}))
            .filter(x => x.t.length <= 12 || x.a).slice(-80)""")
        import json
        (out / f"{name}.clickables.json").write_text(json.dumps(clickables, indent=1), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _save_text(name: str, text: str) -> None:
    """Keep the visible text of a page that would not parse (hub-debug/). Never raises."""
    try:
        out = Path(__file__).resolve().parents[1] / "hub-debug"
        out.mkdir(exist_ok=True)
        (out / f"{name}.txt").write_text(text, encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _visit(page, url: str, wait_for: str, settle_ms: int = 6000) -> str:
    """Load a Seller Hub view and return its visible text once ``wait_for`` has rendered."""
    page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(2500)
    if _is_landing(page):
        raise SessionExpired("Seller Hub is asking to log in — run `python scripts/sellerhub_login.py` again.")
    try:
        page.wait_for_selector(f"text={wait_for}", timeout=75_000)
    except Exception as exc:  # noqa: BLE001
        if _is_landing(page):
            raise SessionExpired("Seller Hub is asking to log in — run `python scripts/sellerhub_login.py` again.") from exc
        raise LayoutChanged(f"expected text {wait_for!r} never appeared at {url.split('#')[-1]}") from exc
    page.wait_for_timeout(settle_ms)
    return page.inner_text("body")


def _read_areas(ctx, conn: sqlite3.Connection, now: str, pause_ms: int, results: dict) -> None:
    page = ctx.pages[0] if ctx.pages else ctx.new_page()

    def step(area: str, fn) -> None:
        # One retry: these pages are single-page-app tabs that occasionally have not finished drawing when read
        # (the 30-day traffic block was "not found" once on a page that read fine minutes later).
        for attempt in (1, 2):
            try:
                fn()
                conn.commit()
                results[area] = "ok"
                break
            except SessionExpired:
                raise
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                results[area] = f"failed: {str(exc).splitlines()[0][:160]}"
                if attempt == 1:
                    page.wait_for_timeout(6_000)
        page.wait_for_timeout(pause_ms)

    def home():
        store_metrics(conn, "home", parse_home(_visit(page, URL_HOME, "Today’s Sales")), now)

    def listings():
        _visit(page, URL_LISTINGS, "Product Details")
        first_page_text = page.inner_text("body")
        state_counts = parse_listing_states(first_page_text)
        rows, announced = _read_listing_pages(page)
        store_metrics(conn, "listing_states", state_counts, now)
        store_metrics(conn, "listing_states", {"rows_read": float(len(rows)), **({"rows_total": float(announced)} if announced else {})}, now)
        for r in rows:
            conn.execute("INSERT INTO hub_listing_rows(captured_at, sku, title, category, mrp, price, final_price, stock, days_on_hand, return_rate_pct, quality, rating) "
                         "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (now, r["sku"], r["title"], r["category"], r["mrp"], r["price"], r["final_price"], r["stock"], r["days_on_hand"], r["return_rate_pct"], r["quality"], r["rating"]))

    def inventory():
        store_metrics(conn, "inventory", parse_inventory(_visit(page, URL_INVENTORY, "All Inventory")), now)

    def orders():
        text = _visit(page, URL_ORDERS, "To Accept")
        store_metrics(conn, "orders", parse_orders(text), now)
        # same page, no extra visit: which SKUs are behind today's "To Accept" count, and at what price
        for g in parse_pending_order_groups(text):
            for item in g["items"]:
                conn.execute(
                    "INSERT INTO hub_pending_order_groups(captured_at, sku, fsn, title, qty, orders, price_low, price_high) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (now, item["sku"], item["fsn"], item["title"], item["qty"], g["orders"], g["price_low"], g["price_high"]))

    def payments():
        store_metrics(conn, "payments", parse_payments(_visit(page, URL_PAYMENTS, "Upcoming Payments")), now)

    def returns():
        store_metrics(conn, "returns", parse_returns(_visit(page, URL_RETURNS, "Return Request")), now)

    def growth_tab(tab: str, wait_for: str):
        _visit(page, URL_GROWTH, "Business Health", settle_ms=3000)
        page.get_by_text(tab, exact=True).first.click(timeout=15_000)
        page.wait_for_selector(f"text={wait_for}", timeout=45_000)
        page.wait_for_timeout(6000)
        return page.inner_text("body")

    def business_health():
        store_metrics(conn, "business_health", parse_business_health(growth_tab("Business Health", "Returns & Cancellations")), now)

    def traffic():
        # "Sources of Impressions" only renders once the 30-day period is selected (confirmed live 2026-09-27) - it
        # is absent from the tab's initial default view, so waiting on it here timed out every time and the
        # 30-day-switch fallback below was never reached. "Recommended Action" (a column header) is present
        # immediately regardless of period.
        text = growth_tab("Traffic Report", "Recommended Action")
        if "From previous 30 days" not in text:
            # Seller Hub remembers the last period you looked at (it came up as "Last 7 days" once); the figures we store
            # are 30-day ones, so ask for that period explicitly instead of assuming it.
            page.get_by_text("Last 30 Days", exact=True).first.click(timeout=15_000)
            page.wait_for_selector("text=From previous 30 days", timeout=45_000)
            page.wait_for_timeout(5_000)
            text = page.inner_text("body")
        try:
            metrics, drops = parse_traffic(text)
        except LayoutChanged:
            _save_text("traffic-page", text)   # keep the page as it was read, so the parser can be fixed from evidence
            raise
        store_metrics(conn, "traffic", metrics, now)
        for d in drops:
            conn.execute("INSERT INTO hub_traffic_drops(captured_at, sku, name, impressions_drop, units_lost) VALUES (?,?,?,?,?)",
                         (now, d["sku"], d["name"], d["impressions_drop"], d["units_lost"]))

    def ads():
        text = _visit(page, URL_ADS, "Campaign Manager", settle_ms=9000)
        # the campaign table loads rows as it scrolls into view — scroll it fully before reading
        _scroll_everything(page, rounds=8)
        text = page.inner_text("body")
        metrics, campaigns = parse_ads(text)
        if metrics.get("campaigns_total") and metrics.get("campaigns_read", 0) < metrics["campaigns_total"]:
            _save_debug(page, "ads-campaigns")
        store_metrics(conn, "ads", metrics, now)
        for c in campaigns:
            conn.execute("INSERT INTO hub_ads_campaigns(captured_at, range_label, campaign_id, name, status, kind, budget, budget_type, spend, views, clicks, units, revenue, roi, ctr_pct, cvr_pct) "
                         "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (now, metrics["range_label"], c["campaign_id"], c["name"], c["status"], c["kind"], c["budget"], c["budget_type"], c["spend"], c["views"], c["clicks"], c["units"], c["revenue"], c["roi"], c["ctr_pct"], c["cvr_pct"]))

    for area, fn in (("home", home), ("business_health", business_health), ("traffic", traffic), ("ads", ads),
                     ("listings", listings), ("inventory", inventory), ("orders", orders), ("payments", payments),
                     ("returns", returns)):
        step(area, fn)


def refresh_listings_from_hub(db_path: str) -> int:
    """Update the Listings table from the newest Seller Hub read (price, MRP, stock, rating). Returns listings updated.

    The Listings page used to show only what the Flipkart API last synced (19 Sep) even though Seller Hub was being read
    every few hours. Matched by SKU; listings Seller Hub does not show are left alone. When the API is connected its sync
    simply overwrites these values with its own.
    """
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        init_hub_tables(conn)
        latest = conn.execute("SELECT MAX(captured_at) FROM hub_listing_rows").fetchone()[0]
        if not latest:
            return 0
        now = datetime.now().isoformat(timespec="seconds")
        changed = 0
        for sku, mrp, price, stock, rating in conn.execute(
                "SELECT sku, mrp, price, stock, rating FROM hub_listing_rows WHERE captured_at = ?", (latest,)).fetchall():
            cur = conn.execute(
                "UPDATE listings SET mrp = COALESCE(?, mrp), price = COALESCE(?, price), stock = COALESCE(?, stock), "
                "rating_avg = COALESCE(?, rating_avg), updated_at = ? WHERE sku = ?",
                (mrp, price, None if stock is None else int(stock), rating, now, sku))
            changed += cur.rowcount
        conn.commit()
        return changed
    finally:
        conn.close()


def read_in_open_browser(ctx, db_path: str, pause_ms: int = 3500) -> dict[str, str]:
    """Read every area inside an ALREADY signed-in browser context (does not launch or close it).

    Flipkart ends a Seller Hub login quickly and did so across separate browser launches, so the reliable pattern is
    sign in and read in the same window, immediately (see scripts/sellerhub_login_and_read.py).
    """
    results: dict[str, str] = {}
    conn = sqlite3.connect(db_path)
    init_hub_tables(conn)
    try:
        _read_areas(ctx, conn, datetime.now().isoformat(timespec="seconds"), pause_ms, results)
    finally:
        conn.close()
    return results


def read_all(profile_dir: str | Path, db_path: str, headless: bool = True, pause_ms: int = 3500) -> dict[str, str]:
    """Launch the saved profile, read every area once, store it. Returns {area: 'ok' | 'failed: why'}.

    One broken page must not cost the others, but a lost session stops everything (it would fail on every page).
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(profile_dir), headless=headless, viewport={"width": 1500, "height": 1000})
        try:
            return read_in_open_browser(ctx, db_path, pause_ms)
        finally:
            ctx.close()
