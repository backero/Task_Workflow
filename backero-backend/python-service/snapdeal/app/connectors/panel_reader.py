"""Real, read-only readers for the Snapdeal Seller Panel, built from pages captured live on 2026-09-26 (see
tests/fixtures/sd_*.txt) — the same method used for Meesho and Flipkart. Every pattern below matches a real page.

Runs INSIDE the keeper's already-signed-in window (app/connectors/snapdeal_keeper.py). Snapdeal rejects its own
exported cookies when replayed in a fresh browser (error 422 on the home page), so pages can only be read from the
live window.

Scope, honestly stated: read = dashboard totals, the full catalog (price / MRP / stock / MSP / gross payable /
product rating per SKU), pending-order and courier-return counts. NOT read: orders/returns rows, payments and
ads (the 'Payments' and 'Advertise' nav clicks did not open a page in the capture), and the dashboard's
percent-change figures keep no sign because the page shows none.
"""
from __future__ import annotations

import re
from datetime import datetime


class LayoutChanged(Exception):
    """The panel no longer matches what these parsers were built from."""


class PartialCatalog(LayoutChanged):
    """Some catalog rows were read but not all - the rows read are real and are still stored, the run is 'partial'."""

    def __init__(self, rows, message):
        super().__init__(message)
        self.rows = rows


def _num(s) -> float | None:
    if s is None:
        return None
    t = str(s).replace("Rs.", "").replace("₹", "").replace(",", "").replace("%", "").strip()
    try:
        return float(t)
    except ValueError:
        return None


