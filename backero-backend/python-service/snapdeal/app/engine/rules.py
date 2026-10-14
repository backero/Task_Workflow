"""Rules engine - thresholds derived from the deep-research report.
Every rule carries its evidence source so the dashboard can show WHY.

Each alert has a stable identity: (entity, code). `emit()` opens a new alert or refreshes an open one of the same
identity with today's numbers, and `evaluate()` closes (status 'cleared') any open alert whose condition was
checked this pass and no longer holds - see database.add_alert / clear_cleared_alerts for why this replaced the
old title-string de-dup (it produced one new "duplicate" alert per value change and never closed a fixed one)."""
import datetime
from .. import database as db

_evaluated = set()   # (entity, code) pairs actually checked this pass - reset per evaluate() call
_fired = set()       # (entity, code) pairs whose condition held this pass


def emit(entity, module, code, severity, title, reason, fix, source):
    _evaluated.add((entity, code))
    _fired.add((entity, code))
    return db.add_alert(dict(severity=severity, module=module, entity=entity, code=code,
                             title=title, reason=reason, fix=fix, source=source))


def checked(entity, *codes):
    """Mark that these rules' input data was present and evaluated, even when none of them fired -
    otherwise a metric that is merely absent from today's sync would look "fixed" and auto-clear."""
    for c in codes:
        _evaluated.add((entity, c))

# --- thresholds (research-sourced, practitioner targets) ---
T_CANCEL = 1.0        # % seller cancellations      [Digital PR World SOP]
T_ONTIME = 98.0       # % on-time dispatch          [Digital PR World SOP]
T_RATING = 4.0        # customer rating stars       [Digital PR World SOP]
T_REVIEWS = 50        # review-count organic jump   [Shiprocket]
T_DISC_MIN, T_DISC_MAX = 40.0, 60.0  # MRP discount band [SW Cybernetics]
T_STALE_DAYS = 21     # stale-listing refresh window [EcomSarthi]
T_CTR = 0.5           # % healthy CTR floor          [Trivium]
T_VEL_DROP = 0.4      # 40% week-over-week order drop = velocity stall

def _trend(rows, key, days=7):
    """(last-7d sum, prior-7d sum) for a metric key."""
    rows = sorted(rows, key=lambda r: r["day"], reverse=True)
    cutoff = datetime.date.today()
    last = sum(r[key] for r in rows
               if (cutoff - datetime.date.fromisoformat(r["day"])).days < days)
    prev = sum(r[key] for r in rows
               if days <= (cutoff - datetime.date.fromisoformat(r["day"])).days < 2 * days)
    return last, prev

def evaluate():
    """Run all rules; open/refresh/clear alerts. Returns the count of NEW alerts opened this pass."""
    global _evaluated, _fired
    _evaluated, _fired = set(), set()
    created = 0
    created += _health_rules()
    created += _listing_rules()
    created += _velocity_rules()
    created += _ads_rules()
    db.clear_cleared_alerts(_evaluated, _fired)
    return created

