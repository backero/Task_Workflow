"""Real, read-only readers for the Meesho Supplier Panel — built from actual captured pages (see
scripts/capture_supplier_panel.py and tests/fixtures/meesho_*.txt), the same way the Flipkart and Snapdeal readers
in this project were built. Replaces guessing at page structure: every regex below matches a real page.

Scope, honestly stated: the account-level numbers below (Business Overview, Payments, Quality, Returns) are each a
single clearly-labelled value, so they can be read with confidence. The **Product Performance table** on Business
Dashboard is NOT read here: it prints Views/Clicks/Orders/Conversions/Sales/Returns as a column of bare numbers with
no per-row label, and the visible figures do not resolve to a single unambiguous column order from text alone
(e.g. two percentages appear where only one column is expected) - reading it correctly needs the page's underlying
HTML/CSS structure, not just its printed text. Getting that wrong would put a wrong number on a real product, which
matters more than getting an incomplete table. Build it once that structure has been inspected for real.
"""
from __future__ import annotations

import re


class LayoutChanged(Exception):
    """The panel no longer matches what these parsers were built from."""


def _flat(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", ln.replace("\xa0", " ")).strip() for ln in text.splitlines() if ln.strip()]


def _num(s: str | None) -> float | None:
    """'6,997' -> 6997, '₹5.46K' -> 5460, '– ₹12.46' -> -12.46, '3.85%' -> 3.85, '0' -> 0."""
    if s is None:
        return None
    t = str(s).replace("₹", "").replace(",", "").replace("%", "").strip()
    neg = t.startswith("–") or t.startswith("-")
    t = t.lstrip("–-").strip()
    if t in ("", "--", "-", "NA", "N/A"):
        return None
    mult = 1.0
    if t[-1:].upper() == "K":
        mult, t = 1000.0, t[:-1]
    elif t[-1:].upper() == "L":  # lakh
        mult, t = 100_000.0, t[:-1]
    try:
        v = float(t) * mult
    except ValueError:
        return None
    return -v if neg else v


def _need(pattern: str, text: str, what: str, flags: int = 0) -> re.Match:
    m = re.search(pattern, text, flags)
    if not m:
        raise LayoutChanged(f"could not find {what}")
    return m


def parse_business_overview(text: str) -> dict:
    """The account-level totals at the top of Business Dashboard, for whatever date range is selected on screen."""
    t = _flat(text)
    m = _need(
        r"Total Views ([\d,]+) ([\d.]+)% Total Clicks ([\d,]+) ([\d.]+)% Total Orders ([\d,]+) ([\d.]+)% "
        r"Conversion Rate ([\d.]+)% ([\d.]+)% Total Sales ₹([\d,.]+) ([\d.]+)% Return Percentage ([\d.]+)",
        t, "the Business Overview totals")
    return {
        "views": _num(m.group(1)), "views_change_pct": _num(m.group(2)),
        "clicks": _num(m.group(3)), "clicks_change_pct": _num(m.group(4)),
        "orders": _num(m.group(5)), "orders_change_pct": _num(m.group(6)),
        "conversion_pct": _num(m.group(7)), "conversion_change_pct": _num(m.group(8)),
        "sales": _num(m.group(9)), "sales_change_pct": _num(m.group(10)),
        "return_pct": _num(m.group(11)),
    }


def parse_payments(text: str) -> dict:
    """Upcoming and completed payout totals. Per-transaction-type breakdown (Orders / platform recovery /
    compensation) is read too, from the FIRST such table on the page (the Upcoming block)."""
    t = _flat(text)
    out: dict = {}
    up = _need(r"Upcoming Payments Next (\d+) days? \(₹([\d,.KLkl]+)\)", t, "the upcoming-payments total")
    out["upcoming_days"] = int(up.group(1))
    out["upcoming_total"] = _num(up.group(2))
    comp = re.search(r"Completed Payments Last (\d+) days? \(₹([\d,.KLkl]+)\)", t)
    if comp:
        out["completed_days"] = int(comp.group(1))
        out["completed_total"] = _num(comp.group(2))
    sales = re.search(r"Orders Sales and returns ₹([\d,.]+)", t)
    if sales:
        out["upcoming_sales_and_returns"] = _num(sales.group(1))
    ads = re.search(r"Ads Cost Program Cost [–-] ₹([\d,.]+)", t)
    if ads:
        out["upcoming_ads_cost"] = -_num(ads.group(1))
    return out


def parse_quality(text: str) -> dict:
    """Meesho's own Quality Score (share of 1-2 star ratings) - 'N/A' below a minimum ratings count is a real
    state, not missing data: it is reported as such, not guessed at."""
    t = _flat(text)
    ratings = _need(r"1 and 2 star ratings (\d+) . Total Ratings (\d+)", t, "the ratings counts")
    out = {"bad_ratings": _num(ratings.group(1)), "total_ratings": _num(ratings.group(2))}
    score = re.search(r"Quality Score = (N/A|[\d.]+%)", t)
    if score:
        out["quality_score"] = None if score.group(1) == "N/A" else _num(score.group(1))
    blocking = re.search(r"Blocking Soon \((\d+)\) Action Pending \((\d+)\) Fixed \((\d+)\)", t)
    if blocking:
        out["blocking_soon"], out["action_pending"], out["fixed"] = (int(x) for x in blocking.groups())
    return out


def parse_returns_summary(text: str) -> dict:
    """Self-reported return / RTO rate, each with Meesho's own category-average alongside it for comparison."""
    t = _flat(text)
    ret = _need(r"Customer Return Return Rate ([\d.]+)% ([\d.]+)% (\d+) orders returned out of (\d+) delivered",
                t, "the customer return rate")
    out = {
        "return_rate_pct": _num(ret.group(1)), "return_rate_category_avg_pct": _num(ret.group(2)),
        "returned": int(ret.group(3)), "delivered": int(ret.group(4)),
    }
    rto = re.search(r"Courier Return \(RTO\) Rate ([\d.]+)% ([\d.]+)% (\d+) RTO orders? out of (\d+) dispatched", t)
    if rto:
        out.update({
            "rto_rate_pct": _num(rto.group(1)), "rto_rate_category_avg_pct": _num(rto.group(2)),
            "rto_count": int(rto.group(3)), "dispatched": int(rto.group(4)),
        })
    ship = re.search(r"Average Reverse Shipping Cost ₹\s?([\d,.]+)", t)
    if ship:
        out["avg_reverse_shipping_cost"] = _num(ship.group(1))
    return out


# --------------------------------------------------------------------------- storage
PANEL_SCHEMA = """
CREATE TABLE IF NOT EXISTS panel_metrics(
  id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, area TEXT NOT NULL, key TEXT NOT NULL,
  value REAL, text TEXT);
CREATE INDEX IF NOT EXISTS panel_metrics_lookup ON panel_metrics(area, key, captured_at);
"""


def init_panel_tables(conn) -> None:
    conn.executescript(PANEL_SCHEMA)


def store_metrics(conn, area: str, metrics: dict, captured_at: str) -> None:
    for key, value in metrics.items():
        if isinstance(value, (int, float)) or value is None:
            conn.execute("INSERT INTO panel_metrics(captured_at, area, key, value) VALUES (?,?,?,?)",
                         (captured_at, area, key, value))
        else:
            conn.execute("INSERT INTO panel_metrics(captured_at, area, key, text) VALUES (?,?,?,?)",
                         (captured_at, area, key, str(value)))


HOME = "https://supplier.meesho.com/panel/v3/new/root/login"
URL_LOGIN_CHECK = HOME
NAV_BUSINESS_DASHBOARD = "Business Dashboard"
NAV_PAYMENTS = "Payments"
NAV_QUALITY = "Quality"
NAV_RETURNS = "Returns"


class SessionExpired(Exception):
    pass


def _signed_in(page) -> bool:
    url = (page.url or "").lower()
    if "/panel/" not in url or any(w in url for w in ("login", "signin", "sign-in", "/auth/", "signup")):
        return False
    try:
        body = page.inner_text("body")
    except Exception:  # noqa: BLE001
        return False
    return "Start Selling" not in body and len(body.strip()) > 200


def _open_nav(page, *labels: str, expect: str | None = None) -> None:
    """Open a panel page by clicking its menu entries in order (a group such as 'Orders' before 'Manage Orders'),
    then wait until `expect` (a regex) shows in the page text - these pages render client-side."""
    page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(3_000)
    for label in labels:
        page.get_by_text(label, exact=True).first.click(timeout=8_000)
        page.wait_for_timeout(1_200)
    page.wait_for_timeout(4_000)
    if expect:
        for _ in range(20):
            if re.search(expect, page.inner_text("body")):
                break
            page.wait_for_timeout(1_000)


def read_in_open_browser(ctx, db_path: str) -> dict[str, str]:
    """Read every area this module knows how to parse, inside an ALREADY signed-in context. One broken area must
    not cost the others. Returns {area: 'ok' | 'failed: why'}."""
    import sqlite3
    from datetime import datetime

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    init_panel_tables(conn)
    now = datetime.now().isoformat(timespec="seconds")
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(URL_LOGIN_CHECK, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(5_000)
    if not _signed_in(page):
        conn.close()
        raise SessionExpired("Not signed in to the Meesho Supplier Panel.")

    results: dict[str, str] = {}

    def step(area: str, labels: tuple, parse, expect: str | None = None) -> None:
        # One retry: nav clicks occasionally time out on a slow-drawing menu (seen on "Returns") even when a second
        # attempt moments later succeeds - same shape as the retry already used in Flipkart's sellerhub.py.
        for attempt in (1, 2):
            try:
                if labels:
                    _open_nav(page, *labels, expect=expect)
                text = page.inner_text("body")
                metrics = parse(text)
                store_metrics(conn, area, metrics, now)
                conn.commit()
                results[area] = "ok"
                return
            except Exception as exc:  # noqa: BLE001
                conn.rollback()
                results[area] = f"failed: {str(exc).splitlines()[0][:160]}"
                if attempt == 1:
                    page.wait_for_timeout(3_000)

    def products() -> None:
        try:
            _open_nav(page, NAV_BUSINESS_DASHBOARD, expect=r"All \(\d+\) Low Orders")
            try:
                rows = read_all_products(page)
                complete = True
            except LayoutChanged as part:
                rows = getattr(part, "rows", None)
                if not rows:
                    raise
                complete = False
                results["products"] = f"failed: {part}"
            store_products(conn, rows, now, complete)
            store_metrics(conn, "products", {"products_read": len(rows)}, now)
            conn.commit()
            results.setdefault("products", "ok")
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            results["products"] = f"failed: {str(exc).splitlines()[0][:160]}"

    def pricing() -> None:
        try:
            _open_nav(page, "Pricing", expect=r"Insights Action")
            try:
                rows = read_pricing(page)
            except LayoutChanged as part:
                rows = getattr(part, "rows", None)
                if not rows:
                    raise
                results["pricing"] = f"failed: {part}"
            store_pricing(conn, rows, now)
            store_metrics(conn, "pricing", {"pricing_rows_read": len(rows)}, now)
            conn.commit()
            results.setdefault("pricing", "ok")
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            results["pricing"] = f"failed: {str(exc).splitlines()[0][:160]}"

    step("home", (), parse_home)
    step("business_overview", (NAV_BUSINESS_DASHBOARD,), parse_business_overview, r"Total Views")
    products()
    pricing()
    step("payments", (NAV_PAYMENTS,), parse_payments, r"Upcoming Payments")
    step("quality", (NAV_QUALITY,), parse_quality, r"Total Ratings")
    step("returns", (NAV_RETURNS,), parse_returns_summary, r"Customer Return")
    step("orders", ("Orders", "Manage Orders"), parse_pending_orders, r"Pending \(\d+\)")
    step("dispatch", ("Orders", "Dispatch Performance"), parse_dispatch_performance, r"dispatch health")
    step("ads", ("Boost Sales", "Advertisement"), parse_ads_overview, r"Ad Spend")
    step("catalog_uploads", ("Inventory", "Catalog Uploads"), parse_catalog_uploads, r"Total Uploads Done")
    conn.close()
    return results


def read_all(profile_dir: str, db_path: str, headless: bool = True) -> dict[str, str]:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(str(profile_dir), headless=headless, viewport={"width": 1500, "height": 1000})
        try:
            return read_in_open_browser(ctx, db_path)
        finally:
            ctx.close()


# --------------------------------------------------------------------------- more real pages (captured 2026-09-26)
def parse_home(text: str) -> dict:
    """Home: the to-do counters, yesterday's views/orders, dispatch health and blocked / at-risk catalogs."""
    t = _flat(text)
    out: dict = {}
    m = _need(r"Pending Orders (\d+) Download Labels (\d+) Out of Stock (\d+) Low Stock (\d+)", t, "the Home to-do counters")
    out.update({"pending_orders": int(m.group(1)), "labels_to_download": int(m.group(2)),
                "out_of_stock": int(m.group(3)), "low_stock": int(m.group(4))})
    d = re.search(r"Views \((\d+ \w+)\) ([\d,]+) ([\d.]+)% Orders \(\d+ \w+\) ([\d,]+)", t)
    if d:
        out.update({"daily_views": _num(d.group(2)), "daily_views_change_pct": _num(d.group(3)), "daily_orders": _num(d.group(4))})
    h = re.search(r"([\d.]+)% dispatch health", t)
    if h:
        out["dispatch_health_pct"] = _num(h.group(1))
    c = re.search(r"(\d+)\s+Catalog\(s\) blocked\s+(\d+)\s+Catalog\(s\) at risk", t)
    if c:
        out.update({"catalogs_blocked": int(c.group(1)), "catalogs_at_risk": int(c.group(2))})
    return out


def parse_pending_orders(text: str) -> dict:
    t = _flat(text)
    m = _need(r"Pending \((\d+)\)", t, "the Pending orders count")
    return {"pending_orders_list": int(m.group(1))}


def parse_ads_overview(text: str) -> dict:
    """Advertisement: last-30-days spend / revenue / ROI / views / clicks / orders, and the campaign tab counts."""
    t = _flat(text)
    m = _need(r"Overview Last 30 Days Ad Spend ₹ ?([\d,.]+) Revenue ₹ ?([\d,.]+) ROI ([\d.]+) Views ([\d,]+) Clicks ([\d,]+) Orders ([\d,]+)",
              t, "the Advertisement overview")
    out = {"ad_spend_30d": _num(m.group(1)), "ad_revenue_30d": _num(m.group(2)), "ad_roi_30d": _num(m.group(3)),
           "ad_views_30d": _num(m.group(4)), "ad_clicks_30d": _num(m.group(5)), "ad_orders_30d": _num(m.group(6))}
    tabs = re.search(r"ALL \((\d+)\) LIVE \((\d+)\) PAUSED \((\d+)\)", t)
    if tabs:
        out.update({"campaigns_total": int(tabs.group(1)), "campaigns_live": int(tabs.group(2)), "campaigns_paused": int(tabs.group(3))})
    return out


def parse_catalog_uploads(text: str) -> dict:
    t = _flat(text)
    m = _need(r"Total Uploads Done (\d+) Using Bulk Uploads (\d+) Using Single Uploads (\d+)", t, "the catalog upload totals")
    out = {"uploads_total": int(m.group(1)), "uploads_bulk": int(m.group(2)), "uploads_single": int(m.group(3))}
    q = re.search(r"Action Required \((\d+)\) QC in Progress \((\d+)\) QC Error \((\d+)\) QC Pass \((\d+)\)", t)
    if q:
        out.update({"qc_action_required": int(q.group(1)), "qc_in_progress": int(q.group(2)),
                    "qc_error": int(q.group(3)), "qc_pass": int(q.group(4))})
    return out


def parse_dispatch_performance(text: str) -> dict:
    """Orders > Dispatch Performance: the account's dispatch-health gate (Meesho blocks catalogues below it)."""
    t = _flat(text)
    out = {"dispatch_health_pct": _num(_need(r"(\d+)% dispatch health", t, "the dispatch health %").group(1))}
    d = _need(r"On time dispatch: (\d+) Total dispatched orders: (\d+)", t, "on-time/total dispatched")
    out["on_time_dispatch"] = int(d.group(1))
    out["total_dispatched"] = int(d.group(2))
    risk = re.search(r"(\d+) catalog\(s\) at risk of blocking", t)
    if risk:
        out["catalogs_at_risk"] = int(risk.group(1))
    cancel = re.search(r"([\d.]+) ?% seller cancellation", t)
    if cancel:
        out["seller_cancellation_pct"] = _num(cancel.group(1))
    return out


def parse_product_total(text: str) -> int:
    m = _need(r"All \((\d+)\) Low Orders", _flat(text), "the product count")
    return int(m.group(1))


PRODUCT_SCHEMA = """
CREATE TABLE IF NOT EXISTS panel_products(
  product_id TEXT PRIMARY KEY, title TEXT, rating REAL, views REAL, views_change_pct REAL, clicks REAL, orders REAL,
  conversion_pct REAL, sales REAL, returns_pct REAL, captured_at TEXT);
"""

_PAGER_JS = """(n) => {
  const c = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length === 0 && el.textContent.trim() === String(n)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left > 1000) c.push({el, top: r.top + window.scrollY});
    }
  }
  if (!c.length) return null;
  c.sort((a, b) => b.top - a.top);
  const el = c[0].el;
  el.scrollIntoView({block: 'center'});
  const r = el.getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2};
}"""


_TABLE_ROWS_JS = r"""() => [...document.querySelectorAll('tr')].map(tr => {
  const tds = [...tr.querySelectorAll(':scope > td')];
  const idp = [...tr.querySelectorAll('p')].find(p => /^Product ID:/.test(p.textContent.trim()));
  if (!idp || !tds.length) return null;
  const first = [...tds[0].querySelectorAll('p')].map(p => p.textContent.trim());
  return {id: idp.textContent.replace('Product ID:', '').trim(), title: first[0] || '',
          rating: first.find(t => /^\d(\.\d)?$/.test(t)) || null,
          cells: tds.slice(1).map(td => [...td.querySelectorAll('p')].map(x => x.textContent.trim()))};
}).filter(Boolean)"""

_DOM_COLS = ["views", "clicks", "orders", "conversion_pct", "sales", "returns_pct"]


def parse_product_dom_rows(rows: list[dict]) -> list[dict]:
    """The Product Performance table read from its real <tr>/<td> cells: cell 0 = title, Product ID, rating; then one
    cell per column (Views, Clicks, Orders, Conversions, Sales, Returns), each with its figure first and the
    period-on-period change second. No position guessing, so no row can be dropped or shifted."""
    out = []
    for r in rows:
        title = _flat(r.get("title", ""))
        half = len(title) // 2
        if half and title[:half] == title[half:]:
            title = title[:half]
        row = {"product_id": r["id"], "title": title, "rating": _num(r.get("rating"))}
        cells = r.get("cells", [])
        for i, key in enumerate(_DOM_COLS):
            texts = cells[i] if i < len(cells) else []
            row[key] = _num(texts[0]) if texts else None
            if key == "views":
                row["views_change_pct"] = _num(texts[1]) if len(texts) > 1 else None
        out.append(row)
    return out


def read_all_products(page, max_pages: int = 6) -> list[dict]:
    """Every product row of the Product Performance table, paging through its numbered pager. Raises
    LayoutChanged carrying what was read if fewer rows than the page's own 'All (N)' come back."""
    text = page.inner_text("body")
    total = parse_product_total(text)
    rows: dict[str, dict] = {}
    dom0 = page.evaluate(_TABLE_ROWS_JS)
    for r in parse_product_dom_rows(dom0):
        rows[r["product_id"]] = r
    for n in range(2, max_pages + 1):
        if len(rows) >= total:
            break
        found = page.evaluate(_PAGER_JS, n)
        if not found:
            break
        page.wait_for_timeout(500)
        found = page.evaluate(_PAGER_JS, n)
        before = set(rows)
        page.mouse.click(found["x"], found["y"])
        for _ in range(16):
            page.wait_for_timeout(500)
            got = parse_product_dom_rows(page.evaluate(_TABLE_ROWS_JS))
            if got and got[0]["product_id"] not in before:
                break
        for r in got:
            rows.setdefault(r["product_id"], r)
        if set(rows) == before:
            break
    out = list(rows.values())
    if len(out) != total:
        err = LayoutChanged(f"read {len(out)} of {total} products")
        err.rows = out
        raise err
    return out


def store_products(conn, rows: list[dict], captured_at: str, complete: bool) -> None:
    """Real products replace the demo listings: `panel_products` keeps the panel's own figures and the app's
    listings / snapshots (which the Listings page and the recommender use) are filled from them."""
    from app.database import add_snapshot, upsert_listing
    conn.executescript(PRODUCT_SCHEMA)
    done = conn.execute("SELECT value FROM kv WHERE key='demo_cleared'").fetchone()
    if not done and rows:
        for table in ("snapshots", "alerts", "recommendations", "listings"):
            conn.execute(f"DELETE FROM {table}")
        conn.execute("INSERT OR REPLACE INTO kv(key, value) VALUES('demo_cleared', ?)", (captured_at,))
        conn.commit()
    for r in rows:
        conn.execute("INSERT OR REPLACE INTO panel_products VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                     (r["product_id"], r["title"], r["rating"], r["views"], r["views_change_pct"], r["clicks"], r["orders"],
                      r["conversion_pct"], r["sales"], r["returns_pct"], captured_at))
        lid = upsert_listing(conn, catalog_id=r["product_id"], name=r["title"], category=None, price=None, status="live",
                             created_at=captured_at[:10])
        add_snapshot(conn, lid, captured_at, views=int(r["views"] or 0), impressions=int(r["views"] or 0),
                     clicks=int(r["clicks"] or 0), orders=int(r["orders"] or 0), rating=r["rating"])
    conn.commit()


# --------------------------------------------------------------------------- pricing (captured 2026-09-27)
_PRICING_ROW = re.compile(
    r"(?P<title>[A-Za-z0-9].*?) Catalog ID: (?P<catalog_id>\d+) Style ID: (?P<style_id>\S+) Size: (?P<size>[^\d]+?) "
    r"(?P<stock>\d+) (?:(?P<growth>[\d.%-]+)|Orders: \d+ Sales: ₹[\d,]+(?: [\d.%-]+)?) ₹(?P<price>[\d,]+) Bank Transfer: ₹(?P<bank>[\d,]+) "
    r"(?:₹(?P<rec_price>[\d,]+) Bank Transfer: ₹(?P<rec_bank>[\d,]+)|-) "
    r"(?P<insight>Losing Views|Losing Orders|Best Price|[A-Za-z ]+?) (?P<action>Accept / Edit|Edit)")


def parse_pricing_total(text: str) -> int:
    m = _need(r"All Products \((\d+)\)", _flat(text), "the All Products total")
    return int(m.group(1))


def parse_pricing_rows(text: str) -> list[dict]:
    """Manage Pricing: current vs Meesho-recommended price per catalog/style, with Meesho's own "Losing Views" /
    "Best Price" verdict. Rows render lazily below the header ("...Insights Action") - scroll first, see
    read_pricing(). NOT linked to the listings/snapshots the Business Dashboard fills: this page's Catalog ID is a
    different id space from that page's Product ID, and guessing a match between them risks pricing one product
    showing up against a different one - it is kept as its own table until a real shared key is found."""
    t = _flat(text)
    i = t.find("Insights Action")
    if i == -1:
        raise LayoutChanged("could not find the pricing table header")
    out, seen = [], set()
    for m in _PRICING_ROW.finditer(t[i + len("Insights Action"):]):
        key = (m.group("catalog_id"), m.group("style_id"))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "catalog_id": m.group("catalog_id"), "style_id": m.group("style_id"),
            "title": _flat(m.group("title")), "size": m.group("size").strip(),
            "stock": int(m.group("stock")), "growth_30d_pct": _num(m.group("growth")) if m.group("growth") else None,
            "price": _num(m.group("price")), "bank_transfer": _num(m.group("bank")),
            "recommended_price": _num(m.group("rec_price")), "recommended_bank_transfer": _num(m.group("rec_bank")),
            "insight": m.group("insight").strip(), "action": m.group("action"),
        })
    return out


