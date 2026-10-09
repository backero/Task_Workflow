"""Demo data seeding for Meesho Seller Command Center.

seed_demo(db_path) wipes and reseeds the DB with 25 listings x 30 days of
daily snapshots, including the deliberate problem cases from SPEC.md, then
(best-effort) runs evaluate_all + dispatch_unsent. Recommender/alerts are
imported lazily INSIDE the function and wrapped in try/except so a missing
sibling module never breaks seeding.
"""

import random
from datetime import datetime, timedelta

from app.database import get_conn, init_db, upsert_listing, add_snapshot, log_data_event

DAYS = 30
RNG = random.Random(42)

CATEGORIES = {
    "Kurtis": (199, 499),
    "Bedsheets": (249, 699),
    "Phone Covers": (79, 199),
    "Sarees": (299, 899),
    "Kitchen Tools": (99, 349),
}
NAMES = {
    "Kurtis": ["Floral Print Kurti", "Cotton A-Line Kurti", "Embroidered Kurti",
               "Rayon Straight Kurti", "Anarkali Kurti"],
    "Bedsheets": ["Cotton Double Bedsheet", "Glace Cotton Bedsheet",
                  "Floral King Bedsheet", "Stripe Single Bedsheet", "Jaipuri Bedsheet"],
    "Phone Covers": ["Matte Silicone Cover", "Printed Hard Case", "Transparent Bumper Case",
                     "Glitter Back Cover", "Leather Flip Cover"],
    "Sarees": ["Banarasi Silk Saree", "Cotton Daily Wear Saree", "Georgette Party Saree",
               "Kanjivaram Style Saree", "Chiffon Printed Saree"],
    "Kitchen Tools": ["Steel Masala Box", "Vegetable Chopper", "Non-stick Spatula Set",
                      "Spice Grinder", "Storage Container Set"],
}

# Deliberate problem cases (SPEC): index -> profile overrides.
SPECIALS = {
    0:  {"status": "blocked", "qs": 28.0, "rating": 3.2},            # BLOCKED (also QS block)
    1:  {"qs": 18.0, "rating": 3.8},                                 # QS_WARN 16-24
    2:  {"qs": 22.0, "rating": 3.9},                                 # QS_WARN 16-24
    3:  {"qs": 27.5, "rating": 3.3},                                 # QS_BLOCK >25
    4:  {"ctr": 0.6, "base_impr": 260},                              # CTR_LOW
    5:  {"ctr": 0.7, "base_impr": 320},                              # CTR_LOW
    6:  {"cvr": 1.2, "view_rate": 0.11, "base_impr": 320},           # CVR_LOW
    7:  {"cvr": 1.5, "view_rate": 0.11, "base_impr": 340},           # CVR_LOW
    8:  {"stock": 0},                                                # STOCKOUT
    9:  {"dispatch_sla": 98.0, "ndd": 0},                            # NDD_ELIGIBLE
    10: {"dispatch_sla": 99.0, "ndd": 0},                            # NDD_ELIGIBLE
    11: {"created_days_ago": 2, "base_impr": 320, "cvr": 4.5},       # NEW_WINDOW
    12: {"is_ad": 1, "rating": 3.5, "qs": 14.0},                     # ADS_ON_WEAK
    13: {"is_ad": 0, "rating": 4.4, "cvr": 5.0, "qs": 4.0},          # ADS_READY
    14: {"rto_pct": 14.0},                                           # RTO_HIGH
    15: {"price_factor": 1.15},                                      # PRICE_HIGH (price > recommended)
}
STALE_REFRESH = {16, 17, 18, 19, 20}   # last_refresh_at >= 45 days ago


def _round_rand(x):
    """Round x to an int with expectation preserved (fractional coin flip)."""
    base = int(x)
    return base + (1 if RNG.random() < x - base else 0)


def _profile(idx, category):
    lo, hi = CATEGORIES[category]
    p = {
        "status": "live",
        "price": float(RNG.randint(lo, hi)),
        "base_impr": RNG.randint(120, 400),
        "view_rate": RNG.uniform(0.07, 0.14),   # views / impressions
        "ctr": RNG.uniform(1.8, 3.6),           # clicks / impressions %
        "cvr": RNG.uniform(3.0, 6.5),           # orders / views %
        "rating": round(RNG.uniform(3.9, 4.5), 1),
        "qs": RNG.uniform(3.0, 10.0),           # quality score %
        "stock": RNG.randint(15, 120),
        "dispatch_sla": RNG.uniform(85.0, 96.0),
        "ndd": RNG.choice([0, 1]),
        "is_ad": 0,
        "rto_pct": RNG.uniform(2.0, 7.0),
        "created_days_ago": RNG.randint(60, 200),
        "price_factor": 1.0,
        "trend": RNG.uniform(-0.01, 0.015),     # daily growth factor
    }
    p.update(SPECIALS.get(idx, {}))
    return p


