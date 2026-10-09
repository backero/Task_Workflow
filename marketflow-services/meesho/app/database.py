"""SQLite data layer for Meesho Seller Command Center.

Stdlib sqlite3 only. This module must NOT import Flask.
Timestamps are ISO format strings (datetime.now().isoformat(timespec='seconds')).

Pattern: get_conn(db_path) opens a NEW connection each call (thread-safe);
callers are responsible for closing it.
"""

import sqlite3
from datetime import datetime, timedelta

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_id TEXT UNIQUE,
    name TEXT,
    category TEXT,
    price REAL,
    status TEXT DEFAULT 'live',
    created_at TEXT,
    ndd INTEGER DEFAULT 0,
    is_ad INTEGER DEFAULT 0,
    last_refresh_at TEXT
);
CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    ts TEXT,
    impressions INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    orders INTEGER DEFAULT 0,
    returns INTEGER DEFAULT 0,
    rto INTEGER DEFAULT 0,
    rating REAL,
    ratings_count INTEGER DEFAULT 0,
    bad_ratings INTEGER DEFAULT 0,
    quality_score REAL,
    price REAL,
    recommended_price REAL,
    stock INTEGER DEFAULT 0,
    dispatch_sla REAL,
    cancellations INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_snapshots_listing_ts ON snapshots(listing_id, ts);
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT,
    severity TEXT,
    listing_id INTEGER,
    code TEXT,
    message TEXT,
    acknowledged INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT,
    listing_id INTEGER,
    code TEXT,
    priority TEXT,
    title TEXT,
    reason TEXT,
    action TEXT,
    source TEXT,
    status TEXT DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS robot_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    status TEXT NOT NULL,          -- ok | partial | skipped | needs_you | failed
    detail TEXT
);
CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS data_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT,
    source TEXT,
    status TEXT,
    detail TEXT
);
"""

SNAPSHOT_COLS = (
    "impressions", "views", "clicks", "orders", "returns", "rto",
    "rating", "ratings_count", "bad_ratings", "quality_score", "price",
    "recommended_price", "stock", "dispatch_sla", "cancellations",
)


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def init_db(conn):
    """Create tables/indexes if they do not exist."""
    conn.executescript(SCHEMA)
    conn.commit()


def get_conn(db_path):
    """Open a NEW connection (thread-safe pattern). Caller closes it."""
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # Real seller data now lives here (it is no longer only re-derivable demo data), so: write-ahead log (readers never
    # block the writer and a crash cannot corrupt the file) with NORMAL sync, and wait for a busy database, not fail.
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def upsert_listing(conn, catalog_id, name, category, price, status, created_at,
                   ndd=0, is_ad=0, last_refresh_at=None):
    """Insert or update a listing keyed by catalog_id. Returns listing id."""
    row = conn.execute(
        "SELECT id FROM listings WHERE catalog_id = ?", (catalog_id,)
    ).fetchone()
    if row:
        conn.execute(
            """UPDATE listings SET name=?, category=?, price=?, status=?,
               ndd=?, is_ad=?, last_refresh_at=COALESCE(?, last_refresh_at)
               WHERE id=?""",
            (name, category, price, status, ndd, is_ad, last_refresh_at, row["id"]),
        )
        conn.commit()
        return row["id"]
    cur = conn.execute(
        """INSERT INTO listings
           (catalog_id, name, category, price, status, created_at, ndd, is_ad, last_refresh_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (catalog_id, name, category, price, status, created_at, ndd, is_ad, last_refresh_at),
    )
    conn.commit()
    return cur.lastrowid


def add_snapshot(conn, listing_id, ts, **metrics):
    """Append a daily metrics snapshot for a listing.

    If quality_score is not given but bad_ratings/ratings_count are, it is
    derived as bad_ratings/ratings_count*100.
    """
    vals = {c: metrics.get(c) for c in SNAPSHOT_COLS}
    # Counters that are simply absent from a report are 0. STOCK is not one of them: a report without a stock column
    # used to be stored as "stock 0" and raised a critical OUT-OF-STOCK alert on every listing. Unknown stays NULL.
    for int_col in ("impressions", "views", "clicks", "orders", "returns",
                    "rto", "ratings_count", "bad_ratings", "cancellations"):
        if vals[int_col] is None:
            vals[int_col] = 0
    if vals["quality_score"] is None:
        rc = vals["ratings_count"] or 0
        if rc > 0:
            vals["quality_score"] = round(vals["bad_ratings"] / rc * 100.0, 2)
    cols = ", ".join(["listing_id", "ts"] + list(SNAPSHOT_COLS))
    marks = ", ".join(["?"] * (2 + len(SNAPSHOT_COLS)))
    conn.execute(
        f"INSERT INTO snapshots ({cols}) VALUES ({marks})",
        [listing_id, ts] + [vals[c] for c in SNAPSHOT_COLS],
    )
    conn.commit()