def _health_rules():
    created = 0
    sc = db.q("SELECT * FROM scorecard ORDER BY day DESC LIMIT 1")
    if not sc: return 0
    s = sc[0]
    E = "seller-account"
    checked(E, "CANCEL_HIGH", "ONTIME_LOW", "RATING_LOW", "DTO_HIGH")
    if s["cancellation_pct"] >= T_CANCEL:
        created += emit(E, "Health Gate", "CANCEL_HIGH", "critical",
            f"Cancellation rate {s['cancellation_pct']}% breaches ~1% line",
            "Snapdeal's seller scorecard caps visibility when cancellations exceed ~1%; "
            "out-of-stock cancellations are a named rating parameter in Snapdeal's own "
            "community documentation.",
            "Sync stock every morning; delist SKUs you cannot fulfil within SLA; "
            "move repeat offenders to SD Plus so Snapdeal controls inventory.",
            "Digital PR World SOP; Quora seller-rating docs")
    if s["ontime_pct"] < T_ONTIME:
        created += emit(E, "Health Gate", "ONTIME_LOW", "critical",
            f"On-time dispatch {s['ontime_pct']}% below ~98% target",
            "SLA breach is parameter #2 of Snapdeal's seller rating; breaches cap the "
            "health gate regardless of listing quality.",
            "Audit dispatch cut-off times; pre-pack top sellers; escalate courier pickup "
            "delays or shift volume to SD Plus fulfilment.",
            "Digital PR World SOP; Quora seller-rating docs")
    if 0 < s["rating"] < T_RATING:
        created += emit(E, "Health Gate", "RATING_LOW", "warning",
            f"Customer rating {s['rating']} below ~4.0",
            "Ratings feed the curated-marketplace quality filter Kunal Bahl described "
            "('ask the buyers') and the scorecard gate.",
            "Find the worst-rated SKUs in the Listing Audit tab; fix sizing charts, "
            "packaging, and description accuracy before spending on ads.",
            "Snapdeal Blog (Kunal Bahl); Digital PR World SOP")
    if s["dto_pct"] > 5.5:
        created += emit(E, "Health Gate", "DTO_HIGH", "warning",
            f"DTO (customer) returns at {s['dto_pct']}% — above Snapdeal's ~5.5% norm",
            "Snapdeal's own founder disclosed returns below 5.5% of delivered units; DTO "
            "returns 'impact search visibility & lead to limits' per seller SOPs. RTO is "
            "exempt — only DTO hurts.",
            "Open the DTO-heavy SKUs below; wrong-item and fit issues mean catalogue truth "
            "problems (size chart, images, attributes), not logistics.",
            "Snapdeal Blog; Snapdeal Product Return Policy PDF; Digital PR World")
    return created

