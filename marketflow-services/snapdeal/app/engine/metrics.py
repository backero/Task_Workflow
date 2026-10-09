"""Metric computations on top of raw DB rows (CTR, CVR, ACOS, velocity, audit scores)."""
import datetime
from .. import database as db

def listing_metrics(sku, days=30):
    rows = db.q("""SELECT * FROM metrics_daily WHERE listing_sku=? ORDER BY day""", (sku,))
    cut = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    rows = [r for r in rows if r["day"] >= cut]
    imp = sum(r["impressions"] for r in rows)
    clk = sum(r["clicks"] for r in rows)
    ords = sum(r["orders"] for r in rows)
    rev = sum(r["revenue"] for r in rows)
    return dict(impressions=imp, clicks=clk, orders=ords, revenue=round(rev, 2),
                ctr=round(clk / imp * 100, 2) if imp else 0,
                cvr=round(ords / clk * 100, 2) if clk else 0,
                cancellations=sum(r["cancellations"] for r in rows),
                dto=sum(r["dto"] for r in rows), rto=sum(r["rto"] for r in rows))

def audit_score(l):
    """0-100 listing quality score from QC gate + content completeness."""
    s = 0
    if l["image_ok"]: s += 30
    if l["attrs_total"] and l["attrs_filled"] / l["attrs_total"] >= 0.8: s += 25
    elif l["attrs_total"]: s += int(25 * l["attrs_filled"] / l["attrs_total"] / 0.8)
    if l["mrp"]:
        disc = (1 - l["price"] / l["mrp"]) * 100
        if 40 <= disc <= 75: s += 20
        elif disc >= 25: s += 10
    if l["stock"] > 0: s += 15
    if l["rating"] >= 4.0: s += 10
    elif l["rating"] >= 3.5: s += 5
    return min(100, s)

def ads_summary(days=30):
    cut = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    rows = db.q("SELECT * FROM ads_daily WHERE day >= ?", (cut,))
    t = dict(spend=0, impressions=0, clicks=0, orders=0, revenue=0)
    for r in rows:
        for k in t: t[k] += r[k]
    t["cpc"] = round(t["spend"] / t["clicks"], 2) if t["clicks"] else 0
    t["ctr"] = round(t["clicks"] / t["impressions"] * 100, 2) if t["impressions"] else 0
    t["cvr"] = round(t["orders"] / t["clicks"] * 100, 2) if t["clicks"] else 0
    t["acos"] = round(t["spend"] / t["revenue"] * 100, 1) if t["revenue"] else 0
    t["roas"] = round(t["revenue"] / t["spend"], 2) if t["spend"] else 0
    t["spend"] = round(t["spend"], 2); t["revenue"] = round(t["revenue"], 2)
    return t

def overview():
    listings = db.q("SELECT * FROM listings")
    sc = db.q("SELECT * FROM scorecard ORDER BY day DESC LIMIT 1")
    tot = dict(impressions=0, clicks=0, orders=0, revenue=0)
    for l in listings:
        m = listing_metrics(l["sku"], 7)
        for k in tot: tot[k] += m[k]
    alerts = db.q("SELECT severity, COUNT(*) n FROM alerts WHERE status='open' GROUP BY severity")
    panel = None
    try:
        rows = db.q("SELECT key, value, text, captured_at FROM panel_metrics WHERE area='dashboard' "
                    "AND captured_at=(SELECT MAX(captured_at) FROM panel_metrics WHERE area='dashboard')")
        if rows:
            panel = {r["key"]: (r["value"] if r["value"] is not None else r["text"]) for r in rows}
            panel["captured_at"] = rows[0]["captured_at"]
    except Exception:
        panel = None
    # "live" must mean the listing is actually active on Snapdeal (status == 'live'), not just
    # that stock > 0 - a delisted/discontinued SKU can still carry leftover stock in our last
    # scrape (confirmed: 26 of 72 listings here are stock>0 but status='not_live', including
    # every old 30ml variant Snapdeal has since discontinued). Counting those as "live" inflated
    # the active count from the real 37 to a phantom 63.
    return dict(
        listings=len(listings),
        live=sum(1 for l in listings if l["status"] == "live"),
        oos=sum(1 for l in listings if l["status"] != "live"),
        week=tot, scorecard=sc[0] if sc else None, panel=panel,
        open_alerts={a["severity"]: a["n"] for a in alerts})