def _flat(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _need(pattern: str, text: str, what: str) -> re.Match:
    m = re.search(pattern, text)
    if not m:
        raise LayoutChanged(f"could not find {what}")
    return m


def parse_dashboard(text: str) -> dict:
    """Account health, 30-day sales/orders summary, seller rating and the two payment pairs."""
    t = _flat(text)
    out: dict = {}
    m = _need(r"Account Health : (\w+)", t, "Account Health")
    out["account_health"] = m.group(1)
    m = _need(r"Sales Completed Rs\.([\d,.]+) ([\d.]+)% Sales Returned Rs\.([\d,.]+) ([\d.]+)% "
              r"Orders Booked ([\d,]+) ([\d.]+)% Orders Processed ([\d,]+) ([\d.]+)% Orders Returned ([\d,]+) ([\d.]+)%",
              t, "the Orders & Sales Summary")
    out.update({
        "sales_completed": _num(m.group(1)), "sales_completed_change_abs_pct": _num(m.group(2)),
        "sales_returned": _num(m.group(3)), "sales_returned_change_abs_pct": _num(m.group(4)),
        "orders_booked": _num(m.group(5)), "orders_booked_change_abs_pct": _num(m.group(6)),
        "orders_processed": _num(m.group(7)), "orders_processed_change_abs_pct": _num(m.group(8)),
        "orders_returned": _num(m.group(9)), "orders_returned_change_abs_pct": _num(m.group(10)),
    })
    h = re.search(r"Order Processing Health STATUS : (\w+)", t)
    if h:
        out["order_processing_health"] = h.group(1)
    r = re.search(r"([\d.]+) Avg Seller Rating", t)
    if r:
        out["avg_seller_rating"] = _num(r.group(1))
    pay = re.search(r"Unsettled Payments Due Date: ([\d]+ \w+ \d{4}) Last Settled Payments Last Settled Date: ([\d]+ \w+ \d{4}) "
                    r"COD Rs\.(-?[\d,.]+) NCOD Rs\.(-?[\d,.]+) COD Rs\.(-?[\d,.]+) NCOD Rs\.(-?[\d,.]+)", t)
    if pay:
        out.update({"unsettled_cod": _num(pay.group(3)), "unsettled_ncod": _num(pay.group(4)),
                    "last_settled_cod": _num(pay.group(5)), "last_settled_ncod": _num(pay.group(6))})
    return out


_ROW = re.compile(
    r"(?P<title>[^\n]+?)\s+Edit Price & Inventory\s*\n"
    r"SKU : (?P<sku>[^\s|]+) \| POG ID : (?P<pog>\d+)[^\n]*\n"
    r"(?:Product Rating: (?P<rating>[\d.]+)%\s*\n)?"
    r"Selling Price(?P<price>[\d,.]+)\s*\n"
    r"Gross Seller Payable(?P<gross>-?[\d,.]+)\s*\n"
    r"Inventory(?P<stock>Out-of-Stock|[\d,]+)\s*\n"
    r"MSP(?P<msp>[\d,.]+)\s*\n"
    r"MRP(?P<mrp>[\d,.]+)")


def parse_catalog_page(text: str) -> list[dict]:
    """One page (10 rows) of the live catalog. Raises LayoutChanged if the page has SKUs but none parse."""
    rows = []
    for m in _ROW.finditer(text):
        rows.append({
            "sku": m.group("sku"), "title": _flat(m.group("title")), "pog_id": m.group("pog"),
            "product_rating_pct": _num(m.group("rating")), "price": _num(m.group("price")),
            "gross_payable": _num(m.group("gross")), "stock": 0 if m.group("stock") == "Out-of-Stock" else int(_num(m.group("stock"))),
            "msp": _num(m.group("msp")), "mrp": _num(m.group("mrp")),
        })
    if not rows and "SKU :" in text:
        raise LayoutChanged("the catalog page lists SKUs but none matched the row pattern")
    return rows


def parse_catalog_totals(text: str) -> dict:
    t = _flat(text)
    m = _need(r"In Stock \((\d+)\) Out of Stock \((\d+)\)", t, "the In Stock / Out of Stock totals")
    return {"in_stock": int(m.group(1)), "out_of_stock": int(m.group(2))}


def parse_pending_orders(text: str) -> dict:
    """Snapdeal drops the '(N)' suffix on 'Urgency: All' entirely when N is 0 (confirmed live 2026-09-27) rather than
    showing '(0)' - the count is genuinely zero then, not missing data."""
    t = _flat(text)
    m = _need(r"Urgency: All(?: \((\d+)\))?", t, "the pending-orders count")
    return {"pending_orders_to_print": int(m.group(1)) if m.group(1) else 0}


def parse_courier_returns(text: str) -> dict:
    t = _flat(text)
    m = _need(r"Courier\((\d+)\)", t, "the courier-returns count")
    return {"courier_returns_pending": int(m.group(1))}


def to_listing(row: dict, status: str | None = None) -> dict:
    """Map a parsed catalog row onto the listings table. Fields the panel does not show are neutral, not invented:
    rating/reviews 0 (rules treat 0 as 'unknown'), attributes 10/10 (no false 'incomplete' alert)."""
    return {"sku": row["sku"], "title": row["title"], "brand": "treyfa" if row["title"].lower().startswith("treyfa") else "",
            "category": "", "price": row["price"], "mrp": row["mrp"], "stock": row["stock"],
            "status": status or ("live" if row["stock"] > 0 else "out_of_stock"), "rating": 0, "reviews": 0,
            "fulfilment": "Dropship", "image_ok": 1, "attrs_filled": 10, "attrs_total": 10}


# --------------------------------------------------------------------------- storage
SCHEMA = """
CREATE TABLE IF NOT EXISTS panel_metrics(
  id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, area TEXT NOT NULL, key TEXT NOT NULL,
  value REAL, text TEXT);
CREATE INDEX IF NOT EXISTS panel_metrics_lookup ON panel_metrics(area, key, captured_at);
CREATE TABLE IF NOT EXISTS sku_performance(
  sku TEXT PRIMARY KEY, title TEXT, orders_30d REAL, transfer_amount_30d REAL, bad_pct REAL, return_pct REAL, captured_at TEXT);
CREATE TABLE IF NOT EXISTS settlements(
  ref TEXT PRIMARY KEY, date TEXT, amount REAL, transactions INTEGER, captured_at TEXT);
CREATE TABLE IF NOT EXISTS listing_panel(
  sku TEXT PRIMARY KEY, pog_id TEXT, product_rating_pct REAL, gross_payable REAL, msp REAL, captured_at TEXT);
"""


def store_metrics(conn, area: str, metrics: dict, captured_at: str) -> None:
    for key, value in metrics.items():
        if isinstance(value, (int, float)) or value is None:
            conn.execute("INSERT INTO panel_metrics(captured_at, area, key, value) VALUES (?,?,?,?)", (captured_at, area, key, value))
        else:
            conn.execute("INSERT INTO panel_metrics(captured_at, area, key, text) VALUES (?,?,?,?)", (captured_at, area, key, str(value)))


_FIND_PAGER_BUTTON = """(n) => {
  const cands = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length === 0 && el.textContent.trim() === String(n)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) cands.push({el, top: r.top + window.scrollY});
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.top - a.top);          // the pager is the lowest such element on the page
  const el = cands[0].el;
  el.scrollIntoView({block: 'center'});
  const r = el.getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName, cls: String(el.className), n: cands.length};
}"""


def _click_page(page, n: int) -> None:
    """Click pager button n: the lowest element on the page whose whole text is n (the pager sits under the list)."""
    found = page.evaluate(_FIND_PAGER_BUTTON, n)
    if not found:
        raise RuntimeError(f"no pager button {n} on the page")
    page.wait_for_timeout(500)
    found = page.evaluate(_FIND_PAGER_BUTTON, n)      # re-measure after the scroll settled
    first_before = (re.findall(r"SKU : ([^\s|]+)", page.inner_text("body")) or [None])[0]
    page.mouse.click(found["x"], found["y"])
    for _ in range(20):                      # up to ~10 s for the next page's rows to replace the current ones
        page.wait_for_timeout(500)
        now_first = (re.findall(r"SKU : ([^\s|]+)", page.inner_text("body")) or [None])[0]
        if now_first and now_first != first_before:
            break
    _debug(page, f"clicked pager {n}: {found}")


def _debug(page, msg: str) -> None:
    from pathlib import Path
    out = Path(__file__).resolve().parents[2] / "capture-diagnostics"
    out.mkdir(exist_ok=True)
    try:
        skus = re.findall(r"SKU : ([^\s|]+)", page.inner_text("body"))
    except Exception as exc:  # noqa: BLE001
        skus = [f"unreadable: {exc}"]
    with open(out / "pager-debug.txt", "a", encoding="utf-8") as fh:
        fh.write(f"{datetime.now().isoformat(timespec='seconds')} url={page.url} {msg} skus_now={skus[:3]}...({len(skus)})\n")


def read_catalog(page, url: str, expected_fn, max_pages: int = 12) -> list[dict]:
    """Every catalog row of one catalog tab, paging through the numbered pager. Stops when a page adds nothing new.
    Raises PartialCatalog (carrying the real rows read so far) if fewer rows than the page's own total come back."""
    page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(3_000)
    text = page.inner_text("body")
    # Wait for exactly what expected_fn needs (the totals line, e.g. "Disabled by You (N) Disabled by Snapdeal (N)
    # Rejected By Snapdeal (N)"), not a looser stand-in - the totals render as one block but sometimes after "SKU :"
    # already has rows, and a partial match on just the first number used to let this proceed before the rest of
    # the line existed, raising "could not find the Not Live totals" on an otherwise-fine page (found 2026-09-27).
    expected = None
    for _ in range(25):
        if "SKU :" in text:
            try:
                expected = expected_fn(text)
                break
            except LayoutChanged:
                pass
        page.wait_for_timeout(1_000)
        text = page.inner_text("body")
    if expected is None:
        expected = expected_fn(text)  # final attempt after the full wait - let it raise its real error if still missing
    rows = {r["sku"]: r for r in parse_catalog_page(text)}
    for n in range(2, max_pages + 1):
        if len(rows) >= expected:
            break
        before = len(rows)
        try:
            _click_page(page, n)
        except Exception:  # noqa: BLE001 - no such page number: the pager is exhausted
            break
        for r in parse_catalog_page(page.inner_text("body")):
            rows.setdefault(r["sku"], r)
        if len(rows) == before:
            break
    out = list(rows.values())
    if len(out) != expected:
        raise PartialCatalog(out, f"read {len(out)} of {expected} catalog rows (page {len(out) // 10 + 1} did not load)")
    return out


URL_LIVE = "https://seller.snapdeal.com/#/catalog/liveinstock"
URL_NOTLIVE = "https://seller.snapdeal.com/#/catalog/notlivesellerdisabled"
URL_ADS = "https://setu.snapdeal.com/?service=http://ads.snapdeal.com/app"


def _live_expected(text: str) -> int:
    t = parse_catalog_totals(text)
    return t["in_stock"] + t["out_of_stock"]


def _notlive_expected(text: str) -> int:
    return parse_notlive_totals(text)["disabled_by_you"]


def read_in_open_page(page) -> dict[str, str]:
    """Read every area this module understands inside the keeper's signed-in window. One failing area must not
    cost the others. Writes to the app database. Returns {area: 'ok' | 'failed: why'}."""
    from app import database as db

    db.init()
    with db.conn() as c:
        c.executescript(SCHEMA)
    now = datetime.now().isoformat(timespec="seconds")
    day = datetime.now().date().isoformat()
    results: dict[str, str] = {}

    def step(area, fn):
        try:
            fn()
            results[area] = "ok"
        except Exception as exc:  # noqa: BLE001
            results[area] = f"failed: {str(exc).splitlines()[0][:160]}"
        # A pause between areas, same as Flipkart's sellerhub.py (pause_ms=3500, survives 50+ minutes signed in).
        # Snapdeal's session was measured dying 6-7 minutes after sign-in, consistently right after the 9-area read
        # ran back-to-back with no pause between pages - the same shape of problem, so the same fix (2026-09-27).
        page.wait_for_timeout(3_500)

    def open_page(url, wait=5_000, expect=None):
        """Load a panel route and, if `expect` (a regex) is given, keep looking (up to ~25 s) until that text has
        rendered - these are single-page-app routes and a fixed sleep is sometimes not enough."""
        page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(wait)
        text = page.inner_text("body")
        for _ in range(25):
            if expect is None or re.search(expect, text):
                break
            page.wait_for_timeout(1_000)
            text = page.inner_text("body")
        return text

    def save_catalog(rows, status_of, complete):
        with db.conn() as c:
            _clear_demo_once(c)
            if complete:      # only a complete read of the live tab may drop listings that are no longer there
                c.execute("DELETE FROM listings WHERE status != 'not_live' AND sku NOT IN (%s)" % ",".join("?" * len(rows)),
                          [r["sku"] for r in rows])
        db.upsert_listings([to_listing(r, status_of(r)) for r in rows])
        with db.conn() as c:
            for r in rows:
                c.execute("INSERT OR REPLACE INTO listing_panel VALUES(?,?,?,?,?,?)",
                          (r["sku"], r["pog_id"], r["product_rating_pct"], r["gross_payable"], r["msp"], now))

    def catalog_step(url, expected_fn, status_of, area_key):
        try:
            rows = read_catalog(page, url, expected_fn)
        except PartialCatalog as part:
            if part.rows:
                save_catalog(part.rows, status_of, complete=False)
            raise
        save_catalog(rows, status_of, complete=(area_key == "listings_read"))
        with db.conn() as c:
            store_metrics(c, "catalog", {area_key: len(rows)}, now)

    def dashboard():
        m = parse_dashboard(open_page("https://seller.snapdeal.com/#/dashboard", 4_000, r"Account Health"))
        with db.conn() as c:
            store_metrics(c, "dashboard", m, now)

    def orders():
        with db.conn() as c:
            store_metrics(c, "orders", parse_pending_orders(open_page("https://seller.snapdeal.com/#/orders/new/print", 3_000, r"Urgency: All")), now)

    def returns():
        with db.conn() as c:
            store_metrics(c, "returns", parse_courier_returns(open_page("https://seller.snapdeal.com/#/return/pending/courier", 3_000, r"Courier\(\d+\)")), now)

    def perf_tab(tab, expect):
        """Performance 2.0 is one page with tabs: open it, click the tab, wait for that tab's own content."""
        open_page("https://seller.snapdeal.com/#/newperformance/rating", 3_000, r"Avg Seller Rating")
        page.get_by_text(tab, exact=True).first.click(timeout=8_000)
        text = page.inner_text("body")
        for _ in range(25):
            if re.search(expect, text):
                return text
            page.wait_for_timeout(1_000)
            text = page.inner_text("body")
        return text

    def health():
        with db.conn() as c:
            store_metrics(c, "health", parse_order_processing(perf_tab("Order Processing", r"Order Processing Health :")), now)

    def sku_performance():
        rows = parse_bad_rating_products(perf_tab("Products", r"Total Orders|Contribution to Bad"))
        with db.conn() as c:
            c.execute("DELETE FROM sku_performance")
            for r in rows:
                c.execute("INSERT INTO sku_performance VALUES(?,?,?,?,?,?,?)",
                          (r["sku"], r["title"], r["orders_30d"], r["transfer_amount_30d"], r["bad_pct"], r["return_pct"], now))

    def payments():
        m = parse_payments_dashboard(open_page("https://seller.snapdeal.com/#/payments/dashboard", 3_000, r"Monthly Payments Credited"))
        settled = parse_settlements(open_page("https://seller.snapdeal.com/#/payments/all", 3_000, r"Settlement Date"))
        with db.conn() as c:
            store_metrics(c, "payments", m, now)
            for r in settled:
                c.execute("INSERT OR REPLACE INTO settlements VALUES(?,?,?,?,?)", (r["ref"], r["date"], r["amount"], r["transactions"], now))

    def ads():
        # Wait for parse_ads_summary itself to succeed, not just the "CPT Ads Summary" heading - the heading
        # renders before the impressions/clicks/sales/spend/ROI numbers finish loading, so waiting on the heading
        # alone let this proceed too early and raise "could not find the Ads summary" on an otherwise-fine page
        # (found 2026-09-27, same class of bug as the catalog totals fix above).
        page.goto(URL_ADS, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(6_000)
        text = page.inner_text("body")
        a = None
        for _ in range(25):
            try:
                a = parse_ads_summary(text)
                break
            except LayoutChanged:
                pass
            page.wait_for_timeout(1_000)
            text = page.inner_text("body")
        if a is None:
            try:
                a = parse_ads_summary(text)
            except LayoutChanged:
                # This still fails intermittently even after the waits above (2026-09-27) - save what the page
                # actually showed so the next failure can be diagnosed from evidence instead of guessed at again.
                from pathlib import Path
                out = Path(__file__).resolve().parents[2] / "capture-diagnostics"
                out.mkdir(exist_ok=True)
                with open(out / "ads-failure.txt", "a", encoding="utf-8") as fh:
                    fh.write(f"\n--- {datetime.now().isoformat(timespec='seconds')} url={page.url} ---\n{text[:4000]}\n")
                raise
        with db.conn() as c:
            store_metrics(c, "ads", {k: v for k, v in a.items() if k not in ("range_from", "range_to")}, now)
            campaign = f"Sponsored Products (CPT), {a['range_from']} - {a['range_to']}"
            c.execute("DELETE FROM ads_daily")
            c.execute("INSERT INTO ads_daily VALUES(?,?,?,?,?,?,?,?)",
                      (campaign, "", day, a["spend"], int(a["impressions"]), int(a["clicks"]), int(a["conversions"]), a["sales"]))

    step("catalog", lambda: catalog_step(URL_LIVE, _live_expected, lambda r: "live" if r["stock"] > 0 else "out_of_stock", "listings_read"))
    step("dashboard", dashboard)
    step("orders", orders)
    step("returns", returns)
    step("health", health)
    step("payments", payments)
    step("sku_performance", sku_performance)
    step("ads", ads)
    step("catalog_not_live", lambda: catalog_step(URL_NOTLIVE, _notlive_expected, lambda r: "not_live", "not_live_read"))
    return results


def _clear_demo_once(c) -> None:
    """Demo mode seeded 8 fake listings plus fake daily metrics, ads, scorecard and alerts. The first time real
    listings arrive they are removed (the alerts engine re-derives alerts from real data)."""
    done = c.execute("SELECT value FROM kv WHERE key='demo_cleared'").fetchone()
    if done:
        return
    for table in ("metrics_daily", "ads_daily", "scorecard", "alerts"):
        c.execute(f"DELETE FROM {table}")
    c.execute("INSERT OR REPLACE INTO kv VALUES('demo_cleared', ?)", (datetime.now().isoformat(timespec="seconds"),))


# --------------------------------------------------------------------------- read-only exploration
SIDEBAR_X = 44   # the collapsed left menu: icons at these y positions, in order (measured on a 1400-wide window)
SIDEBAR_Y = {"dashboard": 122, "orders": 166, "catalog": 210, "returns": 254, "promotions": 298,
             "payments": 342, "reports": 386, "advertise": 430, "performance": 474, "support": 518}


def explore(page, steps: list[dict]) -> list[str]:
    """Run declarative, read-only steps in the live window and save each page's text + screenshot to
    capture-diagnostics/x-<name>.*. A step: {"name", "goto": url?, "sidebar": key?, "click_text": text?,
    "click_xy": [x, y]?, "wait_ms": n?}. Any extra tab a click opens is captured too. Nothing is typed or submitted."""
    from pathlib import Path
    out = Path(__file__).resolve().parents[2] / "capture-diagnostics"
    out.mkdir(exist_ok=True)
    ctx = page.context
    log = []
    for st in steps:
        name = st.get("name", "step")
        try:
            before = set(ctx.pages)
            if st.get("goto"):
                page.goto(st["goto"], wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(st.get("goto_wait_ms", 5_000))
            if st.get("sidebar"):
                page.goto("https://seller.snapdeal.com/#/dashboard", wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(4_000)
                page.mouse.click(SIDEBAR_X, SIDEBAR_Y[st["sidebar"]])
            if st.get("links"):
                links = page.evaluate(r"() => [...document.querySelectorAll('a[href]')].map(a => (a.getAttribute('href') || '') + ' | ' + a.textContent.trim().replace(/\s+/g, ' ').slice(0, 50))")
                (out / f"x-{name}.txt").write_text(chr(10).join(links), encoding="utf-8")
                log.append(f"{name}: {len(links)} links")
                continue
            if st.get("click_xy"):
                page.mouse.click(*st["click_xy"])
            if st.get("click_text"):
                page.get_by_text(st["click_text"], exact=st.get("exact", True)).first.click(timeout=8_000)
            page.wait_for_timeout(st.get("wait_ms", 6_000))
            targets = [page] + [p for p in ctx.pages if p not in before and p is not page]
            for i, tp in enumerate(targets):
                suffix = "" if i == 0 else f"-tab{i}"
                tp.wait_for_load_state("domcontentloaded", timeout=20_000)
                (out / f"x-{name}{suffix}.txt").write_text(f"url: {tp.url}" + chr(10) * 2 + tp.inner_text("body"), encoding="utf-8")
                tp.screenshot(path=str(out / f"x-{name}{suffix}.png"), full_page=True)
                log.append(f"{name}{suffix}: {tp.url}")
            for extra in [p for p in ctx.pages if p not in before and p is not page]:
                extra.close()
        except Exception as exc:  # noqa: BLE001
            log.append(f"{name}: FAILED {str(exc).splitlines()[0][:140]}")
    (out / "x-explore.log").write_text(chr(10).join(log), encoding="utf-8")
    return log


# --------------------------------------------------------------------------- more real pages (captured 2026-09-26)
def parse_order_processing(text: str) -> dict:
    """Performance 2.0 > Order Processing: Snapdeal's own health gate and the six figures it is judged on."""
    t = _flat(text)
    out = {"order_processing_health": _need(r"Order Processing Health : (\w+)", t, "Order Processing Health").group(1)}
    for key, pat in {
        "manifested_last_3_days": r"Manifested in Last 3 Days > 0 ([\d,]+)",
        "shipped_last_3_days": r"Shipped in Last 3 Days > 0 ([\d,]+)",
        "manifest_pct_3_day_lag": r"Manifest % \(3 Day lag\) > 90% ([\d.]+)",
        "shipped_pct_3_day_lag": r"Shipped % \(3 Day lag\) > 90% ([\d.]+)",
        "total_rating_count": r"Total Rating Count >= 20 ([\d,]+)",
        "bad_rating_pct": r"Bad Rating % <= 20% ([\d.]+)",
    }.items():
        m = re.search(pat, t)
        if m:
            out[key] = _num(m.group(1))
    return out


_PERF_ROW = re.compile(
    r"(?P<title>[^\n]+)\nSKU : (?P<sku>[^\s|]+) \| SUPC : (?P<supc>\w+)\s*\n"
    r"Total Orders \[\?\](?P<orders>[\d,]+)\s*\nTransfer Amount(?P<amount>[\d,.]+)\s*\n"
    r"Bad Percentage% \[\?\](?P<bad>[\d.]+)%\s*\nReturn Percentage% \[\?\](?P<ret>[\d.]+)%")


def parse_bad_rating_products(text: str) -> list[dict]:
    """Performance 2.0 > Products: the SKUs contributing to bad ratings, with their own 30-day orders and sales."""
    return [{"sku": m.group("sku"), "title": _flat(m.group("title")), "orders_30d": _num(m.group("orders")),
             "transfer_amount_30d": _num(m.group("amount")), "bad_pct": _num(m.group("bad")), "return_pct": _num(m.group("ret"))}
            for m in _PERF_ROW.finditer(text)]


def parse_payments_dashboard(text: str) -> dict:
    t = _flat(text)
    out: dict = {}
    m = re.search(r"Monthly Payments Credited (\w+ \d{4}) ₹([\d,.]+) ([+-]?[\d.]+)% from last month", t)
    if m:
        out.update({"month_credited": _num(m.group(2)), "month_credited_change_pct": _num(m.group(3))})
    p = re.search(r"₹([\d,.]+) Credited on (\d+ \w+ \d{4})", t)
    if p:
        out["last_payment"] = _num(p.group(1))
    if not out:
        raise LayoutChanged("could not find the Payments dashboard totals")
    return out


def parse_settlements(text: str) -> list[dict]:
    t = _flat(text)
    rows = [{"date": m.group(1), "amount": _num(m.group(2)), "ref": m.group(3), "transactions": int(m.group(4))}
            for m in re.finditer(r"(\d{2} \w{3} \d{4}) Settlement Date ([\d,.]+) OTHERS [\d,.]+ Ref No\. (\S+) (\d+) Transaction\(s\)", t)]
    if not rows and "Settlement Date" in t:
        raise LayoutChanged("the settlements page lists dates but none matched the row pattern")
    return rows


def parse_ads_summary(text: str) -> dict:
    """ads.snapdeal.com dashboard: wallet balance plus the Sponsored Products summary for the date range shown."""
    t = _flat(text)
    m = _need(r"CPT Ads Summary (\d+ \w+, \d{4}) - (\d+ \w+, \d{4}) ([\d,]+) Ad Impressions ([\d,]+) Clicks ([\d,]+) Conversions "
              r"([\d,.]+) Sales \(Rs\.\) ([\d,.]+) Spends \(Rs\.\) ([\d.]+) ROI", t, "the Ads summary")
    out = {"range_from": m.group(1), "range_to": m.group(2), "impressions": _num(m.group(3)), "clicks": _num(m.group(4)),
           "conversions": _num(m.group(5)), "sales": _num(m.group(6)), "spend": _num(m.group(7)), "roi": _num(m.group(8))}
    w = re.search(r"Rs\. ([\d,.]+) Create Campaign", t)
    if w:
        out["wallet_balance"] = _num(w.group(1))
    return out


def parse_notlive_totals(text: str) -> dict:
    t = _flat(text)
    m = _need(r"Disabled by You \((\d+)\) Disabled by Snapdeal \((\d+)\) Rejected By Snapdeal \((\d+)\)", t, "the Not Live totals")
    return {"disabled_by_you": int(m.group(1)), "disabled_by_snapdeal": int(m.group(2)), "rejected": int(m.group(3))}