def _listing_rules():
    created = 0
    listings = db.q("SELECT * FROM listings")
    seen_titles: dict[str, list[str]] = {}
    for l in listings:
        sku = l["sku"]
        disc = round((1 - l["price"] / l["mrp"]) * 100, 1) if l["mrp"] else 0
        checked(sku, "STOCKOUT", "IMAGE_QC", "ATTRS_LOW", "RATING_DRAG", "TITLE_SYNTAX")
        if l["stock"] == 0:
            created += emit(sku, "Listing Audit", "STOCKOUT", "critical",
                "OUT OF STOCK — listing invisible",
                "Availability is a hard filter: zero stock removes the listing from "
                "impression eligibility entirely AND risks cancellation penalties.",
                "Restock or pause the listing today; add it to the daily stock-sync routine.",
                "Digital PR World SOP")
        if not l["image_ok"]:
            created += emit(sku, "Listing Audit", "IMAGE_QC", "warning",
                "Image fails Snapdeal QC spec",
                "Official image guidelines reject non-white backgrounds, watermarks, "
                "promo text ('Best Seller', '5 stars'), bad crops. The main image is the "
                "single biggest CTR driver — CTR feeds the Popularity rank.",
                "Re-shoot on pure white, product filling 70-85% of frame, min 1200x1600px, "
                "no text overlays. Re-upload and re-audit.",
                "Snapdeal Image Guidelines PDF; Trivium CTR research")
        if l["attrs_filled"] < l["attrs_total"] * 0.8:
            created += emit(sku, "Listing Audit", "ATTRS_LOW", "warning",
                f"Only {l['attrs_filled']}/{l['attrs_total']} attributes filled",
                "Snapdeal search filters on structured attributes, 'not just visible "
                "text'. Missing attributes = missing from filtered searches and wrong-fit "
                "returns.",
                "Complete size/colour/material attributes in Seller Panel bulk template.",
                "EcomSarthi; Digital PR World SOP")
        if disc:
            checked(sku, "DISCOUNT_BAND")
            # was "<= 75" - an undocumented cushion above the 40-60% band the report, README and SPEC all state;
            # aligned to the actual documented threshold (T_DISC_MAX).
            if not (T_DISC_MIN <= disc <= T_DISC_MAX):
                created += emit(sku, "Listing Audit", "DISCOUNT_BAND", "info",
                    f"Discount {disc}% outside the 40-60% value band",
                    "95% of Snapdeal products sell under ₹1,000 and shoppers sort by "
                    "Discount; practitioner pricing bands converge on 40-60% MRP markdown. "
                    "Below-band pricing starves CTR/CVR; far above band can look inflated.",
                    "Re-check against category norms and your net margin after 5-25% commission "
                    "+ fixed fee + logistics.",
                    "Snapdeal Blog (95% < ₹1,000); SW Cybernetics; Snapdeal live sort")
        if l["reviews"] >= 20:
            checked(sku, "RATING_DRAG")
            if 0 < l["rating"] < 4.0:
                created += emit(sku, "Listing Audit", "RATING_DRAG", "warning",
                    f"Rated {l['rating']}★ with {l['reviews']} reviews — dragging rank",
                    "4★+ with volume outsells higher-rated low-volume listings; a sub-4.0 "
                    "listing with many reviews has a proven product-truth problem.",
                    "Read recent reviews for the recurring complaint (usually size/quality); "
                    "fix the cause, not the listing copy.",
                    "Shiprocket Snapdeal bestseller analysis")
        if l["stock"] > 0:
            checked(sku, "LOW_REVIEWS")
            if 0 < l["reviews"] < T_REVIEWS:
                created += emit(sku, "Listing Audit", "LOW_REVIEWS", "info",
                    f"{l['reviews']} reviews — below the ~50 organic-placement threshold",
                    "Shiprocket's Snapdeal analysis: products crossing ~50 genuine reviews "
                    "see a measurable jump in organic search placement.",
                    "Push post-purchase review requests on this SKU; never buy or incentivise "
                    "ratings — explicitly banned by Snapdeal policy.",
                    "Shiprocket; Snapdeal Prohibited Activities Policy")
        try:
            age = (datetime.date.today() - datetime.date.fromisoformat(l["updated"])).days
            checked(sku, "STALE")
        except Exception:
            age = 0
        if age > T_STALE_DAYS:
            created += emit(sku, "Listing Audit", "STALE", "info",
                f"Listing untouched for {age} days — freshness decay",
                "Agencies warn stale catalogues quietly decay; Snapdeal runs a 'Fresh "
                "Arrivals' sort so recency is an indexed attribute.",
                "Substantive refresh only: better images, completed attributes, corrected "
                "title. Cosmetic daily edits do nothing.",
                "EcomSarthi; Snapdeal live 'Fresh Arrivals' sort")
        # Snapdeal prescribes the title syntax [Brand] + [Gender/Target] + [Product] + [Key Attribute] - the
        # report states the search index parses structured title components rather than free text (report §"Stage 1").
        # We check the one part of that we can verify without guessing: the title should open with the seller's own
        # brand, as the prescribed template requires.
        if l["brand"] and l["title"] and not l["title"].strip().lower().startswith(l["brand"].strip().lower()):
            created += emit(sku, "Listing Audit", "TITLE_SYNTAX", "info",
                f"Title does not start with the brand \"{l['brand']}\"",
                f"Snapdeal's prescribed title syntax is [Brand] + [Gender/Target Group] + [Product Name/Type] + "
                f"[Key Attribute]; \"{l['title'][:60]}\" does not open with the brand.",
                "Reorder the title to start with the brand, matching Snapdeal's own template.",
                "Digital PR World SOP (prescribed title syntax)")
        seen_titles.setdefault(l["title"].strip().lower(), []).append(sku)

    # Policy bans duplicate listings ("duplicate listings are suppressed" - report §6); two live SKUs with an
    # identical title is the one form of this we can detect without image comparison.
    for title, skus in seen_titles.items():
        if len(skus) < 2 or not title:
            continue
        for sku in skus:
            checked(sku, "DUPLICATE_TITLE")
            others = ", ".join(x for x in skus if x != sku)
            created += emit(sku, "Listing Audit", "DUPLICATE_TITLE", "info",
                f"Same title as {others}",
                "Snapdeal's Prohibited Seller Activities policy suppresses duplicate listings; identical titles "
                "split your own reviews and sales history across SKUs instead of building one strong listing.",
                "Merge into one SKU with colour/size as variants, or differentiate the titles if they are genuinely different products.",
                "Snapdeal Prohibited Seller Activities Policy")
    return created

