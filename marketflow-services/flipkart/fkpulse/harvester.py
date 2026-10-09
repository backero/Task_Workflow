"""RankHarvester — keyword rank scanner for Flipkart public search pages.

Two modes (driven by config["mode"]):

- ``fixture``: reads pre-recorded SERP snapshots from
  ``<fixture_dir>/serp/<keyword_slug>.json`` — fully offline, no browser.
- ``live``: uses Playwright (sync API) with headless Chromium against the
  *public* flipkart.com search pages only (``/search?q=<kw>``, pages 1..3).

Legal / etiquette note
----------------------
This module fetches only public search-result pages that any anonymous
visitor can open in a browser. Operators should review Flipkart's Terms of
Use and https://www.flipkart.com/robots.txt before enabling live mode. The
harvester is deliberately polite: it is OFF by default (``harvester.enabled:
false``), waits a random delay between page fetches (``min_delay_s`` ..
``max_delay_s``), visits at most 3 pages per keyword, and *stops immediately*
on any CAPTCHA or login redirect — it never tries to solve or bypass a
block. When blocked it records a 24-hour backoff flag
(``kv_config["harvester_backoff_until"]``) and refuses to run again until
the backoff expires.
"""

from __future__ import annotations

import json
import logging
import random
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:  # structlog is a project dependency, but stay import-safe without it
    import structlog

    log = structlog.get_logger(__name__)
except Exception:  # pragma: no cover - fallback only
    log = logging.getLogger(__name__)

BACKOFF_KEY = "harvester_backoff_until"
BACKOFF_HOURS = 24
MAX_PAGES = 3
SEARCH_URL = "https://www.flipkart.com/search"

