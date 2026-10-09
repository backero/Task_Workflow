"""JSON API for the Meesho Seller Command Center.

All endpoints return JSON. Sibling modules (database, recommender, alerts,
connector, demo_data, config) are lazy-imported INSIDE handlers and wrapped in
try/except so a missing or broken module degrades one endpoint to
{ok: False, error: ...} instead of 500-ing the whole API.

DB connections are opened per request. Path comes from
current_app.config['DB_PATH'] when set, else 'data/saas.db'.
"""
import os
import sqlite3
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

api = Blueprint("api", __name__, url_prefix="/api")

DEFAULT_DB = "data/saas.db"

KPI_KEYS = (
    "listings", "live", "blocked", "orders_7d", "impressions_7d",
    "avg_quality_score", "avg_rating", "open_critical_alerts", "open_recs",
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _db_path():
    return current_app.config.get("DB_PATH") or DEFAULT_DB


def _get_conn():
    """Open a per-request connection, preferring app.database.get_conn."""
    try:
        from app import database
        return database.get_conn(_db_path())
    except ImportError:
        conn = sqlite3.connect(_db_path())
        conn.row_factory = sqlite3.Row
        return conn


def _err(e):
    return jsonify(ok=False, error=f"{type(e).__name__}: {e}")


def _rows(result):
    return [dict(r) for r in result]


def _table_empty_or_missing(conn, table):
    try:
        conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone()
        return False
    except sqlite3.Error:
        return True


def _open_recs(conn, listing_id=None):
    try:
        from app import database
        return _rows(database.open_recommendations(conn, listing_id))
    except ImportError:
        q = "SELECT * FROM recommendations WHERE status = 'open'"
        params = ()
        if listing_id is not None:
            q += " AND listing_id = ?"
            params = (listing_id,)
        q += " ORDER BY id DESC"
        return _rows(conn.execute(q, params).fetchall())


def _all_alerts(conn, limit=200, unacked_only=False):
    try:
        from app import database
        return _rows(database.alerts(conn, limit=limit, unacked_only=unacked_only))
    except ImportError:
        q = "SELECT * FROM alerts"
        if unacked_only:
            q += " WHERE acknowledged = 0"
        q += " ORDER BY id DESC LIMIT ?"
        return _rows(conn.execute(q, (limit,)).fetchall())


def _latest_snapshot(conn, listing_id):
    try:
        from app import database
        row = database.latest_snapshot(conn, listing_id)
        return dict(row) if row else None
    except ImportError:
        row = conn.execute(
            "SELECT * FROM snapshots WHERE listing_id = ? ORDER BY ts DESC, id DESC LIMIT 1",
            (listing_id,),
        ).fetchone()
        return dict(row) if row else None


def _snapshots_since(conn, listing_id, days):
    try:
        from app import database
        return _rows(database.snapshots_since(conn, listing_id, days))
    except ImportError:
        return _rows(conn.execute(
            "SELECT * FROM snapshots WHERE listing_id = ? "
            "AND ts >= datetime('now', ?) ORDER BY ts ASC, id ASC",
            (listing_id, f"-{int(days)} days"),
        ).fetchall())


def _agg7(conn, listing_id):
    """7-day aggregate metrics for one listing (raw SQL; cheap and local)."""
    if _table_empty_or_missing(conn, "snapshots"):
        return {"impressions_7d": 0, "orders_7d": 0, "ctr": 0.0, "cvr": 0.0}
    row = conn.execute(
        "SELECT COALESCE(SUM(impressions),0) AS imp, COALESCE(SUM(views),0) AS views, "
        "COALESCE(SUM(clicks),0) AS clicks, COALESCE(SUM(orders),0) AS orders "
        "FROM snapshots WHERE listing_id = ? AND ts >= datetime('now', '-7 days')",
        (listing_id,),
    ).fetchone()
    imp, views, clicks, orders = row["imp"], row["views"], row["clicks"], row["orders"]
    return {
        "impressions_7d": imp,
        "orders_7d": orders,
        "ctr": round(clicks / imp * 100, 2) if imp else 0.0,
        "cvr": round(orders / views * 100, 2) if views else 0.0,
    }


def _rag(recs, unacked_alerts):
    """red: open critical rec or unacked critical alert;
    amber: open high/medium rec; else green."""
    if any(r.get("priority") == "critical" for r in recs) or \
            any(a.get("severity") == "critical" for a in unacked_alerts):
        return "red"
    if any(r.get("priority") in ("high", "medium") for r in recs):
        return "amber"
    return "green"


def _load_config():
    from app import config as cfgmod
    return cfgmod.load_config()


def _save_config(cfg):
    from app import config as cfgmod
    cfgmod.save_config(cfg)


# ---------------------------------------------------------------------------
# overview / listings
# ---------------------------------------------------------------------------

@api.get("/overview")
def overview():
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        kpis = {}
        try:
            from app import database
            kpis = dict(database.kpis(conn) or {})
        except ImportError:
            kpis = _kpis_fallback(conn)
        except sqlite3.Error:
            kpis = {}
        for k in KPI_KEYS:
            kpis.setdefault(k, 0)

        trends = {"dates": [], "impressions": [], "orders": [], "quality_score": []}
        if not _table_empty_or_missing(conn, "snapshots"):
            by_day = {r["d"]: r for r in conn.execute(
                "SELECT date(ts) AS d, SUM(impressions) AS imp, SUM(orders) AS ord, "
                "AVG(quality_score) AS qs FROM snapshots "
                "WHERE ts >= datetime('now', '-30 days') GROUP BY date(ts)"
            ).fetchall()}
            today = date.today()
            for i in range(29, -1, -1):
                d = (today - timedelta(days=i)).isoformat()
                r = by_day.get(d)
                trends["dates"].append(d)
                trends["impressions"].append(int(r["imp"] or 0) if r else 0)
                trends["orders"].append(int(r["ord"] or 0) if r else 0)
                trends["quality_score"].append(
                    round(r["qs"], 2) if r and r["qs"] is not None else None)

        top_issues = _all_alerts(conn, limit=5)[:5]
        return jsonify(ok=True, kpis=kpis, trends=trends, top_issues=top_issues)
    except Exception as e:
        return _err(e)
    finally:
        conn.close()


def _kpis_fallback(conn):
    out = {k: 0 for k in KPI_KEYS}
    if not _table_empty_or_missing(conn, "listings"):
        r = conn.execute(
            "SELECT COUNT(*) AS n, "
            "SUM(CASE WHEN status='live' THEN 1 ELSE 0 END) AS live, "
            "SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked "
            "FROM listings").fetchone()
        out["listings"] = r["n"] or 0
        out["live"] = r["live"] or 0
        out["blocked"] = r["blocked"] or 0
    if not _table_empty_or_missing(conn, "snapshots"):
        r = conn.execute(
            "SELECT COALESCE(SUM(orders),0) AS o, COALESCE(SUM(impressions),0) AS i "
            "FROM snapshots WHERE ts >= datetime('now', '-7 days')").fetchone()
        out["orders_7d"] = r["o"]
        out["impressions_7d"] = r["i"]
        r = conn.execute(
            "SELECT AVG(quality_score) AS qs, AVG(rating) AS rt FROM snapshots s "
            "WHERE s.id IN (SELECT MAX(id) FROM snapshots GROUP BY listing_id)").fetchone()
        out["avg_quality_score"] = round(r["qs"], 2) if r["qs"] is not None else 0
        out["avg_rating"] = round(r["rt"], 2) if r["rt"] is not None else 0
    if not _table_empty_or_missing(conn, "alerts"):
        out["open_critical_alerts"] = conn.execute(
            "SELECT COUNT(*) AS n FROM alerts WHERE severity='critical' AND acknowledged=0"
        ).fetchone()["n"]
    if not _table_empty_or_missing(conn, "recommendations"):
        out["open_recs"] = conn.execute(
            "SELECT COUNT(*) AS n FROM recommendations WHERE status='open'").fetchone()["n"]
    return out


@api.get("/listings")
def listings():
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        try:
            from app import database
            rows = _rows(database.all_listings(conn))
        except ImportError:
            if _table_empty_or_missing(conn, "listings"):
                rows = []
            else:
                rows = _rows(conn.execute("SELECT * FROM listings ORDER BY id").fetchall())

        open_recs = _open_recs(conn)
        recs_by_listing = {}
        for r in open_recs:
            recs_by_listing.setdefault(r.get("listing_id"), []).append(r)
        unacked = _all_alerts(conn, limit=1000, unacked_only=True)
        alerts_by_listing = {}
        for a in unacked:
            alerts_by_listing.setdefault(a.get("listing_id"), []).append(a)

        out = []
        for l in rows:
            lid = l["id"]
            snap = _latest_snapshot(conn, lid) or {}
            recs = recs_by_listing.get(lid, [])
            item = {
                "id": lid,
                "catalog_id": l.get("catalog_id"),
                "name": l.get("name"),
                "category": l.get("category"),
                "price": l.get("price"),
                "status": l.get("status"),
                "ndd": l.get("ndd", 0),
                "is_ad": l.get("is_ad", 0),
                "rating": snap.get("rating"),
                "quality_score": snap.get("quality_score"),
                "stock": snap.get("stock"),
                "rag": _rag(recs, alerts_by_listing.get(lid, [])),
                "open_recs": len(recs),
            }
            item.update(_agg7(conn, lid))
            out.append(item)
        return jsonify(out)
    except Exception as e:
        return _err(e)
    finally:
        conn.close()


@api.get("/listings/<int:lid>")
def listing_detail(lid):
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        try:
            from app import database
            row = database.listing_row(conn, lid)
            listing = dict(row) if row else None
        except ImportError:
            if _table_empty_or_missing(conn, "listings"):
                listing = None
            else:
                row = conn.execute("SELECT * FROM listings WHERE id = ?", (lid,)).fetchone()
                listing = dict(row) if row else None
        if listing is None:
            return jsonify(ok=False, error=f"listing {lid} not found"), 404

        snaps = _snapshots_since(conn, lid, 30)
        series = {"dates": [], "impressions": [], "views": [], "orders": [],
                  "quality_score": [], "rating": [], "price": [],
                  "recommended_price": [], "stock": []}
        for s in snaps:
            series["dates"].append((s.get("ts") or "")[:10])
            for k in ("impressions", "views", "orders", "quality_score",
                      "rating", "price", "recommended_price", "stock"):
                series[k].append(s.get(k))

        recs = _open_recs(conn, lid)
        listing_alerts = [a for a in _all_alerts(conn, limit=500)
                          if a.get("listing_id") == lid]
        item = dict(listing)
        item.update(_agg7(conn, lid))
        snap = _latest_snapshot(conn, lid) or {}
        item["rating"] = snap.get("rating", listing.get("rating"))
        item["quality_score"] = snap.get("quality_score")
        item["stock"] = snap.get("stock")
        return jsonify(ok=True, listing=item, series=series,
                       recommendations=recs, alerts=listing_alerts)
    except Exception as e:
        return _err(e)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# recommendations / alerts
# ---------------------------------------------------------------------------

@api.get("/recommendations")
def recommendations():
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        recs = _open_recs(conn)
        names = {}
        if not _table_empty_or_missing(conn, "listings"):
            for l in conn.execute("SELECT id, name FROM listings").fetchall():
                names[l["id"]] = l["name"]
        for r in recs:
            r["listing_name"] = names.get(r.get("listing_id"))
        return jsonify(recs)
    except Exception as e:
        return _err(e)
    finally:
        conn.close()


@api.post("/recommendations/<int:rec_id>/done")
def recommendation_done(rec_id):
    try:
        conn = _get_conn()
        from app import database
        database.close_recommendation(conn, rec_id)
        conn.commit()
        conn.close()
        return jsonify(ok=True, id=rec_id)
    except Exception as e:
        return _err(e)


@api.get("/alerts")
def alerts():
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        return jsonify(_all_alerts(conn, limit=200))
    except Exception as e:
        return _err(e)
    finally:
        conn.close()


@api.post("/alerts/<int:alert_id>/ack")
def alert_ack(alert_id):
    try:
        conn = _get_conn()
        from app import database
        database.ack_alert(conn, alert_id)
        conn.commit()
        conn.close()
        return jsonify(ok=True, id=alert_id)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# sources
# ---------------------------------------------------------------------------

@api.get("/sources/status")
def sources_status():
    mode = "demo"
    try:
        cfg = _load_config()
        mode = cfg.get("mode", "demo") if isinstance(cfg, dict) else "demo"
    except Exception:
        pass
    sess = False
    try:
        from app.connector import meesho_connector
        sess = bool(meesho_connector.session_exists())
    except Exception:
        sess = False
    events = []
    try:
        conn = _get_conn()
        try:
            if not _table_empty_or_missing(conn, "data_log"):
                events = _rows(conn.execute(
                    "SELECT * FROM data_log ORDER BY id DESC LIMIT 10").fetchall())
        finally:
            conn.close()
    except Exception:
        events = []
    return jsonify(ok=True, mode=mode, session_exists=sess, last_events=events)


@api.post("/sources/mode")
def sources_mode():
    body = request.get_json(force=True, silent=True) or {}
    mode = body.get("mode")
    if mode not in ("demo", "manual", "auto"):
        return jsonify(ok=False, error="mode must be one of: demo, manual, auto")
    try:
        cfg = _load_config()
        if not isinstance(cfg, dict):
            cfg = {}
        cfg["mode"] = mode
        _save_config(cfg)
        return jsonify(ok=True, mode=mode)
    except Exception as e:
        return _err(e)


@api.post("/sources/demo")
def sources_demo():
    try:
        from app import demo_data
        demo_data.seed_demo(_db_path())
        return jsonify(ok=True, detail="demo data reseeded")
    except Exception as e:
        return _err(e)


@api.post("/sources/upload")
def sources_upload():
    f = request.files.get("file")
    if f is None or not f.filename:
        return jsonify(ok=False, error="no file uploaded (multipart field 'file')")
    upload_dir = current_app.config.get("UPLOAD_DIR") or os.path.join("data", "uploads")
    try:
        os.makedirs(upload_dir, exist_ok=True)
        path = os.path.join(upload_dir, secure_filename(f.filename))
        f.save(path)
    except Exception as e:
        return _err(e)
    try:
        conn = _get_conn()
        from app.connector import report_importer
        result = report_importer.import_report(conn, path)
        conn.commit()
        conn.close()
        if isinstance(result, dict):
            result.setdefault("ok", True)
            return jsonify(result)
        return jsonify(ok=True, result=result)
    except Exception as e:
        return _err(e)


@api.post("/sources/connect")
def sources_connect():
    try:
        from app.connector import meesho_connector
        meesho_connector.start_login()
        status = {}
        try:
            status = meesho_connector.login_status()
        except Exception:
            pass
        return jsonify(ok=True, status=status)
    except Exception as e:
        return _err(e)


@api.get("/sources/connect/status")
def sources_connect_status():
    try:
        from app.connector import meesho_connector
        status = meesho_connector.login_status()
        if isinstance(status, dict):
            status.setdefault("ok", True)
            return jsonify(status)
        return jsonify(ok=True, status=status)
    except Exception as e:
        return _err(e)


# ---------------------------------------------------------------------------
# refresh / settings / ping
# ---------------------------------------------------------------------------

@api.post("/refresh")
def refresh():
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    new_count, sent = 0, 0
    errors = []
    try:
        try:
            from app import recommender
            new_count = recommender.evaluate_all(conn)
            conn.commit()
        except Exception as e:
            errors.append(f"evaluate_all: {type(e).__name__}: {e}")
        try:
            from app import alerts as alerts_mod
            sent = alerts_mod.dispatch_unsent(conn)
            conn.commit()
        except Exception as e:
            errors.append(f"dispatch_unsent: {type(e).__name__}: {e}")
        resp = {"ok": not errors, "new": new_count, "sent": sent}
        if errors:
            resp["error"] = "; ".join(errors)
        return jsonify(resp)
    finally:
        conn.close()


@api.get("/settings")
def settings_get():
    try:
        cfg = _load_config()
        return jsonify(ok=True, settings=cfg if isinstance(cfg, dict) else {})
    except Exception as e:
        return _err(e)


@api.post("/settings")
def settings_post():
    body = request.get_json(force=True, silent=True)
    if not isinstance(body, dict):
        return jsonify(ok=False, error="expected a JSON object of config values")
    try:
        _save_config(body)
        return jsonify(ok=True, settings=body)
    except Exception as e:
        return _err(e)


@api.post("/alerts/test")
def alerts_test():
    """Send a test alert over the configured channels (email / whatsapp)."""
    results = {}
    errors = []
    try:
        cfg = _load_config()
    except Exception as e:
        return _err(e)
    try:
        from app import alerts as alerts_mod
        acfg = (cfg.get("alerts") or {}) if isinstance(cfg, dict) else {}
        email_cfg = acfg.get("email") or {}
        wa_cfg = acfg.get("whatsapp") or {}
        if email_cfg.get("enabled"):
            try:
                results["email"] = bool(alerts_mod.send_email(
                    cfg, "Meesho Command Center — test alert",
                    "This is a test alert from your Meesho Seller Command Center."))
            except Exception as e:
                results["email"] = False
                errors.append(f"email: {e}")
        else:
            results["email"] = None
        if wa_cfg.get("enabled"):
            try:
                results["whatsapp"] = bool(alerts_mod.send_whatsapp(
                    cfg, "Meesho Command Center — test alert"))
            except Exception as e:
                results["whatsapp"] = False
                errors.append(f"whatsapp: {e}")
        else:
            results["whatsapp"] = None
        resp = {"ok": not errors, "results": results}
        if errors:
            resp["error"] = "; ".join(errors)
        if results["email"] is None and results["whatsapp"] is None:
            resp["ok"] = False
            resp["error"] = "no alert channel enabled in settings"
        return jsonify(resp)
    except Exception as e:
        return _err(e)


@api.get("/alert_ping")
def alert_ping():
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        try:
            from app import database
            n = database.unacked_critical_count(conn)
        except ImportError:
            if _table_empty_or_missing(conn, "alerts"):
                n = 0
            else:
                n = conn.execute(
                    "SELECT COUNT(*) AS n FROM alerts "
                    "WHERE severity='critical' AND acknowledged=0"
                ).fetchone()["n"]
        return jsonify(ok=True, unacked_critical=n)
    except Exception as e:
        return _err(e)
    finally:
        conn.close()


@api.get("/robot")
def robot_state():
    """Meesho Robo: state, what each job did and how it ended (see app/robot.py)."""
    from flask import current_app
    from app import robot
    from app.config import get as cfg_get
    from app.database import get_conn
    try:
        from app.connector.meesho_connector import session_exists
        signed = bool(session_exists())
    except Exception:
        signed = False
    conn = get_conn(current_app.config["database_path"])
    try:
        if cfg_get("remote_robot", False):
            # This server only mirrors a robot that runs (and is signed in) on another machine: its numbers and job
            # rows arrive with the database, so report them as an "auto" robot rather than this server's own "manual".
            return jsonify(robot.read(conn, "auto", True))
        return jsonify(robot.read(conn, cfg_get("mode", "demo"), signed))
    finally:
        conn.close()


@api.get("/panel")
def panel_numbers():
    """The real, account-level numbers the keeper read from the Supplier Panel (panel_metrics), latest capture only."""
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS panel_metrics(id INTEGER PRIMARY KEY AUTOINCREMENT, captured_at TEXT NOT NULL, "
                     "area TEXT NOT NULL, key TEXT NOT NULL, value REAL, text TEXT)")
        latest = {}
        for area, key, value, text, at in conn.execute(
                "SELECT area, key, value, text, captured_at FROM panel_metrics WHERE id IN "
                "(SELECT MAX(id) FROM panel_metrics GROUP BY area, key)"):
            latest.setdefault(area, {})[key] = {"value": value, "text": text, "at": at}
        at = max((v["at"] for a in latest.values() for v in a.values()), default=None)
        return jsonify({"captured_at": at, "areas": latest})
    finally:
        conn.close()


@api.get("/ai_insights")
def ai_insights():
    """The AI strategist's recent analyses (app/ai_analysis.py), newest first."""
    try:
        conn = _get_conn()
    except Exception as e:
        return _err(e)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS ai_insights(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, "
                     "summary TEXT NOT NULL, model TEXT, based_on TEXT)")
        rows = [dict(r) for r in conn.execute(
            "SELECT id, ts, summary, model FROM ai_insights ORDER BY id DESC LIMIT 10")]
        return jsonify(rows)
    finally:
        conn.close()