def _velocity_rules():
    created = 0
    skus = [r["sku"] for r in db.q("SELECT sku FROM listings")]
    for sku in skus:
        rows = db.q("SELECT * FROM metrics_daily WHERE listing_sku=?", (sku,))
        if len(rows) < 10: continue
        last_o, prev_o = _trend(rows, "orders")
        last_i, _ = _trend(rows, "impressions")
        last_c, _ = _trend(rows, "clicks")
        if prev_o >= 5:
            checked(sku, "VELOCITY_STALL")
            if last_o < prev_o * (1 - T_VEL_DROP):
                created += emit(sku, "Velocity", "VELOCITY_STALL", "critical",
                    f"Sales velocity stalled: {last_o} orders this week vs {prev_o} last week",
                    "Snapdeal's default sort is Popularity — keyword-linked sales velocity. "
                    "A >40% velocity drop pushes the listing down the flywheel: fewer orders "
                    "→ lower rank → fewer impressions → fewer orders.",
                    "Break the loop with an injected burst: Lightning Deal / flash-sale entry, "
                    "5-10% temporary price cut on the hero keyword, or a small sponsored-search "
                    "burst. The anecdotal re-entry threshold is 5-10 keyword sales.",
                    "Snapdeal live Popularity sort; Quora seller account; Shiprocket")
        if last_i >= 300:
            checked(sku, "CTR_LOW")
            ctr = last_c / max(last_i, 1) * 100
            if ctr < T_CTR:
                created += emit(sku, "Velocity", "CTR_LOW", "warning",
                    f"CTR {ctr:.2f}% — buyers see it but don't click",
                    "Impressions are arriving but CTR is under the ~0.5% floor. The main "
                    "image, title keywords and displayed price are the three CTR levers — "
                    "this is a listing-appeal problem, not a rank problem.",
                    "Re-shoot the main image first (biggest CTR driver), then move the core "
                    "keyword into the title front-half, then check the displayed price against "
                    "the top 5 results for the same query.",
                    "Trivium CTR benchmarks; MyAmazonGuy CRO metrics")
    return created

def _ads_rules():
    created = 0
    rows = db.q("SELECT * FROM ads_daily")
    camps = {}
    for r in rows:
        c = camps.setdefault(r["campaign"], dict(spend=0, orders=0, revenue=0, clicks=0))
        c["spend"] += r["spend"]; c["orders"] += r["orders"]
        c["revenue"] += r["revenue"]; c["clicks"] += r["clicks"]
    for camp, c in camps.items():
        if c["spend"] > 500 and c["revenue"] > 0:
            checked(camp, "ACOS_HIGH")
            acos = c["spend"] / c["revenue"] * 100
            if acos > 40:
                created += emit(camp, "Ads", "ACOS_HIGH", "warning",
                    f"ACOS {acos:.0f}% — ad spend outpacing sales value",
                    "On a value marketplace, sponsored clicks on an uncompetitively priced "
                    "SKU do not convert; the click cost is real, the flywheel credit is not.",
                    "Pause and fix the underlying listing (price into the 40-60% band, main "
                    "image, reviews) before resuming. Ads rent impressions — they cannot buy "
                    "organic rank for a weak listing.",
                    "MediaNama (Snapdeal Ads CPC); Experro; SW Cybernetics")
        if c["clicks"] >= 100:
            checked(camp, "ADS_ZERO_ORDERS")
            if c["orders"] == 0:
                created += emit(camp, "Ads", "ADS_ZERO_ORDERS", "critical",
                    f"{c['clicks']} paid clicks, ZERO orders",
                    "Traffic arrives but nothing converts — the listing page or price is "
                    "broken, or stock is zero. Every wasted click also teaches the ranker "
                    "a negative CVR signal.",
                    "Pause the campaign immediately. Check stock, price vs top-5 organic "
                    "results, and page content; relaunch only after CVR > 5% on organic traffic.",
                    "Experro (rankers combine CTR/CVR/stock); Trivium CVR flywheel")
    return created
