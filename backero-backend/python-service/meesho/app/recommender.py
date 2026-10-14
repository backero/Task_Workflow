"""recommender.py — rule-based recommendation engine.

Encodes the Meesho ranking research as 18 rules, evaluated per listing
against the latest snapshot plus 7-day aggregates (and one account-level
rule, UPLOAD_GAP). Dedupe happens via database.has_open_rec /
database.has_unacked_alert. No Flask imports; app.config and app.database
are lazy-imported inside functions so this module is import-safe anywhere.

Contract: evaluate_all(conn) -> int  (count of new recommendations + alerts)
"""

from datetime import datetime

# Default thresholds (mirror config.example.yaml; overridable via
# app.config.get("thresholds.<key>", default)).
THRESHOLD_DEFAULTS = {
    "qs_warn": 15.0,
    "qs_block": 25.0,
    "rating_pause_sku": 3.7,
    "rating_discontinue": 3.4,
    "rating_ads_min": 4.0,
    "ctr_low_pct": 1.0,
    "min_impressions_7d": 1000,
    "cvr_low_pct": 2.0,
    "min_views_7d": 200,
    "rto_high_pct": 10.0,
    "low_stock": 10,
    "dispatch_sla_min": 90.0,
    "ndd_sla_required": 97.0,
    "refresh_days": 45,
    "upload_gap_days": 15,
    "new_listing_days": 3,
    # added 2026-09-25 (Parameter check)
    "qs_min_ratings": 20,        # a Quality Score from fewer ratings is a coin-flip, not a block risk
    "title_min_chars": 60,       # research 4.1: titles 60-100 characters
    "title_max_chars": 100,
    "block_cluster_min": 2,      # research 6: several blocks at once = the loudest signal before an account review
}

PRIORITY = {
    "QS_BLOCK": "critical",
    "QS_WARN": "high",
    "RATING_PAUSE": "high",
    "RATING_STOP": "critical",
    "CTR_LOW": "medium",
    "CVR_LOW": "high",
    "PRICE_HIGH": "medium",
    "STOCKOUT": "critical",
    "LOW_STOCK": "medium",
    "SLOW_DISPATCH": "high",
    "NDD_ELIGIBLE": "medium",
    "REFRESH_DUE": "low",
    "UPLOAD_GAP": "medium",
    "NEW_WINDOW": "medium",
    "ADS_READY": "low",
    "ADS_ON_WEAK": "high",
    "RTO_HIGH": "high",
    "BLOCKED": "critical",
    "BLOCK_CLUSTER": "critical",
    "TITLE_LEN": "low",
}

# Codes that also fire an alert (SPEC: BLOCKED, QS_BLOCK, STOCKOUT,
# QS_WARN, RTO_HIGH, RATING_STOP). critical priority -> critical alert,
# high priority -> warning alert.
ALERT_SEVERITY = {
    "BLOCKED": "critical",
    "BLOCK_CLUSTER": "critical",
    "QS_BLOCK": "critical",
    "STOCKOUT": "critical",
    "RATING_STOP": "critical",
    "QS_WARN": "warning",
    "RTO_HIGH": "warning",
}

TITLE = {
    "QS_BLOCK": "Catalogue block risk — Quality Score critical",
    "QS_WARN": "Quality Score in warning zone",
    "RATING_PAUSE": "Rating too low — pause SKU",
    "RATING_STOP": "Rating below discontinue line",
    "CTR_LOW": "Low click-through rate",
    "CVR_LOW": "Low conversion rate",
    "PRICE_HIGH": "Price above recommendation",
    "STOCKOUT": "Out of stock",
    "LOW_STOCK": "Stock running low",
    "SLOW_DISPATCH": "Dispatch SLA below minimum",
    "NDD_ELIGIBLE": "Eligible for Next Day Dispatch",
    "REFRESH_DUE": "Listing refresh due",
    "UPLOAD_GAP": "New-catalogue upload gap",
    "NEW_WINDOW": "New-listing boost window open",
    "ADS_READY": "Ready for CPC ads",
    "ADS_ON_WEAK": "Ads running on weak listing",
    "RTO_HIGH": "High RTO rate",
    "BLOCKED": "Catalogue blocked",
    "BLOCK_CLUSTER": "Several catalogues blocked — account at risk",
    "TITLE_LEN": "Listing title length off the 60-100 character range",
}