def _seed(conn):
    now = datetime.now()
    cats = list(CATEGORIES)
    for idx in range(25):
        cat = cats[idx % len(cats)]
        name = f"{NAMES[cat][idx // len(cats)]} (Pack {idx + 1})"
        p = _profile(idx, cat)
        created = (now - timedelta(days=p["created_days_ago"])).isoformat(timespec="seconds")
        if idx in STALE_REFRESH:
            refresh = (now - timedelta(days=RNG.randint(50, 75))).isoformat(timespec="seconds")
        else:
            refresh = (now - timedelta(days=RNG.randint(5, 30))).isoformat(timespec="seconds")
        lid = upsert_listing(
            conn,
            catalog_id=f"CAT-{1000 + idx}",
            name=name,
            category=cat,
            price=p["price"],
            status=p["status"],
            created_at=created,
            ndd=p["ndd"],
            is_ad=p["is_ad"],
            last_refresh_at=refresh,
        )
        days_live = min(DAYS, p["created_days_ago"] + 1)
        ratings_count = RNG.randint(120, 400)
        for d in range(DAYS - days_live, DAYS):
            day = now - timedelta(days=DAYS - 1 - d)
            growth = 1.0 + p["trend"] * d
            noise = RNG.uniform(0.8, 1.2)
            impressions = max(0, int(p["base_impr"] * growth * noise))
            if p["status"] == "blocked" and d >= DAYS - 4:
                impressions = int(impressions * 0.1)   # blocked -> visibility collapses
            views = int(impressions * p["view_rate"] * RNG.uniform(0.9, 1.1))
            clicks = _round_rand(impressions * p["ctr"] / 100.0 * RNG.uniform(0.85, 1.15))
            orders = _round_rand(views * p["cvr"] / 100.0 * RNG.uniform(0.7, 1.3))
            rto = _round_rand(orders * p["rto_pct"] / 100.0)
            returns = _round_rand(orders * RNG.uniform(0.01, 0.05))
            ratings_count += RNG.randint(0, 3)
            bad_ratings = int(round(ratings_count * p["qs"] / 100.0))
            rating = round(min(5.0, max(1.0, p["rating"] + RNG.uniform(-0.05, 0.05))), 1)
            stock = p["stock"] if p["stock"] == 0 else max(
                0, p["stock"] - int((DAYS - 1 - d) * RNG.uniform(0.2, 0.8)))
            add_snapshot(
                conn, lid, day.isoformat(timespec="seconds"),
                impressions=impressions, views=views, clicks=clicks, orders=orders,
                returns=returns, rto=rto, rating=rating, ratings_count=ratings_count,
                bad_ratings=bad_ratings, quality_score=round(p["qs"], 1),
                price=round(p["price"] * p["price_factor"], 2),
                recommended_price=round(p["price"], 2), stock=stock,
                dispatch_sla=round(p["dispatch_sla"], 1),
                cancellations=int(orders * RNG.uniform(0.0, 0.03)),
            )


def seed_demo(db_path):
    """Wipe and reseed the DB with demo data, then recompute recs/alerts."""
    conn = get_conn(db_path)
    try:
        init_db(conn)
        for table in ("snapshots", "alerts", "recommendations", "listings"):
            conn.execute(f"DELETE FROM {table}")
        conn.commit()
        _seed(conn)
        log_data_event(conn, "demo", "ok", "seeded 25 listings / 30 days of snapshots")
    finally:
        conn.close()

    # Best-effort recompute; a missing recommender module must not break seeding.
    try:
        from app.recommender import evaluate_all
        conn = get_conn(db_path)
        try:
            evaluate_all(conn)
        finally:
            conn.close()
    except Exception:
        pass

    # Best-effort alert dispatch; a missing alerts module must not break seeding.
    try:
        from app.alerts import dispatch_unsent
        conn = get_conn(db_path)
        try:
            dispatch_unsent(conn)
        finally:
            conn.close()
    except Exception:
        pass