def latest_snapshot(conn, listing_id):
    """Most recent snapshot row for a listing, or None."""
    return conn.execute(
        "SELECT * FROM snapshots WHERE listing_id=? ORDER BY ts DESC, id DESC LIMIT 1",
        (listing_id,),
    ).fetchone()


def _ref_ts(conn):
    """Reference 'now' for window queries: latest snapshot ts in the DB,
    falling back to real now. Keeps 7d metrics meaningful for stale data."""
    row = conn.execute("SELECT MAX(ts) AS m FROM snapshots").fetchone()
    if row and row["m"]:
        return _parse_ts(row["m"])
    return datetime.now()


def _parse_ts(ts):
    try:
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return datetime.now()


def snapshots_since(conn, listing_id, days):
    """Snapshots for a listing within the last `days` days (data-relative),
    oldest first."""
    cutoff = (_ref_ts(conn) - timedelta(days=days)).isoformat(timespec="seconds")
    return conn.execute(
        "SELECT * FROM snapshots WHERE listing_id=? AND ts>=? ORDER BY ts ASC, id ASC",
        (listing_id, cutoff),
    ).fetchall()


def all_listings(conn):
    return conn.execute("SELECT * FROM listings ORDER BY id ASC").fetchall()


def listing_row(conn, listing_id):
    return conn.execute(
        "SELECT * FROM listings WHERE id=?", (listing_id,)
    ).fetchone()


def listing_metrics_7d(conn, listing_id):
    """7-day summed metrics + derived ratios for a listing.

    ctr = clicks/impressions*100, cvr = orders/views*100,
    rto_pct = rto/orders*100, return_pct = returns/orders*100.
    Zero-safe: returns zeros on empty data. Never stores derived values.
    """
    rows = snapshots_since(conn, listing_id, 7)
    m = {
        "impressions_7d": sum(r["impressions"] or 0 for r in rows),
        "views_7d": sum(r["views"] or 0 for r in rows),
        "clicks_7d": sum(r["clicks"] or 0 for r in rows),
        "orders_7d": sum(r["orders"] or 0 for r in rows),
        "returns_7d": sum(r["returns"] or 0 for r in rows),
        "rto_7d": sum(r["rto"] or 0 for r in rows),
    }
    imp, views, orders = m["impressions_7d"], m["views_7d"], m["orders_7d"]
    m["ctr"] = round(m["clicks_7d"] / imp * 100.0, 2) if imp else 0.0
    m["cvr"] = round(orders / views * 100.0, 2) if views else 0.0
    m["rto_pct"] = round(m["rto_7d"] / orders * 100.0, 2) if orders else 0.0
    m["return_pct"] = round(m["returns_7d"] / orders * 100.0, 2) if orders else 0.0
    return m


def kpis(conn):
    """Headline KPIs for the dashboard. Zero-safe on empty tables."""
    k = {}
    row = conn.execute(
        """SELECT COUNT(*) AS listings,
                  SUM(CASE WHEN status='live' THEN 1 ELSE 0 END) AS live,
                  SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked
           FROM listings"""
    ).fetchone()
    k["listings"] = row["listings"] or 0
    k["live"] = row["live"] or 0
    k["blocked"] = row["blocked"] or 0

    cutoff = (_ref_ts(conn) - timedelta(days=7)).isoformat(timespec="seconds")
    # Each panel read stores the panel's current per-listing figures again, so summing every snapshot in the
    # window counted the same numbers many times over (once per read). Use only the latest snapshot per listing.
    row = conn.execute(
        "SELECT COALESCE(SUM(s.orders),0) AS o, COALESCE(SUM(s.impressions),0) AS i "
        "FROM snapshots s JOIN (SELECT listing_id, MAX(ts) AS mts FROM snapshots WHERE ts>=? GROUP BY listing_id) t "
        "ON t.listing_id = s.listing_id AND t.mts = s.ts", (cutoff,)
    ).fetchone()
    k["orders_7d"] = row["o"] or 0
    k["impressions_7d"] = row["i"] or 0

    # The figures a seller sees on Meesho's Business Dashboard headline ("Total Views / Clicks / Orders / Conversion
    # Rate / Total Sales" for the selected period) are the account's real totals. The per-product table below it is
    # refreshed on a different schedule and does not add up to them, so when the headline has been read it wins.
    try:
        head = conn.execute(
            "SELECT key, value, captured_at FROM panel_metrics WHERE area='business_overview' AND value IS NOT NULL "
            "AND captured_at=(SELECT MAX(captured_at) FROM panel_metrics WHERE area='business_overview')"
        ).fetchall()
        h = {r["key"]: r["value"] for r in head}
        if h.get("views") is not None:
            k["impressions_7d"] = int(h["views"])
            k["orders_7d"] = int(h.get("orders") or 0)
            k["clicks_7d"] = int(h.get("clicks") or 0)
            k["sales_7d"] = float(h.get("sales") or 0)
            k["conversion_pct_7d"] = h.get("conversion_pct")
            k["account_totals_read_at"] = head[0]["captured_at"]
    except Exception:
        pass

    # Latest snapshot per listing -> average quality score & rating.
    row = conn.execute(
        """SELECT AVG(s.quality_score) AS aqs, AVG(s.rating) AS ar
           FROM snapshots s
           JOIN (SELECT listing_id, MAX(ts) AS mts FROM snapshots GROUP BY listing_id) t
             ON t.listing_id = s.listing_id AND t.mts = s.ts"""
    ).fetchone()
    k["avg_quality_score"] = round(row["aqs"], 2) if row and row["aqs"] is not None else 0.0
    k["avg_rating"] = round(row["ar"], 2) if row and row["ar"] is not None else 0.0

    k["open_critical_alerts"] = unacked_critical_count(conn)
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM recommendations WHERE status='open'"
    ).fetchone()
    k["open_recs"] = row["c"] or 0
    return k


