"""Playwright-based connector for supplier.meesho.com (auto mode).

HONESTY NOTES
-------------
- The human seller completes the mobile OTP login themselves in the browser
  window this module opens on the local machine. We NEVER see, read, or store
  the OTP. The resulting Chromium profile is persisted under ``data/session``
  so subsequent headless pulls can reuse the logged-in session.
- The CSS selectors in ``config.yaml`` (``selectors:`` section) are
  CALIBRATION PLACEHOLDERS. Meesho's supplier panel markup changes over time;
  the user must calibrate them. Every page scrape is wrapped in try/except and
  failures are logged to ``data_log`` as ``selector_mismatch`` instead of
  crashing.

Playwright is imported lazily inside functions so that importing this module
never fails on machines where playwright is not installed yet.
"""

import os
import threading
import time
import traceback

from app.database import add_snapshot, log_data_event, upsert_listing

STATE = {"running": False, "logged_in": False, "message": ""}

SESSION_DIR = "data/session"
SUPPLIER_HOME = "https://supplier.meesho.com"
# URL fragments that indicate we are on a logged-in supplier dashboard page.
_LOGGED_IN_MARKERS = ("/supplier", "/dashboard", "/panel", "/home", "/catalog")
_LOGIN_TIMEOUT_S = 10 * 60  # 10 minutes for the human to complete OTP


def login_status() -> dict:
    """Return a copy of the current login-flow state."""
    return dict(STATE)


def session_exists() -> bool:
    """True if a persisted Chromium session profile exists and is non-empty."""
    try:
        return os.path.isdir(SESSION_DIR) and len(os.listdir(SESSION_DIR)) > 0
    except OSError:
        return False


def _page_looks_logged_in(page) -> bool:
    """Heuristic: current URL looks like a supplier dashboard, not a login page."""
    try:
        url = (page.url or "").lower()
    except Exception:
        return False
    if "login" in url or "signin" in url or "otp" in url:
        return False
    return any(marker in url for marker in _LOGGED_IN_MARKERS)


def start_login() -> None:
    """Launch a visible browser so the human can log in with mobile OTP.

    Runs in a background thread; poll ``login_status()`` for progress.
    A second call while a login is already running is a no-op.
    """
    if STATE.get("running"):
        return
    STATE["running"] = True
    STATE["logged_in"] = False
    STATE["message"] = "Opening browser window... log in with your mobile OTP (we never see it)."
    thread = threading.Thread(target=_login_worker, name="meesho-login", daemon=True)
    thread.start()


def _login_worker() -> None:
    try:
        from playwright.sync_api import sync_playwright  # lazy import
    except ImportError as e:
        STATE["running"] = False
        STATE["logged_in"] = False
        STATE["message"] = "playwright is not installed: %s" % e
        return

    try:
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(SESSION_DIR, headless=False)
            try:
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(SUPPLIER_HOME, wait_until="domcontentloaded", timeout=60000)
                STATE["message"] = (
                    "Browser opened. Complete your mobile OTP login in that window; "
                    "waiting (up to 10 minutes)..."
                )
                deadline = time.time() + _LOGIN_TIMEOUT_S
                logged_in = False
                while time.time() < deadline:
                    if _page_looks_logged_in(page):
                        logged_in = True
                        break
                    time.sleep(2)
                STATE["logged_in"] = logged_in
                if logged_in:
                    STATE["message"] = "Login successful. Session saved; auto pull is now available."
                else:
                    STATE["message"] = "Timed out after 10 minutes waiting for login. Try connecting again."
            finally:
                try:
                    context.close()
                except Exception:
                    pass
    except Exception as e:
        STATE["logged_in"] = False
        STATE["message"] = "Login flow failed: %s" % e
    finally:
        STATE["running"] = False


def _cfg_get(section, key, default=None):
    """Read ``key`` from a config section that may be a dict or dot-access object."""
    if section is None:
        return default
    if isinstance(section, dict):
        return section.get(key, default)
    return getattr(section, key, default)


def _row_text(row) -> str:
    try:
        return row.inner_text()
    except Exception:
        return ""


def _first_number(text: str):
    """Extract the first numeric token from a string ('1,234.5' -> 1234.5)."""
    import re

    m = re.search(r"-?\d[\d,]*\.?\d*", text.replace("\u20b9", "").replace("%", ""))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _find_in_row(row, selector: str):
    """Return inner_text of the first descendant matching selector, else ''."""
    try:
        el = row.query_selector(selector)
        return el.inner_text() if el is not None else ""
    except Exception:
        return ""


