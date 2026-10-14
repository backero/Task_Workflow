"""Background jobs for Meesho Seller Command Center.

start_scheduler(app) launches an APScheduler BackgroundScheduler (daemon):
  (1) auto_pull  - every pull_interval_hours (+/-20 min jitter), only when
      mode == 'auto' and a Playwright session exists; pulls, then recomputes.
  (2) recompute  - every 6h in any mode; evaluate_all + dispatch_unsent.

All jobs run inside app.app_context() and never crash the app on failure.
"""

import random
import threading

from app.config import get, load_config
from app.database import get_conn, log_data_event

DB_PATH_KEY = "database_path"  # stored on app.config by create_app()


def _db_path(app):
    return app.config[DB_PATH_KEY]


def recompute_now(db_path: str) -> None:
    """evaluate_all + dispatch_unsent, then AI strategic analysis over the fresh numbers (best-effort, never
    raises). Called on the 6h schedule/startup/auto_pull (via _recompute below, wrapped in app context) AND
    directly by meesho_keeper after every real panel_read - the AI layer is meant to react to every real data
    refresh, and the keeper's ~30-min cycle is what "every real data refresh" actually means now, not the 6h timer."""
    from datetime import datetime

    from app import robot
    from app.database import get_conn  # local import keeps module flask-free
    started = datetime.now()
    try:
        from app.recommender import evaluate_all
    except Exception:
        evaluate_all = None
    try:
        from app.alerts import dispatch_unsent
    except Exception:
        dispatch_unsent = None
    conn = get_conn(db_path)
    try:
        new = evaluate_all(conn) if evaluate_all else 0
        sent = dispatch_unsent(conn) if dispatch_unsent else 0
        robot.record_run(conn, "recompute", started, "ok", f"{new} new findings, {sent} alerts sent.")
    except Exception as exc:
        try:
            log_data_event(conn, "scheduler", "error", f"recompute failed: {exc}")
        except Exception:
            pass
        robot.record_run(conn, "recompute", started, "failed", str(exc))
    finally:
        conn.close()

    # Its own connection/commit so a slow or failed AI call can never roll back or block the rule engine's own
    # (already-committed) results above.
    conn = get_conn(db_path)
    started_ai = datetime.now()
    try:
        from app import ai_analysis
        outcome = ai_analysis.analyze_and_store(conn)
        if "credit balance is too low" in str(outcome):
            outcome = "skipped: Anthropic AI credit is used up - AI summaries are paused; rules, alerts and all numbers are unaffected"
        status = "ok" if outcome == "ok" else ("skipped" if outcome.startswith("skipped") else "failed")
        robot.record_run(conn, "ai_analysis", started_ai, status, outcome)
    except Exception as exc:
        if "credit balance is too low" in str(exc):
            robot.record_run(conn, "ai_analysis", started_ai, "skipped", "skipped: Anthropic AI credit is used up - AI summaries are paused; rules, alerts and all numbers are unaffected")
        else:
            robot.record_run(conn, "ai_analysis", started_ai, "failed", f"{type(exc).__name__}: {exc}")
    finally:
        conn.close()


def _recompute(app):
    recompute_now(_db_path(app))


def _auto_pull(app):
    """Pull from Meesho (auto mode only, session required), then recompute. Every outcome is written to the Robo run
    log - a failed or impossible pull used to vanish silently (``except Exception: pass``)."""
    from datetime import datetime

    from app import robot
    started = datetime.now()
    conn = None
    try:
        if get("mode", "demo") != "auto":
            return
        from app.connector.meesho_connector import session_exists, pull_all
        conn = get_conn(_db_path(app))
        if not session_exists():
            robot.record_run(conn, "auto_pull", started, "needs_you",
                             "Not signed in to the Meesho Supplier Panel - open Sources and click Connect.")
            return
        result = pull_all(conn, load_config())
        if result.get("ok"):
            robot.record_run(conn, "auto_pull", started, "ok", f"Read {result.get('listings', 0)} listings. {result.get('detail', '')}")
        else:
            detail = str(result.get("detail", "the pull did not complete"))
            if detail.lower().startswith("skipped"):
                robot.record_run(conn, "auto_pull", started, "skipped", detail)
            else:
                expired = "session expired" in detail.lower() or "login" in detail.lower()
                robot.record_run(conn, "auto_pull", started, "needs_you" if expired else "failed", detail)
        _recompute(app)
    except Exception as exc:  # the scheduler must stay alive, but the failure must be visible
        try:
            c = conn or get_conn(_db_path(app))
            robot.record_run(c, "auto_pull", started, "failed", f"{type(exc).__name__}: {exc}")
            if conn is None:
                c.close()
        except Exception:
            pass
    finally:
        if conn is not None:
            conn.close()


def _beat(app):
    """Once a minute: 'the Meesho Robo process is alive'."""
    from app import robot
    conn = get_conn(_db_path(app))
    try:
        robot.set_kv(conn, "robot_beat", robot.now_iso())
    finally:
        conn.close()


def start_scheduler(app):
    """Create and start the BackgroundScheduler. Returns the scheduler
    (or None if APScheduler is unavailable)."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except Exception:
        return None

    scheduler = BackgroundScheduler(daemon=True)

    def with_ctx(fn):
        def wrapper():
            with app.app_context():
                fn(app)
        return wrapper

    hours = float(get("pull_interval_hours", 2) or 2)
    jitter_minutes = random.randint(-20, 20)
    scheduler.add_job(
        with_ctx(_auto_pull),
        trigger="interval",
        hours=max(1, hours),
        minutes=jitter_minutes,
        id="auto_pull",
        replace_existing=True,
    )
    scheduler.add_job(with_ctx(_beat), trigger="interval", minutes=1, id="robot_beat", replace_existing=True)
    scheduler.add_job(
        with_ctx(_recompute),
        trigger="interval",
        hours=6,
        id="recompute",
        replace_existing=True,
    )
    try:
        from app import robot
        conn = get_conn(_db_path(app))
        try:
            robot.set_kv(conn, "robot_started_at", robot.now_iso())
            robot.set_kv(conn, "robot_beat", robot.now_iso())
        finally:
            conn.close()
    except Exception:
        pass
    scheduler.start()

    # Run once immediately: the 6h interval trigger does not fire on its own until 6h of uptime have passed, so a
    # restart (this app has been restarted several times a day) could go a full working day without ever generating
    # a fresh alert or recommendation, even with hours of real panel data already sitting in the database.
    threading.Thread(target=with_ctx(_recompute), daemon=True).start()

    if get("mode", "demo") == "auto":
        try:
            from app.connector.meesho_keeper import MeeshoKeeper
            keeper = MeeshoKeeper(db_path=_db_path(app))
            keeper.start()
            app.config["meesho_keeper"] = keeper
        except Exception:
            pass

    return scheduler