def add_alert(conn, severity, code, message, listing_id=None):
    cur = conn.execute(
        "INSERT INTO alerts (ts, severity, listing_id, code, message, acknowledged, sent)"
        " VALUES (?,?,?,?,?,0,0)",
        (now_iso(), severity, listing_id, code, message),
    )
    conn.commit()
    return cur.lastrowid


def add_recommendation(conn, listing_id, code, priority, title, reason, action, source):
    cur = conn.execute(
        """INSERT INTO recommendations
           (ts, listing_id, code, priority, title, reason, action, source, status)
           VALUES (?,?,?,?,?,?,?,?,'open')""",
        (now_iso(), listing_id, code, priority, title, reason, action, source),
    )
    conn.commit()
    return cur.lastrowid


def open_recommendations(conn, listing_id=None):
    if listing_id is None:
        return conn.execute(
            "SELECT * FROM recommendations WHERE status='open' ORDER BY id DESC"
        ).fetchall()
    return conn.execute(
        "SELECT * FROM recommendations WHERE status='open' AND listing_id=? ORDER BY id DESC",
        (listing_id,),
    ).fetchall()


def alerts(conn, limit=200, unacked_only=False):
    sql = "SELECT * FROM alerts"
    if unacked_only:
        sql += " WHERE acknowledged=0"
    sql += " ORDER BY id DESC LIMIT ?"
    return conn.execute(sql, (limit,)).fetchall()


def ack_alert(conn, alert_id):
    conn.execute("UPDATE alerts SET acknowledged=1 WHERE id=?", (alert_id,))
    conn.commit()


def refresh_recommendation(conn, listing_id, code, priority, reason):
    """An open recommendation whose problem still exists: keep its numbers current (they froze at first sight)."""
    conn.execute(
        "UPDATE recommendations SET reason=?, priority=? WHERE listing_id IS ? AND code=? AND status='open'",
        (reason, priority, listing_id, code),
    )
    conn.commit()


def resolve_recommendation(conn, listing_id, code):
    """The problem behind an open recommendation is gone: close it (status 'resolved', not the owner's 'done')."""
    conn.execute(
        "UPDATE recommendations SET status='resolved' WHERE listing_id IS ? AND code=? AND status='open'",
        (listing_id, code),
    )
    conn.commit()


def close_recommendation(conn, rec_id):
    conn.execute("UPDATE recommendations SET status='done' WHERE id=?", (rec_id,))
    conn.commit()


def log_data_event(conn, source, status, detail=""):
    conn.execute(
        "INSERT INTO data_log (ts, source, status, detail) VALUES (?,?,?,?)",
        (now_iso(), source, status, detail),
    )
    conn.commit()


def unacked_critical_count(conn):
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM alerts WHERE severity='critical' AND acknowledged=0"
    ).fetchone()
    return row["c"] or 0


def has_open_rec(conn, listing_id, code):
    row = conn.execute(
        "SELECT 1 FROM recommendations WHERE listing_id IS ? AND code=? AND status='open' LIMIT 1",
        (listing_id, code),
    ).fetchone()
    return row is not None


def has_unacked_alert(conn, listing_id, code):
    row = conn.execute(
        "SELECT 1 FROM alerts WHERE listing_id IS ? AND code=? AND acknowledged=0 LIMIT 1",
        (listing_id, code),
    ).fetchone()
    return row is not None


def last_upload_time(conn):
    """Most recent listings.created_at (for the upload-cadence rule), or None."""
    row = conn.execute("SELECT MAX(created_at) AS m FROM listings").fetchone()
    return row["m"] if row and row["m"] else None