def _scrape_catalog_page(page, selectors) -> list:
    """Parse catalog rows on the current page.

    Raises on structural mismatch (caller logs 'selector_mismatch').
    """
    rows_sel = _cfg_get(selectors, "catalog_rows", "table.catalog-list tr")
    qs_sel = _cfg_get(selectors, "quality_score", ".quality-score-value")
    cat_id_sel = _cfg_get(selectors, "catalog_id", "td.catalog-id, [data-catalog-id]")
    name_sel = _cfg_get(selectors, "name", "td.catalog-name, .product-name")
    price_sel = _cfg_get(selectors, "price", "td.price, .price")
    stock_sel = _cfg_get(selectors, "stock", "td.stock, .stock")

    rows = page.query_selector_all(rows_sel)
    if not rows:
        raise RuntimeError("selector %r matched no rows on %s" % (rows_sel, page.url))

    parsed = []
    for row in rows:
        text = _row_text(row).strip()
        if not text:
            continue  # header/empty row
        cat_text = _find_in_row(row, cat_id_sel)
        catalog_id = "".join(ch for ch in cat_text if ch.isalnum() or ch in "-_") or None
        if catalog_id is None:
            # fall back to first numeric-ish token of the row
            n = _first_number(text)
            catalog_id = str(int(n)) if n is not None else None
        if not catalog_id:
            continue
        name = (_find_in_row(row, name_sel) or "").strip() or "Catalog %s" % catalog_id
        price = _first_number(_find_in_row(row, price_sel) or "")
        quality_score = _first_number(_find_in_row(row, qs_sel) or "")
        stock = _first_number(_find_in_row(row, stock_sel) or "")
        parsed.append(
            {
                "catalog_id": catalog_id,
                "name": name,
                "price": price,
                "quality_score": quality_score,
                "stock": int(stock) if stock is not None else 0,
            }
        )
    if not parsed:
        raise RuntimeError("rows matched but none could be parsed on %s" % page.url)
    return parsed


def pull_all(conn, cfg) -> dict:
    """Headless pull of catalog data from the supplier panel.

    Reuses the persisted session profile in ``data/session``. Every page scrape
    is wrapped in try/except; failures are logged via
    ``log_data_event(conn, 'auto_pull', 'selector_mismatch', ...)`` and skipped.

    Returns ``{ok: bool, listings: int, detail: str}``.
    """
    try:
        from playwright.sync_api import sync_playwright  # lazy import
    except ImportError as e:
        detail = "playwright is not installed: %s" % e
        try:
            log_data_event(conn, "auto_pull", "error", detail)
        except Exception:
            pass
        return {"ok": False, "listings": 0, "detail": detail}

    if not session_exists():
        detail = "no saved session; connect via OTP login first"
        try:
            log_data_event(conn, "auto_pull", "error", detail)
        except Exception:
            pass
        return {"ok": False, "listings": 0, "detail": detail}

    selectors = {}
    try:
        selectors = cfg.get("selectors", {}) if isinstance(cfg, dict) else getattr(cfg, "selectors", {})
    except Exception:
        selectors = {}

    # Candidate pages to scrape; first one that yields data wins.
    page_urls = [
        SUPPLIER_HOME + "/catalogs",
        SUPPLIER_HOME + "/panel/catalogs",
        SUPPLIER_HOME + "/dashboard",
        SUPPLIER_HOME,
    ]

    now = time.strftime("%Y-%m-%d %H:%M:%S")

    from app.connector.panel_lock import PanelBusy, panel_lock

    try:
        lock = panel_lock(wait_s=5)
        lock.__enter__()
    except PanelBusy:
        return {"ok": False, "listings": 0, "detail": "skipped: the Supplier Panel browser is in use (keeper is reading it)"}
    try:
        return _pull_all_locked(conn, page_urls, selectors, now)
    finally:
        lock.__exit__(None, None, None)


def _pull_all_locked(conn, page_urls, selectors, now) -> dict:
    from playwright.sync_api import sync_playwright

    total = 0
    errors = []
    try:
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(SESSION_DIR, headless=True)
            try:
                page = context.pages[0] if context.pages else context.new_page()
                for url in page_urls:
                    try:
                        page.goto(url, wait_until="domcontentloaded", timeout=60000)
                        if "login" in (page.url or "").lower():
                            errors.append("redirected to login; session expired")
                            break
                        rows = _scrape_catalog_page(page, selectors)
                    except Exception as e:
                        log_data_event(conn, "auto_pull", "selector_mismatch", str(e))
                        errors.append("%s: %s" % (url, e))
                        continue
                    for row in rows:
                        try:
                            listing_id = upsert_listing(
                                conn,
                                catalog_id=row["catalog_id"],
                                name=row["name"],
                                category=None,
                                price=row["price"],
                                status="live",
                                created_at=now,
                            )
                            metrics = {}
                            if row.get("quality_score") is not None:
                                metrics["quality_score"] = row["quality_score"]
                            if row.get("price") is not None:
                                metrics["price"] = row["price"]
                            if row.get("stock") is not None:
                                metrics["stock"] = row["stock"]
                            add_snapshot(conn, listing_id, now, **metrics)
                            total += 1
                        except Exception as e:
                            log_data_event(conn, "auto_pull", "error", "row upsert failed: %s" % e)
                    if total:
                        break  # got data; stop trying other pages
            finally:
                try:
                    context.close()
                except Exception:
                    pass
    except Exception as e:
        detail = "auto pull failed: %s" % e
        try:
            log_data_event(conn, "auto_pull", "error", detail + "\n" + traceback.format_exc(limit=3))
        except Exception:
            pass
        return {"ok": False, "listings": total, "detail": detail}

    if total:
        log_data_event(conn, "auto_pull", "ok", "pulled %d listings" % total)
        detail = "pulled %d listings" % total
        if errors:
            detail += " (skipped: %s)" % "; ".join(errors)
        return {"ok": True, "listings": total, "detail": detail}
    detail = "no listings scraped"
    if errors:
        detail += ": " + "; ".join(errors)
    return {"ok": False, "listings": 0, "detail": detail}
