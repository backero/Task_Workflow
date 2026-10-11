"""SQLite persistence layer. Plain sqlite3 — no ORM, zero surprises on a bare PC."""
import sqlite3, os, json, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(BASE, "data", "sdpulse.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings(
  sku TEXT PRIMARY KEY, title TEXT, brand TEXT, category TEXT,
  price REAL, mrp REAL, stock INTEGER, status TEXT,
  rating REAL, reviews INTEGER, fulfilment TEXT,
  image_ok INTEGER, attrs_filled INTEGER, attrs_total INTEGER,
  created TEXT, updated TEXT, last_synced TEXT);
CREATE TABLE IF NOT EXISTS metrics_daily(
  listing_sku TEXT, day TEXT, impressions INTEGER, clicks INTEGER,
  orders INTEGER, cancellations INTEGER, dto INTEGER, rto INTEGER,
  revenue REAL, PRIMARY KEY(listing_sku, day));
CREATE TABLE IF NOT EXISTS scorecard(
  day TEXT PRIMARY KEY, cancellation_pct REAL, ontime_pct REAL,
  rating REAL, dto_pct REAL, rto_pct REAL, dispatched_24h_pct REAL);
CREATE TABLE IF NOT EXISTS rank_history(
  listing_sku TEXT, keyword TEXT, position INTEGER, page INTEGER,
  day TEXT, PRIMARY KEY(listing_sku, keyword, day));
CREATE TABLE IF NOT EXISTS ads_daily(
  campaign TEXT, sku TEXT, day TEXT, spend REAL, impressions INTEGER,
  clicks INTEGER, orders INTEGER, revenue REAL, PRIMARY KEY(campaign, day));
CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, severity TEXT,
  module TEXT, entity TEXT, code TEXT, title TEXT, reason TEXT, fix TEXT,
  source TEXT, status TEXT DEFAULT 'open');
CREATE TABLE IF NOT EXISTS robot_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT, started_at TEXT, finished_at TEXT,
  status TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sync_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, connector TEXT,
  status TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
