"""FK-Pulse recommendation engine (Agent B).

Rule-based: every rule is a ``Rule`` dataclass in the ``RULES`` registry and
every emitted recommendation cites its report chapter via ``rationale_ref``.

``generate(db_path, config)`` runs all rules and inserts new rows into
``recommendations``, deduplicating against existing *open* recommendations by
(rule_id, fsn). Rules read the freshest KPI values from ``metrics_snapshots``
(so run ``kpi.compute_all`` first — the digest job does exactly this) and query
base tables directly for contextual detail.

Event dates (BBD / Diwali) are rule-based approximations — Flipkart announces
exact dates late; see EVT-01 constants below.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Callable

# --- Event date constants (rule-based approximations, Ch.3/6) ----------------
# Big Billion Days historically starts around Sep 22; Diwali sale around Oct 20.
# These are planning approximations only — confirm announced dates in Seller Hub.
BBD_MONTH_DAY = (9, 22)       # Big Billion Days ~Sep 22 (approximation)
DIWALI_MONTH_DAY = (10, 20)   # Diwali sale ~Oct 20 (approximation)
EVT_NOMINATION_LEAD_DAYS = 56  # submit deals by T-8 weeks

# Usual Price 15-day rule (Ch.3/6): no promotions for 15 days after listing
USUAL_PRICE_WINDOW_DAYS = 15

# Commission cliff (Ch.5): crossing Rs 1,000 moves the listing into a higher
# commission tier; simplified guard band below. Verify current rate card.
CLIFF_THRESHOLD = 1000.0
CLIFF_BAND_UPPER = 1150.0
CLIFF_REPOSITION_PRICE = 999

TITLE_COVERAGE_MIN = 0.6
RANK_VISIBILITY_FLOOR = 20
RTO_RATE_ACCOUNT_MAX = 0.20
RTO_RATE_FSN_MAX = 0.25
TACOS_MAX = 0.35
ADS_COLDSTART_REVIEW_MIN = 20
SETTLEMENT_LAG_MAX_DAYS = 12
RAT01_HIGH_SEVERITY_BELOW = 3.8
STK01_HIGH_SEVERITY_BELOW = 7
OPS01_HIGH_SEVERITY_ABOVE = 0.01
ORDERS_WINDOW_DAYS = 30


@dataclass
class Finding:
    """One rule hit. ``fsn`` is None for account-scope findings."""
    scope: str                 # "account" | "fsn:<FSN>"
    fsn: str | None
    rule_id: str
    severity: str              # "low" | "medium" | "high"
    title: str
    detail: str


@dataclass
class Rule:
    id: str
    severity: str              # default severity; checks may escalate per finding
    scope: str                 # "account" | "fsn" | "account+fsn"
    check: Callable[[sqlite3.Connection, dict], list[Finding]]
    rationale_ref: str         # report chapter citation, e.g. "Ch.2 LQS"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _thresholds(config: dict) -> dict:
    # defaults mirror config.example.yaml in SPEC.md
    defaults = {
        "cancellation_max": 0.0025,
        "rtd_breach_max": 0.005,
        "rating_min": 4.2,
        "stock_cover_days_min": 14,
        "price_vs_median_max": 1.05,
        "attribute_completeness_min": 0.9,
    }
    defaults.update((config or {}).get("thresholds", {}) or {})
    return defaults


def _snap(db: sqlite3.Connection, scope: str, key: str) -> float | None:
    """Latest metrics_snapshots value for (scope, key); None if absent/NULL."""
    row = db.execute(
        """SELECT value FROM metrics_snapshots
           WHERE scope = ? AND key = ? ORDER BY id DESC LIMIT 1""",
        (scope, key),
    ).fetchone()
    return row[0] if row else None


def _snap_rows(db: sqlite3.Connection, scope: str, key: str) -> list[sqlite3.Row]:
    """Latest metrics_snapshots rows for (scope, key) — one per distinct detail."""
    return db.execute(
        """SELECT m.value, m.detail FROM metrics_snapshots m
           JOIN (SELECT detail, MAX(id) AS max_id FROM metrics_snapshots
                 WHERE scope = ? AND key = ? GROUP BY detail) latest
             ON m.id = latest.max_id""",
        (scope, key),
    ).fetchall()


def _parse_attrs(attributes_json: str | None) -> dict:
    if not attributes_json:
        return {}
    try:
        data = json.loads(attributes_json)
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def _orders_in_window(db: sqlite3.Connection, fsn: str | None = None) -> int:
    sql = """SELECT COUNT(*) FROM orders
             WHERE julianday(order_date) >= julianday('now') - ?"""
    params: list = [ORDERS_WINDOW_DAYS]
    if fsn is not None:
        sql += " AND fsn = ?"
        params.append(fsn)
    return db.execute(sql, params).fetchone()[0]


# --------------------------------------------------------------------------- #
# rule checks — each takes (db, config) and returns Findings
# --------------------------------------------------------------------------- #

def _check_lqs01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    thr = _thresholds(config)["attribute_completeness_min"]
    findings = []
    for l in db.execute("SELECT * FROM listings").fetchall():
        total = l["attributes_total"] or 0
        if not total:
            continue
        attrs = _parse_attrs(l["attributes_json"])
        filled = sum(1 for v in attrs.values() if v not in (None, "", [], {}))
        completeness = filled / total
        if completeness < thr:
            # Known-missing = attribute keys present but empty. The category
            # template's unfilled attribute *names* are not in the DB, so
            # additional gaps are reported as a count (approximation).
            missing = [k for k, v in attrs.items() if v in (None, "", [], {})]
            unknown = max(total - len(attrs), 0)
            parts = list(missing)
            if unknown:
                parts.append(f"{unknown} more template attribute(s) not present")
            findings.append(Finding(
                scope=f"fsn:{l['fsn']}", fsn=l["fsn"], rule_id="LQS-01",
                severity="medium",
                title=f"Incomplete attributes on {l['fsn']}",
                detail=(f"Attribute completeness {completeness:.0%} "
                        f"({filled}/{total}, threshold {thr:.0%}). "
                        f"Fill missing: {', '.join(parts) if parts else 'n/a'}.")))
    return findings


def _check_lqs02(db: sqlite3.Connection, config: dict) -> list[Finding]:
    findings = []
    for l in db.execute(
            "SELECT fsn, image_count FROM listings "
            "WHERE image_count IS NOT NULL").fetchall():
        if l["image_count"] < 3:
            findings.append(Finding(
                scope=f"fsn:{l['fsn']}", fsn=l["fsn"], rule_id="LQS-02",
                severity="medium",
                title=f"Too few images on {l['fsn']}",
                detail=(f"image_count={l['image_count']} (< 3). "
                        "Add at least 3 compliant images to lift LQS.")))
    return findings


def _check_rat01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    thr = _thresholds(config)["rating_min"]
    findings = []
    unknown: list[sqlite3.Row] = []
    for l in db.execute(
            "SELECT fsn, sku, rating_avg, rating_count FROM listings "
            "WHERE rating_avg IS NOT NULL").fetchall():
        if l["rating_avg"] >= thr:
            continue
        if l["rating_count"] is None:
            unknown.append(l)       # how many ratings stand behind it is not known: grouped below, not one card each
            continue
        high = l["rating_avg"] < RAT01_HIGH_SEVERITY_BELOW
        findings.append(Finding(
            scope=f"fsn:{l['fsn']}", fsn=l["fsn"], rule_id="RAT-01",
            severity="high" if high else "medium",
            title=f"Low rating on {l['fsn']}",
            detail=(f"rating_avg {l['rating_avg']:.2f} below threshold {thr}, based on {l['rating_count']} ratings. "
                    "Investigate recent negative reviews and product/quality issues.")))
    if unknown:
        worst = sorted(unknown, key=lambda r: r["rating_avg"])[:5]
        findings.append(Finding(
            scope="account", fsn=None, rule_id="RAT-01", severity="low",
            title=f"{len(unknown)} listings show a rating below {thr}",
            detail=(f"{len(unknown)} listings have a rating under {thr} (lowest: "
                    + ", ".join(f"{r['sku']} {r['rating_avg']:.2f}" for r in worst)
                    + "), but the number of ratings behind each is not known, and a rating from a handful of reviews is a weak signal. "
                      "Check the ratings count on Flipkart before acting; the API sync fills the count once it is connected.")))
    return findings


def _check_rat02(db: sqlite3.Connection, config: dict) -> list[Finding]:
    findings = []
    for l in db.execute("SELECT fsn FROM listings").fetchall():
        fsn = l["fsn"]
        velocity = _snap(db, f"fsn:{fsn}", "rating_velocity_7d")
        if velocity == 0 and _orders_in_window(db, fsn) > 0:
            findings.append(Finding(
                scope=f"fsn:{fsn}", fsn=fsn, rule_id="RAT-02",
                severity="low",
                title=f"Review gap on {fsn}",
                detail=("No new ratings in 7 days despite recent orders. "
                        "Encourage reviews (packaging insert, post-delivery "
                        "follow-up) to protect conversion.")))
    return findings


def _check_stk01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    thr = _thresholds(config)["stock_cover_days_min"]
    findings = []
    for l in db.execute("SELECT fsn FROM listings").fetchall():
        fsn = l["fsn"]
        scope = f"fsn:{fsn}"
        cover = _snap(db, scope, "stock_cover_days")
        if cover is None or cover >= thr:
            continue
        row = db.execute(
            """SELECT detail FROM metrics_snapshots
               WHERE scope = ? AND key = 'stock_cover_days'
               ORDER BY id DESC LIMIT 1""", (scope,)).fetchone()
        avg_daily = 0.0
        if row and row["detail"]:
            try:
                avg_daily = json.loads(row["detail"]).get(
                    "avg_daily_units", 0.0) or 0.0
            except (ValueError, TypeError):
                avg_daily = 0.0
        restock = round(avg_daily * 30)  # velocity x 30 days
        high = cover < STK01_HIGH_SEVERITY_BELOW
        findings.append(Finding(
            scope=scope, fsn=fsn, rule_id="STK-01",
            severity="high" if high else "medium",
            title=f"Low stock cover on {fsn}",
            detail=(f"Stock cover {cover:.1f} days (< {thr}). Suggested "
                    f"restock: ~{restock} units (30 days at current velocity "
                    f"of {avg_daily:.2f} units/day) before rank decays.")))
    return findings


def _check_prc02(db: sqlite3.Connection, config: dict) -> list[Finding]:
    thr = _thresholds(config)["price_vs_median_max"]
    findings = []
    for l in db.execute(
            "SELECT fsn, price FROM listings WHERE price IS NOT NULL").fetchall():
        pvm = _snap(db, f"fsn:{l['fsn']}", "price_vs_median")
        if pvm is not None and pvm > thr:
            median = l["price"] / pvm
            findings.append(Finding(
                scope=f"fsn:{l['fsn']}", fsn=l["fsn"], rule_id="PRC-02",
                severity="medium",
                title=f"Price above SERP median on {l['fsn']}",
                detail=(f"Price Rs {l['price']:.0f} is {pvm:.1%} of the SERP "
                        f"median (~Rs {median:.0f}), above the {thr:.0%} cap — "
                        "Price Value Score risk; consider re-pricing.")))
    return findings


def _check_prc03(db: sqlite3.Connection, config: dict) -> list[Finding]:
    findings = []
    for l in db.execute(
            "SELECT fsn, price FROM listings WHERE price IS NOT NULL").fetchall():
        price = l["price"]
        if CLIFF_THRESHOLD < price < CLIFF_BAND_UPPER:
            findings.append(Finding(
                scope=f"fsn:{l['fsn']}", fsn=l["fsn"], rule_id="PRC-03",
                severity="medium",
                title=f"Commission-cliff pricing on {l['fsn']}",
                detail=(f"Price Rs {price:.0f} sits just above the Rs 1,000 "
                        f"commission tier boundary. Consider Rs "
                        f"{CLIFF_REPOSITION_PRICE} repositioning — net payout "
                        "may be higher below the cliff. Verify the current "
                        "rate card in Seller Hub.")))
    return findings


def _check_ops01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    thr = _thresholds(config)["cancellation_max"]
    rate = _snap(db, "account", "cancellation_rate_30d")
    if rate is None or rate <= thr:
        return []
    high = rate > OPS01_HIGH_SEVERITY_ABOVE
    return [Finding(
        scope="account", fsn=None, rule_id="OPS-01",
        severity="high" if high else "medium",
        title="Seller cancellation rate above limit",
        detail=(f"cancellation_rate_30d {rate:.2%} exceeds the {thr:.2%} max "
                "(performance penalty risk). Check stock accuracy and "
                "fulfilment capacity."))]


def _check_ops02(db: sqlite3.Connection, config: dict) -> list[Finding]:
    thr = _thresholds(config)["rtd_breach_max"]
    rate = _snap(db, "account", "rtd_breach_rate_30d")
    if rate is None or rate <= thr:
        return []
    return [Finding(
        scope="account", fsn=None, rule_id="OPS-02",
        severity="medium",
        title="RTD breach rate above limit",
        detail=(f"rtd_breach_rate_30d {rate:.2%} exceeds the {thr:.2%} max. "
                "Tighten dispatch SLAs and pickup scheduling."))]


def _top_rto_pincodes(db: sqlite3.Connection, fsn: str | None = None) -> list:
    sql = """SELECT pincode, COUNT(*) AS c FROM orders
             WHERE rto = 1 AND pincode IS NOT NULL
               AND julianday(order_date) >= julianday('now') - ?"""
    params: list = [ORDERS_WINDOW_DAYS]
    if fsn is not None:
        sql += " AND fsn = ?"
        params.append(fsn)
    sql += " GROUP BY pincode ORDER BY c DESC LIMIT 3"
    return db.execute(sql, params).fetchall()


def _check_rto01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    findings = []
    rate = _snap(db, "account", "rto_rate_30d")
    if rate is not None and rate > RTO_RATE_ACCOUNT_MAX:
        pins = ", ".join(f"{p['pincode']} ({p['c']})"
                         for p in _top_rto_pincodes(db)) or "n/a"
        findings.append(Finding(
            scope="account", fsn=None, rule_id="RTO-01",
            severity="medium",
            title="Account RTO rate above 20%",
            detail=(f"rto_rate_30d {rate:.1%} > {RTO_RATE_ACCOUNT_MAX:.0%}. "
                    f"Top RTO pincode clusters: {pins}. Consider COD "
                    "verification or restricting high-RTO pincodes.")))
    # per-FSN: rto share of that FSN's 30d orders
    for l in db.execute("SELECT fsn FROM listings").fetchall():
        fsn = l["fsn"]
        r = db.execute(
            """SELECT COUNT(*) AS n, COALESCE(SUM(rto), 0) AS rto FROM orders
               WHERE fsn = ?
                 AND julianday(order_date) >= julianday('now') - ?""",
            (fsn, ORDERS_WINDOW_DAYS)).fetchone()
        if r["n"] and r["rto"] / r["n"] > RTO_RATE_FSN_MAX:
            pins = ", ".join(f"{p['pincode']} ({p['c']})"
                             for p in _top_rto_pincodes(db, fsn)) or "n/a"
            findings.append(Finding(
                scope=f"fsn:{fsn}", fsn=fsn, rule_id="RTO-01",
                severity="medium",
                title=f"High RTO rate on {fsn}",
                detail=(f"FSN RTO rate {r['rto'] / r['n']:.1%} > "
                        f"{RTO_RATE_FSN_MAX:.0%}. Top RTO pincode clusters: "
                        f"{pins}.")))
    return findings


def _check_set01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    lag = _snap(db, "account", "settlement_lag_days_avg")
    if lag is None or lag <= SETTLEMENT_LAG_MAX_DAYS:
        return []
    return [Finding(
        scope="account", fsn=None, rule_id="SET-01",
        severity="low",
        title="Settlement lag above 12 days",
        detail=(f"settlement_lag_days_avg {lag:.1f} days > "
                f"{SETTLEMENT_LAG_MAX_DAYS}. Seller-tier dependent; plan "
                "working capital accordingly."))]


def _check_ads01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    tacos = _snap(db, "account", "tacos_30d")
    if tacos is not None:
        if tacos > TACOS_MAX:
            return [Finding(
                scope="account", fsn=None, rule_id="ADS-01",
                severity="medium",
                title="TACoS above 35%",
                detail=(f"tacos_30d {tacos:.1%} > {TACOS_MAX:.0%}. Audit "
                        "campaigns: pause bleeders, tighten targeting, "
                        "improve listing conversion before scaling spend."))]
        return []
    if _hub(db, "ads", "spend") is not None:
        return []  # Seller Hub reports the ads directly (HUB-04 judges them); "no ad data" would be false
    known = db.execute(
        "SELECT COUNT(review_count), COALESCE(SUM(review_count), 0) FROM listings").fetchone()
    if known[0] == 0:
        return []  # review counts were never collected: unknown, not "zero reviews"
    reviews = known[1]
    if reviews < ADS_COLDSTART_REVIEW_MIN:
        return [Finding(
            scope="account", fsn=None, rule_id="ADS-01",
            severity="low",
            title="CPC cold-start not measurable",
            detail=(f"No ad data (TACoS NULL) and only {reviews} reviews "
                    f"(< {ADS_COLDSTART_REVIEW_MIN}). Import the Flipkart "
                    "ads report CSV to enable TACoS tracking."))]
    return []


def _days_until(month_day: tuple[int, int], today: date) -> int:
    """Days until the next occurrence of (month, day)."""
    month, day = month_day
    candidate = date(today.year, month, day)
    if candidate < today:
        candidate = date(today.year + 1, month, day)
    return (candidate - today).days


def _check_evt01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    today = datetime.now().date()
    findings = []
    for name, md in (("Big Billion Days", BBD_MONTH_DAY),
                     ("Diwali sale", DIWALI_MONTH_DAY)):
        days = _days_until(md, today)
        if 0 <= days <= EVT_NOMINATION_LEAD_DAYS:
            findings.append(Finding(
                scope="account", fsn=None, rule_id="EVT-01",
                severity="low",
                title=f"{name} in {days} days — nominate deals",
                detail=(f"{name} is ~{days} days away (rule-date "
                        "approximation). Deal nominations typically close "
                        "~8 weeks out — submit deals now. Confirm announced "
                        "dates in Seller Hub.")))
    return findings


def _check_evt02(db: sqlite3.Connection, config: dict) -> list[Finding]:
    findings = []
    for l in db.execute(
            "SELECT fsn, listed_date FROM listings").fetchall():
        if _snap(db, f"fsn:{l['fsn']}", "usual_price_window_open") != 1:
            continue
        day_txt = ""
        if l["listed_date"]:
            try:
                age = (datetime.now()
                       - datetime.fromisoformat(str(l["listed_date"]))).days
                day_txt = f" (day {age + 1} of {USUAL_PRICE_WINDOW_DAYS})"
            except ValueError:
                pass
        findings.append(Finding(
            scope=f"fsn:{l['fsn']}", fsn=l["fsn"], rule_id="EVT-02",
            severity="medium",
            title=f"Usual Price window open on {l['fsn']}",
            detail=(f"Listed <{USUAL_PRICE_WINDOW_DAYS} days ago{day_txt}: "
                    "no promotions/discounts until day 15 — ads only, to "
                    "protect Usual Price eligibility for events.")))
    return findings


def _check_kwd01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    findings = []
    for l in db.execute("SELECT fsn, title FROM listings").fetchall():
        fsn = l["fsn"]
        coverage = _snap(db, f"fsn:{fsn}", "title_keyword_coverage")
        if coverage is None or coverage >= TITLE_COVERAGE_MIN:
            continue
        title = (l["title"] or "").lower()
        missing = []
        for k in db.execute(
                "SELECT keyword FROM tracked_keywords "
                "WHERE fsn = ? AND active = 1", (fsn,)).fetchall():
            head = str(k["keyword"]).split()[0] if k["keyword"] else ""
            if head and head.lower() not in title:
                missing.append(head)
        findings.append(Finding(
            scope=f"fsn:{fsn}", fsn=fsn, rule_id="KWD-01",
            severity="medium",
            title=f"Title keyword coverage low on {fsn}",
            detail=(f"title_keyword_coverage {coverage:.0%} < "
                    f"{TITLE_COVERAGE_MIN:.0%}. Rewrite the title to include "
                    f"missing head terms: {', '.join(missing) or 'n/a'}.")))
    return findings


def _check_rnk01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    findings = []
    for l in db.execute("SELECT fsn FROM listings").fetchall():
        fsn = l["fsn"]
        if _orders_in_window(db, fsn) <= 0:
            continue
        bad = []
        for row in _snap_rows(db, f"fsn:{fsn}", "rank_best_position_7d"):
            if row["value"] is not None and row["value"] > RANK_VISIBILITY_FLOOR:
                bad.append(f"{row['detail']} (best pos {int(row['value'])})")
        if bad:
            findings.append(Finding(
                scope=f"fsn:{fsn}", fsn=fsn, rule_id="RNK-01",
                severity="medium",
                title=f"Visibility decay on {fsn}",
                detail=("Best 7d rank beyond position "
                        f"{RANK_VISIBILITY_FLOOR} for tracked keyword(s): "
                        f"{'; '.join(bad)} — despite recent orders. Improve "
                        "listing quality/price competitiveness to recover "
                        "share of search.")))
    return findings


# --------------------------------------------------------------------------- #
# Seller Hub rules (HUB-*) — read from hub_metrics, filled by fkpulse.sellerhub
# --------------------------------------------------------------------------- #
# These use the numbers Flipkart itself judges a seller on (Growth -> Business Health) rather than our own
# recomputation from orders — the orders table has never received data, so OPS-01/OPS-02 could not fire.
HUB_ADS_ROI_MIN = 2.0              # ROI = revenue / ad spend; below ~2 is almost certainly a loss after fees and COGS
HUB_IMPRESSIONS_DROP_PCT = 30.0    # warn when 30-day impressions fell by more than this
HUB_PRICE_COMPETITIVE_MIN = 60.0   # % of listings priced competitively on Flipkart
HUB_WALLET_LOW = 500.0


def _hub(db: sqlite3.Connection, area: str, key: str) -> float | None:
    """Latest Seller Hub value; None if never read (or the hub tables don't exist yet)."""
    try:
        row = db.execute(
            """SELECT value FROM hub_metrics WHERE area = ? AND key = ? AND value IS NOT NULL
               ORDER BY captured_at DESC, id DESC LIMIT 1""", (area, key)).fetchone()
    except sqlite3.OperationalError:
        return None
    return None if row is None else row[0]


def _check_hub01(db: sqlite3.Connection, config: dict) -> list[Finding]:
    limit = _thresholds(config)["cancellation_max"] * 100
    seller, pre = _hub(db, "business_health", "seller_cancel_pct"), _hub(db, "business_health", "pre_dispatch_cancel_pct")
    if seller is None or seller <= limit:
        return []
    return [Finding(
        scope="account", fsn=None, rule_id="HUB-01", severity="high",
        title=f"Seller cancellations {seller:.2f}% (limit {limit:.2f}%)",
        detail=(f"Flipkart's Business Health shows {seller:.2f}% seller cancellations"
                + (f" and {pre:.2f}% pre-dispatch cancellations" if pre is not None else "")
                + f" over 30 days, far above the {limit:.2f}% limit. Cancelled orders hurt ranking and can lead to penalties or "
                  "suspension. Usual cause: stock shown on Flipkart that isn't actually available — reconcile quantities, set "
                  "a safety buffer, and mark an item out of stock the moment the last unit ships."),
    )]


def _check_hub02(db: sqlite3.Connection, config: dict) -> list[Finding]:
    limit = _thresholds(config)["rtd_breach_max"] * 100
    dbd = _hub(db, "business_health", "dbd_breach_pct")
    if dbd is None or dbd <= limit:
        return []
    return [Finding(
        scope="account", fsn=None, rule_id="HUB-02", severity="high",
        title=f"Dispatch-by-date breaches {dbd:.1f}% (limit {limit:.1f}%)",
        detail=(f"{dbd:.1f}% of orders in the last 30 days missed the dispatch-by date. Late dispatch drives cancellations, "
                "poor delivery promises and lost ranking. Check the handling time set on listings, pack the same day orders "
                "arrive, and use the 'To Pack / To Dispatch' queues daily."),
    )]


def _check_hub03(db: sqlite3.Connection, config: dict) -> list[Finding]:
    now, prev = _hub(db, "traffic", "impressions_30d"), _hub(db, "traffic", "impressions_prev_30d")
    if not now or not prev or prev <= 0:
        return []
    change = (now - prev) / prev * 100
    if change > -HUB_IMPRESSIONS_DROP_PCT:
        return []
    try:
        drops = db.execute(
            """SELECT sku, impressions_drop, units_lost FROM hub_traffic_drops
               WHERE captured_at = (SELECT MAX(captured_at) FROM hub_traffic_drops) ORDER BY impressions_drop DESC LIMIT 4""").fetchall()
    except sqlite3.OperationalError:
        drops = []
    headline = _hub(db, "traffic", "impressions_change_pct")
    note = (f" (Flipkart's own Traffic Report headline says {headline:.0f}%, measured against a different baseline.)"
            if headline is not None and abs(headline - change) >= 5 else "")
    worst = "; ".join(f"{d['sku']} (-{int(d['impressions_drop']):,} views, ~{int(d['units_lost'])} units)" for d in drops)
    return [Finding(
        scope="account", fsn=None, rule_id="HUB-03", severity="high" if change <= -50 else "medium",
        title=f"Impressions down {abs(change):.0f}% over 30 days ({int(prev):,} → {int(now):,})",
        detail=("Shoppers are seeing your listings much less" + note + ". " + ("Biggest losers: " + worst + ". " if worst else ""))
               + "Check for listing suppression, stock gaps, price/quality flags, and whether ads are still running on these products.",
    )]


def _check_hub04(db: sqlite3.Connection, config: dict) -> list[Finding]:
    spend, roi = _hub(db, "ads", "spend"), _hub(db, "ads", "roi")
    out: list[Finding] = []
    if spend and spend > 0 and roi is not None and roi < HUB_ADS_ROI_MIN:
        acos = 100 / roi if roi else float("inf")
        out.append(Finding(
            scope="account", fsn=None, rule_id="HUB-04", severity="medium",
            title=f"Ads ROI {roi:.2f}: ₹{spend:,.0f} spent for about ₹{spend * roi:,.0f} of sales",
            detail=(f"Every ₹1 of ads returns about ₹{roi:.2f} (ACOS ≈ {acos:.0f}%). After Flipkart's commission, fees, returns and "
                    "your product cost that is almost certainly a loss. Pause or narrow the campaign to its best-converting "
                    "products and keywords before spending more."),
        ))
    wallet = _hub(db, "ads", "wallet_balance")
    if wallet is not None and spend and wallet < HUB_WALLET_LOW:
        out.append(Finding(
            scope="account", fsn=None, rule_id="HUB-04", severity="low", title=f"Ads wallet low: ₹{wallet:,.0f}",
            detail="Campaigns stop serving when the wallet runs out; top it up if the ads are meant to keep running."))
    return out


def _check_hub05(db: sqlite3.Connection, config: dict) -> list[Finding]:
    blocked = _hub(db, "listing_states", "blocked")
    if not blocked:
        return []
    return [Finding(
        scope="account", fsn=None, rule_id="HUB-05", severity="high",
        title=f"{int(blocked)} listing{'s are' if blocked != 1 else ' is'} blocked",
        detail="Blocked listings cannot sell. Seller Hub → Listings → Blocked shows the reason for each (policy, quality or "
               "documentation) and what is needed to unblock it.",
    )]


def _check_hub06(db: sqlite3.Connection, config: dict) -> list[Finding]:
    negative = _hub(db, "payments", "net_payable_negative")
    zero, listed = _hub(db, "payments", "previous_payouts_zero"), _hub(db, "payments", "previous_payouts_listed")
    est = _hub(db, "payments", "estimate_0_postpaid")
    if not negative and not (zero and zero >= 2):
        return []
    parts = []
    if zero is not None and listed:
        parts.append(f"{int(zero)} of the last {int(listed)} payouts were ₹0")
    if est is not None and est < 0:
        parts.append(f"the next estimate shows ₹{est:,.0f} on postpaid (COD) orders")
    return [Finding(
        scope="account", fsn=None, rule_id="HUB-06", severity="high",
        title="Flipkart is paying you ₹0 — net payable is negative",
        detail=("; ".join(parts).capitalize() + ". " if parts else "")
               + "Returns, fees, penalties and ad spend are exceeding sales, so payouts are being held back and carried forward. "
                 "Open Payments → Order-wise Settlements to see which deductions dominate (usually returns/RTO and ads).",
    )]


def _check_hub07(db: sqlite3.Connection, config: dict) -> list[Finding]:
    try:
        rows = db.execute(
            """SELECT r.sku, r.title, r.quality, l.fsn FROM hub_listing_rows r LEFT JOIN listings l ON l.sku = r.sku
               WHERE r.captured_at = (SELECT MAX(captured_at) FROM hub_listing_rows) AND r.quality IN ('Bad', 'Poor')""").fetchall()
    except sqlite3.OperationalError:
        return []
    return [Finding(
        scope=f"fsn:{r['fsn']}" if r["fsn"] else "account", fsn=r["fsn"], rule_id="HUB-07", severity="medium",
        title=f"Flipkart rates listing quality '{r['quality']}' — {r['sku']}",
        detail=f"{r['title'][:90]}. Open it in Listings → Listing Quality to see which attributes, images or title issues Flipkart flags.",
    ) for r in rows]


def _check_hub08(db: sqlite3.Connection, config: dict) -> list[Finding]:
    comp = _hub(db, "business_health", "competitive_flipkart_pct")
    if comp is None or comp >= HUB_PRICE_COMPETITIVE_MIN:
        return []
    return [Finding(
        scope="account", fsn=None, rule_id="HUB-08", severity="medium",
        title=f"Only {comp:.0f}% of your listings are price-competitive on Flipkart",
        detail="Flipkart compares your selling price with similar products. Price Health & Recommendations in Business Health shows "
               "which listings are above the competitive range; repricing those (or improving the offer) lifts their visibility.",
    )]


# --------------------------------------------------------------------------- #
# RULES registry
# --------------------------------------------------------------------------- #

RULES: list[Rule] = [
    Rule("LQS-01", "medium", "fsn", _check_lqs01,
         "Ch.1/2 — Listing Quality Score: attribute completeness"),
    Rule("LQS-02", "medium", "fsn", _check_lqs02,
         "Ch.1/2 — Listing Quality Score: image-count compliance"),
    Rule("RAT-01", "medium", "fsn", _check_rat01,
         "Ch.2 — Rating average below threshold"),
    Rule("RAT-02", "low", "fsn", _check_rat02,
         "Ch.2 — Review velocity gap despite orders"),
    Rule("STK-01", "medium", "fsn", _check_stk01,
         "Ch.1/5 — Stockout risk drives rank decay"),
    Rule("PRC-02", "medium", "fsn", _check_prc02,
         "Ch.5 — Price Value Score: price vs category median"),
    Rule("PRC-03", "medium", "fsn", _check_prc03,
         "Ch.5 — Commission cliff at Rs 1,000 (simplified guard band)"),
    Rule("OPS-01", "medium", "account", _check_ops01,
         "Ch.5 — Seller cancellation rate limit"),
    Rule("OPS-02", "medium", "account", _check_ops02,
         "Ch.5 — RTD breach limit"),
    Rule("RTO-01", "medium", "account+fsn", _check_rto01,
         "Ch.5 — RTO rate by SKU/pincode cluster"),
    Rule("SET-01", "low", "account", _check_set01,
         "Ch.5 — Settlement lag / working capital"),
    Rule("ADS-01", "medium", "account", _check_ads01,
         "Ch.3/6 — Ad efficiency (TACoS); cold-start caveat"),
    Rule("EVT-01", "low", "account", _check_evt01,
         "Ch.3/6 — Event deal-nomination lead time (rule dates approx.)"),
    Rule("EVT-02", "medium", "fsn", _check_evt02,
         "Ch.3/6 — Usual Price 15-day rule"),
    Rule("KWD-01", "medium", "fsn", _check_kwd01,
         "Ch.1/2 — Title keyword coverage"),
    Rule("RNK-01", "medium", "fsn", _check_rnk01,
         "Ch.1/3 — Share of search / rank visibility decay"),
    Rule("HUB-01", "high", "account", _check_hub01, "Seller Hub — Business Health: seller cancellations"),
    Rule("HUB-02", "high", "account", _check_hub02, "Seller Hub — Business Health: dispatch-by-date breaches"),
    Rule("HUB-03", "medium", "account", _check_hub03, "Seller Hub — Traffic Report: impressions trend"),
    Rule("HUB-04", "medium", "account", _check_hub04, "Seller Hub — Ads: ROI and wallet"),
    Rule("HUB-05", "high", "account", _check_hub05, "Seller Hub — Listings: blocked listings"),
    Rule("HUB-06", "high", "account", _check_hub06, "Seller Hub — Payments: negative net payable"),
    Rule("HUB-07", "medium", "fsn", _check_hub07, "Seller Hub — Listings: Flipkart's own listing-quality label"),
    Rule("HUB-08", "medium", "account", _check_hub08, "Seller Hub — Business Health: price competitiveness"),
]


def generate(db_path: str, config: dict, now: datetime | None = None) -> int:
    """Run all RULES; keep the open recommendations true to the latest data. Returns the number of NEW rows inserted.

    * a finding with no open recommendation yet -> a new one is opened
    * a finding that already has an open recommendation -> its severity/title/detail are refreshed, so the numbers on
      screen are today's, not those of the first reading (they used to freeze: "3.45%" stayed after a re-read)
    * an open recommendation whose finding is gone -> marked 'resolved' (the problem cleared); ones you marked
      'done' are never touched
    """
    now = now or datetime.now()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    inserted = 0
    try:
        current: set[tuple[str, str | None]] = set()
        for rule in RULES:
            for f in rule.check(conn, config):
                current.add((f.rule_id, f.fsn))
                exists = conn.execute(
                    """SELECT id FROM recommendations
                       WHERE rule_id = ? AND status = 'open'
                         AND (fsn = ? OR (fsn IS NULL AND ? IS NULL))
                       LIMIT 1""",
                    (f.rule_id, f.fsn, f.fsn),
                ).fetchone()
                if exists:
                    conn.execute("UPDATE recommendations SET severity = ?, title = ?, detail = ? WHERE id = ?",
                                 (f.severity, f.title, f.detail, exists["id"]))
                    continue
                conn.execute(
                    """INSERT INTO recommendations
                       (scope, fsn, rule_id, severity, title, detail,
                        status, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)""",
                    (f.scope, f.fsn, f.rule_id, f.severity, f.title,
                     f.detail, now.isoformat()),
                )
                inserted += 1
        known_rules = {r.id for r in RULES}
        for row in conn.execute("SELECT id, rule_id, fsn FROM recommendations WHERE status = 'open'").fetchall():
            if row["rule_id"] in known_rules and (row["rule_id"], row["fsn"]) not in current:
                conn.execute("UPDATE recommendations SET status = 'resolved' WHERE id = ?", (row["id"],))
        conn.commit()
        return inserted
    finally:
        conn.close()