ACTION = {
    "QS_BLOCK": "Find and fix the defect driving 1-2 star ratings (size, fabric, photo accuracy). Fix the listing, then relaunch the SKU fresh — the old ranking history is dragging it down.",
    "QS_WARN": "Dilute the bad ratings: push for fresh 3-5 star reviews (follow up with recent buyers, fix the top complaint) before the score crosses the block threshold.",
    "RATING_PAUSE": "Pause this SKU, identify the quality issue from reviews/returns, fix it, and only relaunch once corrected.",
    "RATING_STOP": "Discontinue this catalogue — the rating is below the viable floor. Liquidate remaining stock and relaunch a corrected version as a new SKU.",
    "CTR_LOW": "A/B test the main image: pure white background, at least 1000px, add a lifestyle/in-use shot variant. Keep the better performer.",
    "CVR_LOW": "Check the price index vs competitors, recent review content, and delivery promise (join NDD if eligible). Fix the weakest of the three.",
    "PRICE_HIGH": "Move the price toward the Meesho Price Recommendation in small steps — never below your true cost floor.",
    "STOCKOUT": "Restock now. Ranking momentum resets while a listing is out of stock, so every day at zero costs visibility.",
    "LOW_STOCK": "Reorder before hitting zero — a stockout resets ranking momentum and wastes the ad spend/reviews already earned.",
    "SLOW_DISPATCH": "Get dispatch under 24 hours: pre-pack fast movers, set a daily pickup cut-off, and clear pending orders first.",
    "NDD_ELIGIBLE": "Join Next Day Dispatch — your dispatch SLA qualifies, and NDD listings get a ranking boost (~12% interest uplift).",
    "REFRESH_DUE": "Refresh the main image and title — freshness is a ranking signal and this listing has gone stale.",
    "UPLOAD_GAP": "Upload new catalogues — a 10-15 day upload cadence keeps the account's freshness signal strong.",
    "NEW_WINDOW": "Exploit the 48-72h new-listing boost: set a competitive launch price, use perfect images, and keep stock ready to convert the extra traffic.",
    "ADS_READY": "This listing has proven demand and a healthy rating — start a small CPC ad campaign to amplify it.",
    "ADS_ON_WEAK": "Pause the ads — paid traffic on a low-rated listing amplifies weak engagement data and hurts ranking. Fix the rating first.",
    "RTO_HIGH": "Reduce RTO: fix the size chart, make photos match the real product, and consider slightly higher pricing to filter risky orders.",
    "BLOCKED": "Triage the block: check Quality Score, any IP complaint, and returns spikes in the supplier panel. Orders already placed must still ship on time.",
    "BLOCK_CLUSTER": "Stop uploading and re-uploading. Find the shared cause across the blocked catalogues (Quality Score, copied images, returns, KYC/GST mismatch), fix it once, and only then relaunch. Several blocks in a short window are the loudest signal before an account-level review.",
    "TITLE_LEN": "Rewrite the title to 60-100 characters with the main buyer keyword in the first 5 words (how buyers actually search, e.g. 'office wear kurti under 500'). No keyword stuffing.",
}

SOURCE = {
    "QS_BLOCK": "Research §4.5 — Quality Score thresholds",
    "QS_WARN": "Research §4.5 — Quality Score thresholds",
    "RATING_PAUSE": "Research §4.6 — Rating thresholds (pause SKU)",
    "RATING_STOP": "Research §4.6 — Rating thresholds (discontinue)",
    "CTR_LOW": "Research §4.2 — Main image & CTR",
    "CVR_LOW": "Research §4.3 — Conversion drivers (price, reviews, delivery promise)",
    "PRICE_HIGH": "Research §4.4 — Price Recommendation alignment",
    "STOCKOUT": "Research §4.8 — Stock availability & ranking momentum",
    "LOW_STOCK": "Research §4.8 — Stock availability & ranking momentum",
    "SLOW_DISPATCH": "Research §4.7 — Dispatch SLA & ranking",
    "NDD_ELIGIBLE": "Research §4.7 — Next Day Dispatch ranking boost",
    "REFRESH_DUE": "Research §4.9 — Listing freshness signal",
    "UPLOAD_GAP": "Research §4.9 — New-catalogue cadence (10-15 days)",
    "NEW_WINDOW": "Research §4.10 — New-listing 48-72h boost window",
    "ADS_READY": "Research §4.11 — When CPC ads amplify performance",
    "ADS_ON_WEAK": "Research §4.11 — Ads amplify weak engagement data",
    "RTO_HIGH": "Research §4.12 — RTO reduction",
    "BLOCKED": "Research §4.13 — Catalogue block triage",
    "BLOCK_CLUSTER": "Research §6 — Enforcement: repeated catalogue blocks precede an account block",
    "TITLE_LEN": "Research §4.1 — Relevance: keyword-rich titles, 60-100 characters",
}


