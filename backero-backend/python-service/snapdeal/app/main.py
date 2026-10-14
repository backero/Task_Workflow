"""SD Pulse API + dashboard host."""
import os, shutil, datetime
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from . import database as db
from . import scheduler
from .engine import metrics

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(BASE, "app", "static")
UPLOADS = os.path.join(BASE, "data", "uploads")

app = FastAPI(title="SD Pulse", version="1.0")
# For the unified cross-platform dashboard (a separate app, its own origin) reading /api/* read-only. No secrets
# live behind these routes; this data is already local-machine-only.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])

@app.on_event("startup")
def _boot():
    db.init()
    scheduler.start()
    # first sync immediately so the dashboard is never empty
    import threading
    threading.Thread(target=scheduler.sync_now, daemon=True).start()

# ---------- API ----------
@app.get("/api/status")
def status():
    return {"connector": os.environ.get("SD_CONNECTOR", "demo"),
            "demo": scheduler.get_connector().is_demo,
            "time": db.now(),
            "last_syncs": db.q("SELECT * FROM sync_log ORDER BY id DESC LIMIT 8")}

@app.get("/api/robot")
def api_robot():
    """SD Robo: state, what each background job did and how it ended (see app/robot.py)."""
    from . import robot
    con = scheduler.get_connector()
    return robot.read(con.name, con.is_demo)

@app.get("/api/panel")
def api_panel():
    """The real numbers the keeper read from the Seller Panel (panel_metrics), latest value of each key."""
    from .connectors import panel_reader
    with db.conn() as c:
        c.executescript(panel_reader.SCHEMA)
        rows = c.execute("SELECT area, key, value, text, captured_at FROM panel_metrics WHERE id IN "
                         "(SELECT MAX(id) FROM panel_metrics GROUP BY area, key)").fetchall()
    areas = {}
    for r in rows:
        areas.setdefault(r["area"], {})[r["key"]] = {"value": r["value"], "text": r["text"], "at": r["captured_at"]}
    at = max((v["at"] for a in areas.values() for v in a.values()), default=None)
    return {"captured_at": at, "areas": areas}

@app.get("/api/ai_insights")
def api_ai_insights():
    """The AI strategist's recent analyses (app/ai_analysis.py), newest first."""
    with db.conn() as c:
        c.executescript("CREATE TABLE IF NOT EXISTS ai_insights(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, "
                        "summary TEXT NOT NULL, model TEXT, based_on TEXT)")
        rows = [dict(r) for r in c.execute("SELECT id, ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 10")]
    return rows

@app.get("/api/overview")
def api_overview():
    return metrics.overview()

@app.get("/api/listings")
def api_listings():
    from .connectors import panel_reader
    with db.conn() as c:
        c.executescript(panel_reader.SCHEMA)
    extra = {r["sku"]: r for r in db.q("SELECT * FROM listing_panel")}
    perf = {r["sku"]: r for r in db.q("SELECT * FROM sku_performance")}
    out = []
    for l in db.q("SELECT * FROM listings ORDER BY status, sku"):
        e, p = extra.get(l["sku"]) or {}, perf.get(l["sku"]) or {}
        l["panel"] = {"product_rating_pct": e.get("product_rating_pct"), "gross_payable": e.get("gross_payable"),
                      "msp": e.get("msp"), "orders_30d": p.get("orders_30d"), "sales_30d": p.get("transfer_amount_30d"),
                      "bad_pct": p.get("bad_pct")}
        m = metrics.listing_metrics(l["sku"], 30)
        l["metrics"] = m
        l["audit_score"] = metrics.audit_score(l)
        l["discount_pct"] = round((1 - l["price"] / l["mrp"]) * 100, 1) if l["mrp"] else 0
        out.append(l)
    return out

@app.get("/api/payments")
def api_payments():
    from .connectors import panel_reader
    with db.conn() as c:
        c.executescript(panel_reader.SCHEMA)
    rows = db.q("SELECT * FROM settlements")
    rows.sort(key=lambda r: datetime.datetime.strptime(r["date"], "%d %b %Y"), reverse=True)
    return {"settlements": rows}

@app.get("/api/listing/{sku}/series")
def api_listing_series(sku: str):
    return db.q("SELECT * FROM metrics_daily WHERE listing_sku=? ORDER BY day", (sku,))

@app.get("/api/health")
def api_health():
    return {"latest": (db.q("SELECT * FROM scorecard ORDER BY day DESC LIMIT 1") or [None])[0],
            "history": db.q("SELECT * FROM scorecard ORDER BY day DESC LIMIT 30")}

@app.get("/api/ranks")
def api_ranks():
    return db.q("""SELECT r.*, l.title FROM rank_history r
                   LEFT JOIN listings l ON l.sku = r.listing_sku
                   ORDER BY r.day DESC, r.keyword, r.position""")

@app.get("/api/ads")
def api_ads():
    camps = db.q("""SELECT campaign, sku, SUM(spend) spend, SUM(impressions) impressions,
                    SUM(clicks) clicks, SUM(orders) orders, SUM(revenue) revenue
                    FROM ads_daily GROUP BY campaign""")
    for c in camps:
        c["cpc"] = round(c["spend"] / c["clicks"], 2) if c["clicks"] else 0
        c["acos"] = round(c["spend"] / c["revenue"] * 100, 1) if c["revenue"] else 0
        c["roas"] = round(c["revenue"] / c["spend"], 2) if c["spend"] else 0
    daily = db.q("""SELECT day, SUM(spend) spend, SUM(revenue) revenue, SUM(clicks) clicks,
                    SUM(orders) orders FROM ads_daily GROUP BY day ORDER BY day""")
    return {"summary": metrics.ads_summary(30), "campaigns": camps, "daily": daily}

@app.get("/api/alerts")
def api_alerts(status: str = "open"):
    if status == "all":
        return db.q("SELECT * FROM alerts ORDER BY id DESC LIMIT 200")
    return db.q("SELECT * FROM alerts WHERE status=? ORDER BY id DESC LIMIT 200", (status,))

@app.post("/api/alerts/{aid}/resolve")
def api_resolve(aid: int):
    with db.conn() as c:
        c.execute("UPDATE alerts SET status='resolved' WHERE id=?", (aid,))
    return {"ok": True}

@app.post("/api/sync")
def api_sync():
    return scheduler.sync_now()

@app.post("/api/rank-sync")
def api_rank_sync():
    return scheduler.rank_now()

@app.post("/api/upload/{kind}")
async def api_upload(kind: str, file: UploadFile = File(...)):
    """kind: listings | orders | scorecard | ads — saved as {kind}_<ts>.csv"""
    os.makedirs(UPLOADS, exist_ok=True)
    if kind not in ("listings", "orders", "scorecard", "ads"):
        return {"error": "kind must be listings|orders|scorecard|ads"}
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(UPLOADS, f"{kind}_{ts}.csv")
    with open(path, "wb") as fh:
        shutil.copyfileobj(file.file, fh)
    db.log_sync("csv", "uploaded", f"{kind} -> {os.path.basename(path)}")
    return {"saved": os.path.basename(path),
            "note": "Switch SD_CONNECTOR=csv (or keep auto) and run a sync to ingest."}

@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))

app.mount("/static", StaticFiles(directory=STATIC), name="static")