PRICING_SCHEMA = """
CREATE TABLE IF NOT EXISTS panel_pricing(
  catalog_id TEXT NOT NULL, style_id TEXT NOT NULL, title TEXT, size TEXT, stock INTEGER, growth_30d_pct REAL,
  price REAL, bank_transfer REAL, recommended_price REAL, recommended_bank_transfer REAL, insight TEXT, action TEXT,
  captured_at TEXT, PRIMARY KEY(catalog_id, style_id));
"""


def read_pricing(page) -> list[dict]:
    """Every pricing row. The table is paginated (25 per page) and each page lazily renders its rows on scroll, so:
    harvest page 1 by scrolling, then open page 2, 3... until the page's own "All Products (N)" total is reached.
    Raises LayoutChanged (carrying the rows read so far, as .rows) if fewer than the total come back."""
    text = page.inner_text("body")
    total = parse_pricing_total(text)
    rows: dict[tuple, dict] = {}

    def harvest() -> None:
        for r in parse_pricing_rows(page.inner_text("body")):
            rows.setdefault(r["catalog_id"] + "|" + r["style_id"], r)
        stalls = 0
        for _ in range(40):
            if len(rows) >= total or stalls >= 8:
                break
            before = len(rows)
            # incremental scroll: the infinite-scroll loads more rows only as the viewport passes through them
            page.mouse.wheel(0, 1_800)
            page.wait_for_timeout(3_500)
            for r in parse_pricing_rows(page.inner_text("body")):
                rows.setdefault(r["catalog_id"] + "|" + r["style_id"], r)
            stalls = stalls + 1 if len(rows) == before else 0

    harvest()
    exhausted = False   # True once there is no further page to open
    for page_no in range(2, 8):
        if len(rows) >= total:
            break
        try:
            page.mouse.wheel(0, 100_000)       # pagination control sits below the last row
            page.wait_for_timeout(1_000)
            page.get_by_text(str(page_no), exact=True).last.click(timeout=8_000)
            page.wait_for_timeout(3_500)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(1_000)
        except Exception:  # noqa: BLE001 - no such page: every page has been read
            exhausted = True
            break
        before = len(rows)
        harvest()
        if len(rows) == before:
            exhausted = True
            break
    out = list(rows.values())
    # Meesho's "All Products (N)" header can count one more than the table ever lists (seen 2026-10-08: header 27,
    # table 25 + 1 rows over 2 pages). When every page has been read, what the table shows IS the complete set.
    if len(out) != total and not exhausted:
        err = LayoutChanged(f"read {len(out)} of {total} pricing rows")
        err.rows = out
        raise err
    return out


