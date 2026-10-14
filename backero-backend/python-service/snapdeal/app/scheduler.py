"""APScheduler loop — the 'works around the clock' layer.
Fast tier (default 15 min): listings + scorecard + metrics sync, then rules.
Slow tier (default 6 h): keyword rank tracking (public search, no login).
Runs inside the FastAPI process; survives as long as the PC is on."""
import os, traceback
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from . import database as db

_sched = None
_keeper = None

def get_connector():
    kind = os.environ.get("SD_CONNECTOR", "demo")
    if kind == "browser":
        from .connectors.browser import BrowserConnector
        return BrowserConnector()
    if kind == "csv":
        from .connectors.csv_ingest import CsvConnector
        return CsvConnector()
    if kind == "api":
        from .connectors.api_stub import ApiConnector
        return ApiConnector()
    from .connectors.demo import DemoConnector
    return DemoConnector()

def _classify(status):
    """What a sync run's `parts` dict means for the robot: ok / partial / needs_you / failed, plus a one-line reason."""
    parts = status.get("parts", {})
    failures = {k: v for k, v in parts.items() if isinstance(v, str) and v.startswith("FAILED")}
    if not failures:
        return "ok", f"{status['connector']}: " + ", ".join(f"{k} {v}" for k, v in parts.items())
    if len(failures) == len(parts) and any("session expired" in v.lower() or "log in" in v.lower() for v in failures.values()):
        return "needs_you", next(v for v in failures.values() if "session expired" in v.lower() or "log in" in v.lower())
    if len(failures) == len(parts):
        return "failed", "; ".join(f"{k}: {v}" for k, v in failures.items())[:400]
    return "partial", "Some parts failed: " + "; ".join(f"{k}: {v}" for k, v in failures.items())[:400]


def sync_now():
    """One full sync pass. Returns status dict; never raises to caller. Records its own outcome to robot_runs."""
    started = datetime.now().isoformat(timespec="seconds")
    con = get_connector()
    if con.name == "browser":
        return _browser_sync(started)
    status = {"connector": con.name, "demo": con.is_demo, "parts": {}}
    try:
        rows = con.fetch_listings()
        if rows: db.upsert_listings(rows)
        status["parts"]["listings"] = len(rows)
    except Exception as e:
        db.log_sync(con.name, "failed", f"listings: {e}")
        status["parts"]["listings"] = f"FAILED: {e}"
    try:
        rows = con.fetch_metrics(30)
        if rows: db.upsert_metrics(rows)
        status["parts"]["metrics"] = len(rows)
    except Exception as e:
        db.log_sync(con.name, "failed", f"metrics: {e}")
        status["parts"]["metrics"] = f"FAILED: {e}"
    try:
        sc = con.fetch_scorecard()
        if sc: db.upsert_scorecard(sc)
        status["parts"]["scorecard"] = "ok" if sc else "none"
    except Exception as e:
        db.log_sync(con.name, "failed", f"scorecard: {e}")
        status["parts"]["scorecard"] = f"FAILED: {e}"
    try:
        rows = con.fetch_ads(30)
        if rows: db.upsert_ads(rows)
        status["parts"]["ads"] = len(rows)
    except Exception as e:
        db.log_sync(con.name, "failed", f"ads: {e}")
        status["parts"]["ads"] = f"FAILED: {e}"
    # rules always run on whatever data exists
    from .engine import rules
    try:
        status["new_alerts"] = rules.evaluate()
    except Exception:
        db.log_sync("rules", "failed", traceback.format_exc()[-400:])
        status["new_alerts"] = "FAILED"
    db.log_sync(con.name, "ok", str(status["parts"]))
    outcome, detail = _classify(status)
    db.record_run("sync", started, outcome, detail)
    return status