_PLAYWRIGHT_HELP = (
    "Playwright is required for live rank scanning but is not available.\n"
    "Install it with:\n"
    "    pip install playwright\n"
    "    playwright install chromium\n"
    "Or set `mode: fixture` in config.yaml to run without a browser."
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def keyword_slug(keyword: str) -> str:
    """'Niacinamide Serum!' -> 'niacinamide_serum' (fixture filename stem)."""
    slug = re.sub(r"[^a-z0-9]+", "_", keyword.lower()).strip("_")
    return slug or "keyword"


class RankHarvester:
    """Scans Flipkart public search pages for tracked FSN positions."""

    def __init__(self, config: dict):
        self.config = config or {}
        self.mode = self.config.get("mode", "fixture")
        hcfg = self.config.get("harvester", {}) or {}
        self.enabled = bool(hcfg.get("enabled", False))
        self.headless = bool(hcfg.get("headless", True))
        self.min_delay_s = float(hcfg.get("min_delay_s", 45))
        self.max_delay_s = float(hcfg.get("max_delay_s", 120))
        self.fixture_dir = Path(self.config.get("fixture_dir", "fixtures"))
        self.db_path = self.config.get("db_path", "fk_pulse.db")

    # ------------------------------------------------------------------ API
    def scan_keyword(self, keyword: str, target_fsns: set[str]) -> list[dict]:
        """Return [{fsn, position, page, price}] for target FSNs found in
        the first 3 SERP pages for ``keyword``.

        In fixture mode the snapshot file is read from disk. In live mode a
        headless Chromium browser fetches the public search pages; if a
        CAPTCHA or login redirect is detected the scan stops immediately,
        partial results are returned, and a 24h backoff flag is set.
        """
        products = self.scan_all(keyword)
        wanted = {str(f) for f in (target_fsns or set())}
        return [
            {k: p[k] for k in ("fsn", "position", "page", "price")}
            for p in products
            if p["fsn"] in wanted
        ]

    def scan_all(self, keyword: str) -> list[dict]:
        """Return *all* parsed product cards for ``keyword``
        [{fsn, position, page, price, title}] — useful for SERP medians."""
        if self.mode == "fixture":
            return self._scan_fixture(keyword)
        return self._scan_live(keyword)

    # ------------------------------------------------------------- fixture
    def _scan_fixture(self, keyword: str) -> list[dict]:
        path = self.fixture_dir / "serp" / f"{keyword_slug(keyword)}.json"
        if not path.exists():
            raise FileNotFoundError(
                f"SERP fixture not found: {path}. "
                f"Expected a snapshot for keyword {keyword!r}."
            )
        data = json.loads(path.read_text(encoding="utf-8"))
        products = data.get("products", data if isinstance(data, list) else [])
        return [self._normalize_product(p, i + 1) for i, p in enumerate(products)]

    @staticmethod
    def _normalize_product(p: dict, default_pos: int) -> dict:
        return {
            "fsn": str(p.get("fsn") or ""),
            "position": int(p.get("position") or default_pos),
            "page": int(p.get("page") or 1),
            "price": RankHarvester._parse_price(p.get("price")),
            "title": p.get("title"),
        }

    # ---------------------------------------------------------------- live
    def _scan_live(self, keyword: str) -> list[dict]:
        if not self.enabled:
            log.warning(
                "harvester disabled in config (harvester.enabled=false); "
                "returning no live results"
            )
            return []

        backoff_until = self._get_backoff_until()
        if backoff_until and backoff_until > _utcnow():
            log.warning(
                "harvester in backoff until %s; skipping scan of %r",
                backoff_until.isoformat(),
                keyword,
            )
            return []

        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError(_PLAYWRIGHT_HELP) from exc

        results: list[dict] = []
        blocked = False
        try:
            with sync_playwright() as pw:
                try:
                    browser = pw.chromium.launch(headless=self.headless)
                except Exception as exc:  # browser binary not installed etc.
                    raise RuntimeError(_PLAYWRIGHT_HELP) from exc
                try:
                    page = browser.new_page()
                    seen: set = set()
                    for page_no in range(1, MAX_PAGES + 1):
                        url = f"{SEARCH_URL}?q={keyword}&page={page_no}"
                        page.goto(url, wait_until="domcontentloaded",
                                  timeout=60_000)
                        page.wait_for_timeout(3_000)  # prices render after the shell
                        if self._is_blocked(page):
                            blocked = True
                            break
                        results.extend(
                            self._parse_cards(page, page_no, len(results), seen)
                        )
                        if page_no < MAX_PAGES:
                            self._polite_delay()
                finally:
                    browser.close()
        except RuntimeError:
            raise
        except Exception as exc:
            # Navigation/timeout failures: log and return what we have.
            log.warning("rank scan of %r failed: %s", keyword, exc)

        if blocked:
            log.warning("blocked; backing off 24h")
            self._set_backoff_until(_utcnow() + timedelta(hours=BACKOFF_HOURS))
        return results

    @staticmethod
    def _is_blocked(page) -> bool:
        """Detect CAPTCHA walls and login redirects; never bypass them."""
        try:
            url = (page.url or "").lower()
        except Exception:
            url = ""
        if "login" in url or "authenticate" in url:
            return True
        try:
            body = (page.inner_text("body") or "").lower()
        except Exception:
            return False
        markers = (
            "captcha",
            "are you a robot",
            "unusual traffic",
            "verify your identity",
            "access denied",
        )
        return any(m in body for m in markers)

    # Every ₹ amount shown on a card, in reading order: the selling price first, then the struck-through MRP.
    # Flipkart's CSS class names are hashed and change without notice (the old ._30jeq3 / .Nx9bqj selectors
    # stopped matching and every price came back empty), so read the visible ₹ text instead.
    _RUPEE_AMOUNTS_JS = r"""el => [...el.querySelectorAll('*')]
        .filter(e => e.children.length === 0 && /^₹\s?[\d,]+$/.test((e.textContent || '').trim()))
        .map(e => e.textContent.trim())"""

    @staticmethod
    def _parse_cards(page, page_no: int, offset: int, seen: set | None = None) -> list[dict]:
        """Parse product cards. Flipkart search cards carry a data-id attr
        that holds the product/FSN identifier.

        ``offset`` is how many distinct products earlier pages already yielded. A product can appear twice
        on one results page (it did — positions 1 and 4), so only the first occurrence counts; otherwise every
        rank below the repeat is off by one and tracked positions drift.
        """
        seen = set() if seen is None else seen
        cards = page.query_selector_all("[data-id]")
        out: list[dict] = []
        for card in cards:
            fsn = card.get_attribute("data-id") or ""
            if not fsn or fsn in seen:
                continue
            seen.add(fsn)
            title = None
            for sel in ("a[title]", ".s1Q9rs", "._4rR01T", ".wjcEIp"):
                el = card.query_selector(sel)
                if el:
                    title = (el.get_attribute("title")
                             or el.inner_text() or "").strip() or None
                    break
            price = mrp = None
            try:
                amounts = card.evaluate(RankHarvester._RUPEE_AMOUNTS_JS) or []
            except Exception:  # noqa: BLE001 — a card we can't read must not sink the whole page
                amounts = []
            if amounts:
                price = RankHarvester._parse_price(amounts[0])
                if len(amounts) > 1:
                    mrp = RankHarvester._parse_price(amounts[1])
            out.append({
                "fsn": fsn,
                "position": offset + len(out) + 1,
                "page": page_no,
                "price": price,
                "mrp": mrp,
                "title": title,
            })
        return out

    @staticmethod
    def _parse_price(raw) -> float | None:
        if raw is None:
            return None
        if isinstance(raw, (int, float)):
            return float(raw)
        digits = re.sub(r"[^\d.]", "", str(raw))
        try:
            return float(digits) if digits else None
        except ValueError:
            return None

    def _polite_delay(self) -> None:
        delay = random.uniform(self.min_delay_s, self.max_delay_s)
        log.info("polite delay %.1fs before next page", delay)
        import time

        time.sleep(delay)

    # ------------------------------------------------------- backoff state
    def _kv_conn(self) -> sqlite3.Connection:
        try:
            from fkpulse.db import get_conn  # Agent A's helper when present

            return get_conn(self.db_path)
        except Exception:
            conn = sqlite3.connect(self.db_path)
            conn.execute(
                "CREATE TABLE IF NOT EXISTS kv_config"
                "(key TEXT PRIMARY KEY, value TEXT)"
            )
            return conn

    def _get_backoff_until(self) -> datetime | None:
        try:
            conn = self._kv_conn()
            row = conn.execute(
                "SELECT value FROM kv_config WHERE key=?", (BACKOFF_KEY,)
            ).fetchone()
            conn.close()
        except Exception:
            return None
        if not row:
            return None
        raw = row["value"] if isinstance(row, sqlite3.Row) else row[0]
        try:
            dt = datetime.fromisoformat(raw)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return None

    def _set_backoff_until(self, until: datetime) -> None:
        try:
            conn = self._kv_conn()
            conn.execute(
                "INSERT INTO kv_config(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (BACKOFF_KEY, until.isoformat()),
            )
            conn.commit()
            conn.close()
        except Exception as exc:
            log.warning("could not persist harvester backoff flag: %s", exc)
