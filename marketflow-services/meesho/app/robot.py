"""Meesho Robo: what the background worker did, and how each job ended.

Same vocabulary as the Amazon and Flipkart robots (each is a separate system):
  job outcomes  ok | partial | skipped | needs_you | failed
  robot state   healthy | attention | needs_you | error | demo | manual

The scheduler used to swallow every failure (``except Exception: pass``), so a broken pull looked exactly like a quiet
one. Every job run is now written down with a plain-language result, and the Robo page shows it.
"""
from datetime import datetime, timedelta

KEEP_DAYS = 30

JOBS = {
    "auto_pull": ("Supplier Panel pull",
                  "Opens the Meesho Supplier Panel in the saved login and reads the catalogue numbers (auto mode only)."),
    "panel_read": ("Account numbers (Business Dashboard, Payments, Quality, Returns)",
                   "Reads the account-level totals: views/clicks/orders/sales, upcoming and completed payouts, "
                   "the Quality Score, and the return/RTO rate. Kept fresh by a browser window that stays open and "
                   "signed in continuously (meesho_keeper), not by relaunching a new one each time."),
    "recompute": ("Rules and alerts",
                  "Re-checks every listing against the research thresholds and sends the alerts you turned on."),
    "ai_analysis": ("AI strategic analysis",
                    "Asks Claude for prioritized suggestions grounded in the real numbers above and Meesho's own "
                    "algorithm research doc. Needs ANTHROPIC_API_KEY set to run; skipped otherwise."),
}
EVERY_MINUTES = {"auto_pull": 120, "panel_read": 240, "recompute": 360, "ai_analysis": 240}


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def record_run(conn, job, started, status, detail=""):
    """Append one run. Never raises: reporting must not break the job being reported."""
    try:
        conn.execute(
            "INSERT INTO robot_runs (job, started_at, finished_at, status, detail) VALUES (?,?,?,?,?)",
            (job, started.isoformat(timespec="seconds"), now_iso(), status, (detail or "")[:500]))
        conn.execute("DELETE FROM robot_runs WHERE finished_at < ?", ((datetime.now() - timedelta(days=KEEP_DAYS)).isoformat(timespec="seconds"),))
        conn.commit()
    except Exception:  # noqa: BLE001
        pass


def set_kv(conn, key, value):
    try:
        conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
    except Exception:  # noqa: BLE001
        pass


def get_kv(conn, key):
    try:
        row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None
    except Exception:  # noqa: BLE001
        return None


def derive_state(mode, session_exists, latest, started_at, now=None):
    """Robot state + message. Pure: ``latest`` maps job -> {"status","detail","finished_at"} (missing = never ran)."""
    now = now or datetime.now()
    if mode == "demo":
        return "demo", "Demo mode: the numbers are sample data. No real Meesho account is connected."
    if mode == "manual":
        return "manual", "Manual mode: numbers are as fresh as your last uploaded Supplier Panel report (Sources tab)."
    # auto mode. panel_read (the meesho_keeper's continuously-open-window read) is the real, primary data source -
    # the headline state must track it. auto_pull is a separate, older catalog scrape whose CSS selectors were
    # never calibrated against real markup (see app/connectors/panel_reader.py's module docstring); it still gets
    # its own row in the jobs table below, but its near-permanent "no data" state must not mask a working panel_read.
    if not session_exists:
        return "needs_you", "Not signed in to the Meesho Supplier Panel. Open Sources, click Connect, and sign in with your mobile OTP."
    panel = latest.get("panel_read")
    if panel and panel["status"] == "needs_you":
        return "needs_you", panel["detail"] or "The Meesho login has ended. Sign in again in the Supplier Panel window."
    if panel and panel["status"] == "failed":
        return "error", "Account numbers read failed: " + (panel["detail"] or "see the Sources event feed")
    if panel is None:
        try:
            waited = (now - datetime.fromisoformat(started_at)).total_seconds() / 60 if started_at else 0
        except ValueError:
            waited = 0
        if waited > EVERY_MINUTES["panel_read"] * 2.5 + 10:
            return "error", "The account numbers have not been read since the app started."
        return "attention", "Signed in; the first read has not run yet."
    try:
        age = (now - datetime.fromisoformat(panel["finished_at"])).total_seconds() / 60
    except ValueError:
        age = 0
    if age > EVERY_MINUTES["panel_read"] * 2.5 + 10:
        return "error", f"The account numbers have not been read for {age / 60:.0f} hours (expected every {EVERY_MINUTES['panel_read']} min)."
    if panel["status"] == "partial":
        return "attention", panel["detail"] or "The last read only got part of the panel."
    return "healthy", "Reading on schedule."


def read(conn, mode, session_exists):
    latest = {}
    for row in conn.execute(
            "SELECT job, status, detail, finished_at FROM robot_runs WHERE id IN (SELECT MAX(id) FROM robot_runs GROUP BY job)"):
        latest[row["job"]] = dict(row)
    state, message = derive_state(mode, session_exists, latest, get_kv(conn, "robot_started_at"))
    jobs = []
    for job, (label, what) in JOBS.items():
        run = latest.get(job)
        jobs.append({"id": job, "label": label, "what": what, "every_minutes": EVERY_MINUTES[job],
                     "enabled": job != "auto_pull" or mode == "auto",
                     "last_run": run["finished_at"] if run else None, "last_status": run["status"] if run else None,
                     "detail": run["detail"] if run else None})
    runs = [dict(r) for r in conn.execute("SELECT finished_at, job, status, detail FROM robot_runs ORDER BY id DESC LIMIT 30")]
    return {"id": "meesho", "name": "Meesho Robo", "platform": "Meesho", "state": state, "message": message,
            "beat": get_kv(conn, "robot_beat"), "started_at": get_kv(conn, "robot_started_at"), "mode": mode, "jobs": jobs, "runs": runs}