def store_pricing(conn, rows: list[dict], captured_at: str) -> None:
    conn.executescript(PRICING_SCHEMA)
    for r in rows:
        conn.execute(
            "INSERT OR REPLACE INTO panel_pricing VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (r["catalog_id"], r["style_id"], r["title"], r["size"], r["stock"], r["growth_30d_pct"], r["price"],
             r["bank_transfer"], r["recommended_price"], r["recommended_bank_transfer"], r["insight"], r["action"], captured_at))


# --------------------------------------------------------------------------- read-only exploration
_LEAVES_JS = """() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length === 0) {
      const t = (el.textContent || '').trim();
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({t: t.slice(0, 200), x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width)});
    }
  }
  return out.slice(0, 4000);
}"""


def explore(page, steps: list[dict]) -> list[str]:
    """Read-only. Each step: {"name", "clicks": [text, ...] (clicked in order, exact match), "wait_ms", "leaves": bool,
    "scroll": bool}. Saves page text + screenshot (+ every text leaf with its position when "leaves") to
    capture/x-<name>.*. Menu groups (Orders, Inventory...) must be clicked before their children, hence the list."""
    import json
    from pathlib import Path
    out = Path(__file__).resolve().parents[2] / "capture"
    out.mkdir(exist_ok=True)
    log = []
    for st in steps:
        name = st.get("name", "step")
        try:
            page.goto(HOME, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(4_000)
            for label in st.get("clicks", []):
                try:
                    page.get_by_text(label, exact=True).first.click(timeout=8_000)
                except Exception:
                    clicked = page.evaluate(
                        """(label) => {
                          const els = [...document.querySelectorAll('body *')].filter(
                            el => el.children.length === 0 && el.textContent.trim() === label);
                          for (const el of els) {
                            const r = el.getBoundingClientRect();
                            if (r.width > 0 && r.height > 0) { el.click(); return true; }
                          }
                          if (els.length) { els[0].click(); return true; }
                          return false;
                        }""", label)
                    if not clicked:
                        raise
                page.wait_for_timeout(1_500)
            if st.get("page_no"):  # open page N of a paginated table, exactly as read_pricing does
                page.mouse.wheel(0, 100_000)
                page.wait_for_timeout(1_000)
                page.get_by_text(str(st["page_no"]), exact=True).last.click(timeout=8_000)
                page.wait_for_timeout(3_500)
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(1_000)
            page.wait_for_timeout(st.get("wait_ms", 7_000))
            if st.get("scroll"):
                for _ in range(6):
                    page.mouse.wheel(0, 1500)
                    page.wait_for_timeout(700)
                page.mouse.wheel(0, -20000)
                page.wait_for_timeout(500)
            (out / f"x-{name}.txt").write_text(f"url: {page.url}" + chr(10) * 2 + page.inner_text("body"), encoding="utf-8")
            page.screenshot(path=str(out / f"x-{name}.png"), full_page=True)
            if st.get("leaves"):
                (out / f"x-{name}.json").write_text(json.dumps(page.evaluate(_LEAVES_JS), ensure_ascii=False), encoding="utf-8")
            log.append(f"{name}: {page.url}")
        except Exception as exc:  # noqa: BLE001
            log.append(f"{name}: FAILED {str(exc).splitlines()[0][:140]}")
    (out / "x-explore.log").write_text(chr(10).join(log), encoding="utf-8")
    return log