def run_ai_analysis() -> None:
    """AI strategic analysis over the current real numbers (best-effort, never raises). Called directly by
    snapdeal_keeper after every real panel_read - the AI layer is meant to react to every real data refresh, and
    the keeper's ~30-min read cycle is what that actually means in browser mode. _browser_sync's own 15-min timer
    already re-runs rules.evaluate() on its own schedule; this only adds the AI layer, not a second rules pass."""
    started_ai = datetime.now().isoformat(timespec="seconds")
    try:
        from . import ai_analysis
        outcome = ai_analysis.analyze_and_store()
        if "credit balance is too low" in str(outcome):
            outcome = "skipped: Anthropic AI credit is used up - AI summaries are paused; rules, alerts and all numbers are unaffected"
        status = "ok" if outcome == "ok" else ("skipped" if outcome.startswith("skipped") else "failed")
        db.record_run("ai_analysis", started_ai, status, outcome)
    except Exception as exc:
        if "credit balance is too low" in str(exc):
            db.record_run("ai_analysis", started_ai, "skipped", "skipped: Anthropic AI credit is used up - AI summaries are paused; rules, alerts and all numbers are unaffected")
        else:
            db.record_run("ai_analysis", started_ai, "failed", f"{type(exc).__name__}: {exc}")


def _browser_sync(started):
    """Browser mode: Snapdeal rejects replayed cookies (error 422), so pages are read only inside the keeper's own
    signed-in window (snapdeal_keeper -> panel_reader). This pass just re-runs the rules on what the keeper stored
    and reports the keeper's latest read as the sync outcome - it never opens a second browser."""
    from .engine import rules
    rows = db.q("SELECT status, detail, finished_at FROM robot_runs WHERE job='panel_read' ORDER BY id DESC LIMIT 1")
    try:
        new_alerts = rules.evaluate()
    except Exception:
        db.log_sync("rules", "failed", traceback.format_exc()[-400:])
        new_alerts = "FAILED"
    if rows:
        last = rows[0]
        outcome, detail = last["status"], f"{last['detail']} (read at {last['finished_at']})"
    else:
        outcome, detail = "needs_you", "Waiting for the first read - sign in in the Seller Panel window that is open."
    db.record_run("sync", started, outcome, detail)
    db.log_sync("browser", "ok" if outcome in ("ok", "partial") else "failed", detail)
    return {"connector": "browser", "demo": False, "parts": {"panel_read": outcome, "detail": detail}, "new_alerts": new_alerts}


def rank_now():
    started = datetime.now().isoformat(timespec="seconds")
    from .engine import ranker
    try:
        checked, found, note = ranker.track_once()
        detail = f"Checked {checked} keyword(s), found the seller's brand in {found}. {note or ''}".strip()
        db.record_run("rank", started, "ok" if checked else "skipped", detail or "No keywords tracked (set SD_TRACK_KEYWORDS).")
        return {"keywords": checked, "found": found, "note": note}
    except Exception as e:
        db.log_sync("ranker", "failed", str(e))
        db.record_run("rank", started, "failed", str(e))
        return {"error": str(e)}


def _beat():
    """Once a minute: 'the SD Robo process is alive' - a reader can then say 'not running' if this stops."""
    db.set_setting("robot_beat", db.now())

def start():
    global _sched
    if _sched: return _sched
    db.init()
    _sched = BackgroundScheduler(daemon=True)
    fast = int(os.environ.get("SD_POLL_FAST", "240"))
    slow = int(os.environ.get("SD_POLL_SLOW", "360"))
    _sched.add_job(sync_now, "interval", minutes=fast, id="fast_sync",
                   max_instances=1, coalesce=True)
    _sched.add_job(rank_now, "interval", minutes=slow, id="rank_sync",
                   max_instances=1, coalesce=True)
    _sched.add_job(_beat, "interval", minutes=1, id="robot_beat",
                   max_instances=1, coalesce=True)
    if not db.get_setting("robot_started_at"):
        db.set_setting("robot_started_at", db.now())
    db.set_setting("robot_beat", db.now())
    _sched.start()

    global _keeper
    if os.environ.get("SD_CONNECTOR", "demo") == "browser" and _keeper is None:
        try:
            from .connectors.snapdeal_keeper import SnapdealKeeper
            _keeper = SnapdealKeeper()
            _keeper.start()
        except Exception:
            pass

    return _sched