"""

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init():
    with conn() as c:
        c.executescript(SCHEMA)
        # `code` was added after alerts already shipped (2026-09-26) - add it to a database that predates it.
        cols = {r["name"] for r in c.execute("PRAGMA table_info(alerts)").fetchall()}
        if "code" not in cols:
            c.execute("ALTER TABLE alerts ADD COLUMN code TEXT")

def now():
    return datetime.datetime.now().isoformat(timespec="seconds")

def today():
    return datetime.date.today().isoformat()

# ---------- writes ----------
def upsert_listings(rows):
    with conn() as c:
        for r in rows:
            c.execute("""INSERT INTO listings(sku,title,brand,category,price,mrp,stock,
              status,rating,reviews,fulfilment,image_ok,attrs_filled,attrs_total,
              created,updated,last_synced)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(sku) DO UPDATE SET title=excluded.title,brand=excluded.brand,
              category=excluded.category,price=excluded.price,mrp=excluded.mrp,
              stock=excluded.stock,status=excluded.status,rating=excluded.rating,
              reviews=excluded.reviews,fulfilment=excluded.fulfilment,
              image_ok=excluded.image_ok,attrs_filled=excluded.attrs_filled,
              attrs_total=excluded.attrs_total,updated=excluded.updated,
              last_synced=excluded.last_synced""",
              (r["sku"], r["title"], r.get("brand",""), r.get("category",""),
               r.get("price",0), r.get("mrp",0), r.get("stock",0), r.get("status","live"),
               r.get("rating",0), r.get("reviews",0), r.get("fulfilment","Dropship"),
               int(r.get("image_ok",1)), r.get("attrs_filled",0), r.get("attrs_total",10),
               r.get("created", today()), r.get("updated", today()), now()))

def upsert_metrics(rows):
    with conn() as c:
        for r in rows:
            c.execute("""INSERT INTO metrics_daily VALUES(?,?,?,?,?,?,?,?,?)
              ON CONFLICT(listing_sku,day) DO UPDATE SET impressions=excluded.impressions,
              clicks=excluded.clicks,orders=excluded.orders,cancellations=excluded.cancellations,
              dto=excluded.dto,rto=excluded.rto,revenue=excluded.revenue""",
              (r["sku"], r["day"], r.get("impressions",0), r.get("clicks",0),
               r.get("orders",0), r.get("cancellations",0), r.get("dto",0),
               r.get("rto",0), r.get("revenue",0.0)))

def upsert_scorecard(r):
    with conn() as c:
        c.execute("""INSERT INTO scorecard VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(day) DO UPDATE SET cancellation_pct=excluded.cancellation_pct,
          ontime_pct=excluded.ontime_pct,rating=excluded.rating,dto_pct=excluded.dto_pct,
          rto_pct=excluded.rto_pct,dispatched_24h_pct=excluded.dispatched_24h_pct""",
          (r["day"], r["cancellation_pct"], r["ontime_pct"], r["rating"],
           r["dto_pct"], r.get("rto_pct",0), r.get("dispatched_24h_pct",0)))

def upsert_ranks(rows):
    with conn() as c:
        for r in rows:
            c.execute("""INSERT INTO rank_history VALUES(?,?,?,?,?)
              ON CONFLICT(listing_sku,keyword,day) DO UPDATE SET
              position=excluded.position,page=excluded.page""",
              (r["sku"], r["keyword"], r["position"], r.get("page",1), r["day"]))

def upsert_ads(rows):
    with conn() as c:
        for r in rows:
            c.execute("""INSERT INTO ads_daily VALUES(?,?,?,?,?,?,?,?)
              ON CONFLICT(campaign,day) DO UPDATE SET spend=excluded.spend,
              impressions=excluded.impressions,clicks=excluded.clicks,
              orders=excluded.orders,revenue=excluded.revenue""",
              (r["campaign"], r.get("sku",""), r["day"], r.get("spend",0),
               r.get("impressions",0), r.get("clicks",0), r.get("orders",0),
               r.get("revenue",0)))

def add_alert(a):
    """Open a new alert, or refresh an open one that already covers this (entity, code) with today's numbers.

    Before 2026-09-26 this de-duplicated on the exact TITLE string - but every title embeds the live metric
    ("Cancellation rate 1.4% breaches..."), so a value that moved by 0.1% looked like a brand-new problem and a
    fresh row was added forever; the one call site that tried to close a solved alert compared against a title
    with the number left out, so it never matched anything either. `code` is the rule's stable identity;
    the numbers only ever live in the text.
    Returns True if this created a new alert (False if it refreshed an existing open one).
    """
    with conn() as c:
        existing = c.execute("SELECT id FROM alerts WHERE entity=? AND code=? AND status='open'",
                             (a["entity"], a["code"])).fetchone()
        if existing:
            c.execute("""UPDATE alerts SET ts=?, severity=?, title=?, reason=?, fix=?
                         WHERE id=?""",
                      (now(), a["severity"], a["title"], a["reason"], a["fix"], existing["id"]))
            return False
        c.execute("""INSERT INTO alerts(ts,severity,module,entity,code,title,reason,fix,source)
                     VALUES(?,?,?,?,?,?,?,?,?)""",
                  (now(), a["severity"], a["module"], a["entity"], a["code"], a["title"],
                   a["reason"], a["fix"], a["source"]))
        return True

def clear_cleared_alerts(evaluated, fired):
    """An open alert whose condition was checked this pass (its (entity, code) is in `evaluated`) but did not fire
    (not in `fired`) has been fixed: close it as 'cleared' - never 'resolved', which stays the meaning of the
    operator's own "mark done" button. An alert whose rule was not run this pass (e.g. no scorecard row yet) is
    left alone: silence is not the same as "measured and fine"."""
    with conn() as c:
        rows = c.execute("SELECT id, entity, code FROM alerts WHERE status='open' AND code IS NOT NULL").fetchall()
        for r in rows:
            key = (r["entity"], r["code"])
            if key in evaluated and key not in fired:
                c.execute("UPDATE alerts SET status='cleared' WHERE id=?", (r["id"],))

def log_sync(connector, status, detail=""):
    with conn() as c:
        c.execute("INSERT INTO sync_log(ts,connector,status,detail) VALUES(?,?,?,?)",
                  (now(), connector, status, detail))

def set_setting(k, v):
    with conn() as c:
        c.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, v))

def get_setting(k, default=None):
    with conn() as c:
        r = c.execute("SELECT value FROM settings WHERE key=?", (k,)).fetchone()
        return r["value"] if r else default

def record_run(job, started, status, detail=""):
    """One line per background job run - what it did and how it ended. Never raises."""
    try:
        with conn() as c:
            c.execute("INSERT INTO robot_runs(job,started_at,finished_at,status,detail) VALUES(?,?,?,?,?)",
                      (job, started, now(), status, (detail or "")[:500]))
            c.execute("DELETE FROM robot_runs WHERE finished_at < datetime('now', '-30 days')")
    except Exception:
        pass

def q(sql, args=()):
    with conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]