def _num(value, default=0.0):
    """Coerce a possibly-NULL metric to float."""
    try:
        return default if value is None else float(value)
    except (TypeError, ValueError):
        return default


def _parse_dt(value):
    """Parse an ISO-ish datetime string; return None if unparseable."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    s = str(value).strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _age_days(value):
    """Age of an ISO timestamp in days (float), or None if unparseable."""
    dt = _parse_dt(value)
    if dt is None:
        return None
    now = datetime.now(dt.tzinfo) if dt.tzinfo is not None else datetime.now()
    return (now - dt).total_seconds() / 86400.0


def _fmt(pct):
    return f"{pct:g}"


# One evaluation pass records which (listing, code) findings fired and which were actually EVALUATED (their input data was
# present), so a recommendation whose problem has cleared can close itself - but never because data was merely missing.
_RUN = {"fired": None, "evaluated": None}


def _evaluated(listing_id, *codes):
    if _RUN["evaluated"] is not None:
        for c in codes:
            _RUN["evaluated"].add((listing_id, c))


def _emit(conn, listing_id, code, reason):
    """Create the recommendation (and alert, for alerting codes) unless an
    open/unacked duplicate already exists. Returns rows created (0, 1 or 2)."""
    from app import database as db  # lazy import

    if _RUN["fired"] is not None:
        _RUN["fired"].add((listing_id, code))
    added = 0
    if db.has_open_rec(conn, listing_id, code):
        db.refresh_recommendation(conn, listing_id, code, PRIORITY[code], reason)
    if not db.has_open_rec(conn, listing_id, code):
        db.add_recommendation(
            conn, listing_id, code, PRIORITY[code], TITLE[code],
            reason, ACTION[code], SOURCE[code],
        )
        added += 1
    severity = ALERT_SEVERITY.get(code)
    if severity and not db.has_unacked_alert(conn, listing_id, code):
        db.add_alert(conn, severity, code, f"{TITLE[code]}: {reason}",
                     listing_id=listing_id)
        added += 1
    return added


def _evaluate_listing(conn, listing, th):
    """Evaluate all listing-level rules for one listings row."""
    from app import database as db  # lazy import

    lid = listing["id"]
    created = 0

    latest = db.latest_snapshot(conn, lid)
    rows = db.snapshots_since(conn, lid, 7)

    imp_7d = sum(_num(r["impressions"]) for r in rows)
    views_7d = sum(_num(r["views"]) for r in rows)
    clicks_7d = sum(_num(r["clicks"]) for r in rows)
    orders_7d = sum(_num(r["orders"]) for r in rows)
    rto_7d = sum(_num(r["rto"]) for r in rows)
    ctr = clicks_7d / imp_7d * 100.0 if imp_7d > 0 else 0.0
    cvr = orders_7d / views_7d * 100.0 if views_7d > 0 else 0.0
    rto_pct = rto_7d / orders_7d * 100.0 if orders_7d > 0 else 0.0

    status = (listing["status"] or "").lower()
    is_ad = int(_num(listing["is_ad"]))
    ndd = int(_num(listing["ndd"]))
    if status:
        _evaluated(lid, "BLOCKED")

    # --- status rule ---------------------------------------------------
    if status == "blocked":
        created += _emit(conn, lid, "BLOCKED",
                         "Catalogue status is 'blocked' in the supplier panel.")

    # --- snapshot-based rules ------------------------------------------
    if latest is not None:
        qs = latest["quality_score"]
        rating = latest["rating"]
        stock = _num(latest["stock"])
        price = latest["price"]
        rec_price = latest["recommended_price"]
        sla = latest["dispatch_sla"]

        if qs is not None:
            qs = _num(qs)
            _evaluated(lid, "QS_BLOCK", "QS_WARN")
            bad = latest["bad_ratings"]
            total = latest["ratings_count"]
            detail = ""
            if bad is not None and total:
                detail = (f" ({int(_num(bad))} of {int(_num(total))} ratings "
                          "are 1-2 star)")
            # Quality Score is a SHARE of bad ratings. With 1 bad rating out of 3 it reads 33% - "block risk" - which is
            # one unhappy buyer, not a pattern. Below `qs_min_ratings` ratings it is reported as a warning, never a block.
            small_sample = bool(total) and _num(total) < th["qs_min_ratings"]
            if qs > th["qs_block"] and small_sample:
                created += _emit(
                    conn, lid, "QS_WARN",
                    f"Quality Score reads {qs:.1f}%{detail}, but that rests on only {int(_num(total))} ratings "
                    f"(fewer than {int(th['qs_min_ratings'])}), so it is a weak signal and not yet a block risk. "
                    "It becomes real if it stays high as ratings grow.")
            elif qs > th["qs_block"]:
                created += _emit(
                    conn, lid, "QS_BLOCK",
                    f"Quality Score is {qs:.1f}% — above the "
                    f"{_fmt(th['qs_block'])}% block threshold{detail}.")
            elif qs > th["qs_warn"]:
                created += _emit(
                    conn, lid, "QS_WARN",
                    f"Quality Score is {qs:.1f}% — in the warning zone "
                    f"({_fmt(th['qs_warn'])}-{_fmt(th['qs_block'])}%)"
                    f"{detail}. Visibility is being throttled.")

        if rating is not None:
            rating = _num(rating)
            _evaluated(lid, "RATING_STOP", "RATING_PAUSE", "ADS_ON_WEAK", "ADS_READY")
            if rating < th["rating_discontinue"]:
                created += _emit(
                    conn, lid, "RATING_STOP",
                    f"Rating is {rating:.1f} stars — below the "
                    f"{th['rating_discontinue']:.1f} discontinue threshold.")
            elif rating < th["rating_pause_sku"]:
                created += _emit(
                    conn, lid, "RATING_PAUSE",
                    f"Rating is {rating:.1f} stars — below the "
                    f"{th['rating_pause_sku']:.1f} pause threshold.")

            if is_ad == 1 and rating < th["rating_ads_min"]:
                created += _emit(
                    conn, lid, "ADS_ON_WEAK",
                    f"Ads are running but rating is {rating:.1f} stars — "
                    f"below the {th['rating_ads_min']:.1f} minimum for "
                    "advertising.")
            elif (is_ad == 0 and rating >= th["rating_ads_min"]
                    and orders_7d >= 5):
                created += _emit(
                    conn, lid, "ADS_READY",
                    f"Rating is {rating:.1f} stars with {int(orders_7d)} "
                    "orders in 7 days — proven demand, no ads running yet.")

        if latest["stock"] is not None:     # NULL = the report did not say: unknown, never "zero"
            _evaluated(lid, "STOCKOUT", "LOW_STOCK")
            if stock == 0:
                created += _emit(conn, lid, "STOCKOUT",
                                 "Stock is 0 — the listing is out of stock.")
            elif stock < th["low_stock"]:
                created += _emit(
                    conn, lid, "LOW_STOCK",
                    f"Stock is {int(stock)} units — below the "
                    f"{int(th['low_stock'])}-unit low-stock line.")

        if rec_price is not None and price is not None:
            price = _num(price)
            rec_price = _num(rec_price)
            _evaluated(lid, "PRICE_HIGH")
            if rec_price > 0 and price > rec_price:
                created += _emit(
                    conn, lid, "PRICE_HIGH",
                    f"Price is Rs {price:.0f} vs the recommended "
                    f"Rs {rec_price:.0f} — {price - rec_price:.0f} above the "
                    "Price Recommendation.")

        if sla is not None:
            sla = _num(sla)
            _evaluated(lid, "SLOW_DISPATCH", "NDD_ELIGIBLE")
            if sla < th["dispatch_sla_min"]:
                created += _emit(
                    conn, lid, "SLOW_DISPATCH",
                    f"Dispatch SLA is {sla:.1f}% — below the "
                    f"{_fmt(th['dispatch_sla_min'])}% minimum.")
            elif sla >= th["ndd_sla_required"] and ndd == 0:
                created += _emit(
                    conn, lid, "NDD_ELIGIBLE",
                    f"Dispatch SLA is {sla:.1f}% — above the "
                    f"{_fmt(th['ndd_sla_required'])}% NDD requirement, but "
                    "NDD is not enabled.")

        if imp_7d >= th["min_impressions_7d"]:
            _evaluated(lid, "CTR_LOW")
        if views_7d >= th["min_views_7d"]:
            _evaluated(lid, "CVR_LOW")
        if orders_7d > 0:
            _evaluated(lid, "RTO_HIGH")
        if imp_7d >= th["min_impressions_7d"] and ctr < th["ctr_low_pct"]:
            created += _emit(
                conn, lid, "CTR_LOW",
                f"CTR is {ctr:.2f}% ({int(clicks_7d)} clicks / "
                f"{int(imp_7d)} impressions in 7d) — below the "
                f"{_fmt(th['ctr_low_pct'])}% threshold.")

        if views_7d >= th["min_views_7d"] and cvr < th["cvr_low_pct"]:
            created += _emit(
                conn, lid, "CVR_LOW",
                f"Conversion is {cvr:.2f}% ({int(orders_7d)} orders / "
                f"{int(views_7d)} views in 7d) — below the "
                f"{_fmt(th['cvr_low_pct'])}% threshold.")

        if orders_7d > 0 and rto_pct > th["rto_high_pct"]:
            created += _emit(
                conn, lid, "RTO_HIGH",
                f"RTO is {rto_pct:.1f}% ({int(rto_7d)} of {int(orders_7d)} "
                f"orders in 7d returned to origin) — above the "
                f"{_fmt(th['rto_high_pct'])}% threshold.")

    # --- freshness / cadence rules (no snapshot needed) ----------------
    refresh_ref = listing["last_refresh_at"] or listing["created_at"]
    refresh_age = _age_days(refresh_ref)
    if refresh_age is not None:
        _evaluated(lid, "REFRESH_DUE")
    if refresh_age is not None and refresh_age >= th["refresh_days"]:
        which = "refreshed" if listing["last_refresh_at"] else "created"
        created += _emit(
            conn, lid, "REFRESH_DUE",
            f"Listing was last {which} {refresh_age:.0f} days ago — beyond "
            f"the {int(th['refresh_days'])}-day freshness window.")

    created_age = _age_days(listing["created_at"])
    if created_age is not None:
        _evaluated(lid, "NEW_WINDOW")
    if created_age is not None and created_age <= th["new_listing_days"]:
        created += _emit(
            conn, lid, "NEW_WINDOW",
            f"Listing was created {max(created_age, 0):.1f} days ago — "
            f"still inside the {int(th['new_listing_days'])}-day "
            "new-listing boost window.")

    # relevance (research 4.1): a title of 60-100 characters. Too short wastes search keywords; too long is stuffing.
    title = (listing["name"] or "").strip()
    if title:
        _evaluated(lid, "TITLE_LEN")
        if len(title) < th["title_min_chars"] or len(title) > th["title_max_chars"]:
            created += _emit(
                conn, lid, "TITLE_LEN",
                f"The title is {len(title)} characters (target {int(th['title_min_chars'])}-{int(th['title_max_chars'])}): "
                f"\"{title[:60]}{'...' if len(title) > 60 else ''}\"")

    return created


def evaluate_all(conn):
    """Run every rule against all listings (plus the account-level
    UPLOAD_GAP rule). Returns the number of new recommendations + alerts
    created."""
    from app import database as db  # lazy import
    from app.config import get as cfg_get  # lazy import

    def th_get(key):
        try:
            return cfg_get(f"thresholds.{key}", THRESHOLD_DEFAULTS[key])
        except Exception:
            return THRESHOLD_DEFAULTS[key]

    th = {key: _num(th_get(key), THRESHOLD_DEFAULTS[key])
          for key in THRESHOLD_DEFAULTS}

    total = 0
    _RUN["fired"], _RUN["evaluated"] = set(), set()
    listings = db.all_listings(conn)
    for listing in listings:
        total += _evaluate_listing(conn, listing, th)

    # Account-level: several catalogues blocked at once is the loudest signal before an account-level review (research 6).
    blocked = [l for l in listings if (l["status"] or "").lower() == "blocked"]
    _evaluated(None, "BLOCK_CLUSTER")
    if len(blocked) >= th["block_cluster_min"]:
        total += _emit(
            conn, None, "BLOCK_CLUSTER",
            f"{len(blocked)} catalogues are blocked at the same time ({', '.join((l['name'] or l['catalog_id'] or '?')[:30] for l in blocked[:3])}"
            f"{' ...' if len(blocked) > 3 else ''}).")

    # Account-level rule: upload cadence (listing_id=None).
    last_upload_age = _age_days(db.last_upload_time(conn))
    if last_upload_age is not None:
        _evaluated(None, "UPLOAD_GAP")
    if last_upload_age is not None and last_upload_age >= th["upload_gap_days"]:
        total += _emit(
            conn, None, "UPLOAD_GAP",
            f"No new catalogue uploaded for {last_upload_age:.0f} days — "
            f"longer than the {int(th['upload_gap_days'])}-day cadence gap.")

    # A recommendation whose problem has cleared closes itself - but only when its input was actually present this time
    # (a report that simply lacks a column must not "resolve" anything). The owner's own 'done' is never touched.
    fired, evaluated = _RUN["fired"], _RUN["evaluated"]
    _RUN["fired"] = _RUN["evaluated"] = None
    for rec in list(db.open_recommendations(conn)):
        key = (rec["listing_id"], rec["code"])
        if key in evaluated and key not in fired and rec["code"] in PRIORITY:
            db.resolve_recommendation(conn, rec["listing_id"], rec["code"])

    return total
