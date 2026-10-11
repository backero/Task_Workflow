"""FK-Pulse scheduler (Agent B).

APScheduler BackgroundScheduler with three jobs:
- ``job_api_sync``   — every ``polling.api_minutes``: sync listings/orders/
  returns/settlements/inventory via Agent A's api_client.
- ``job_rank_scan``  — spread over the day (24h / ``polling.rank_runs_per_day``,
  jittered); only registered when ``harvester.enabled`` is true. Uses Agent D's
  RankHarvester and appends to rank_history.
- ``job_digest``     — daily at ``polling.digest_hour``: kpi.compute_all +
  recommend.generate.

Every job body is wrapped in try/except and logs via structlog to
``fkpulse.log`` so one failing job never kills the scheduler.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timedelta

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

LOG_FILE = "fkpulse.log"

_logging_configured = False


def _configure_logging() -> None:
    """Route structlog (and stdlib) logging to fkpulse.log + console, once."""
    global _logging_configured
    if _logging_configured:
        return
    handlers = [logging.FileHandler(LOG_FILE, encoding="utf-8"),
                logging.StreamHandler()]
    logging.basicConfig(level=logging.INFO, format="%(message)s",
                        handlers=handlers, force=True)
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _logging_configured = True


def _log(job: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger().bind(job=job)


# --------------------------------------------------------------------------- #
# jobs
# --------------------------------------------------------------------------- #

def _record_sync_error(db_path: str, error: str) -> None:
    """Persist why the last sync failed so the dashboard can say so.

    A log line nobody reads isn't an alarm: this sync failed every 30 minutes for six days
    while the dashboard still showed a grey "last sync" timestamp.
    """
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        try:
            conn.execute(
                "INSERT OR REPLACE INTO kv_config(key, value) VALUES (?, ?)",
                ("last_sync_error",
                 json.dumps({"at": datetime.now().isoformat(), "error": error})))
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass  # the failure is already in the log; never let reporting break the scheduler


def _set_kv(db_path: str, key: str, value: str | None) -> None:
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        try:
            if value is None:
                conn.execute("DELETE FROM kv_config WHERE key = ?", (key,))
            else:
                conn.execute("INSERT OR REPLACE INTO kv_config(key, value) VALUES (?, ?)", (key, value))
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def job_hub_read(config: dict, db_path: str) -> tuple[str, str] | None:
    """Read Flipkart Seller Hub (business health, traffic, ads, payouts...) with the saved login, then refresh the digest.

    Seller Hub sessions end on Flipkart's side (a full read worked, then the session was gone ~20 minutes later), and a
    background job cannot type an OTP. So a lost session is an expected, *reported* state — it goes to the dashboard
    banner via kv_config['sellerhub_error'] instead of failing quietly.
    """
    log = _log("hub_read")
    hcfg = config.get("sellerhub", {}) or {}
    if not hcfg.get("enabled", True):
        return "skipped", "Seller Hub reading is switched off in config.yaml."
    from pathlib import Path

    from fkpulse import sellerhub
    profile = Path(hcfg.get("profile_dir", "sellerhub-profile"))
    if not profile.is_absolute():
        profile = Path(__file__).resolve().parents[1] / profile
    if not profile.exists():
        _set_kv(db_path, "sellerhub_error", json.dumps({"at": datetime.now().isoformat(), "kind": "never",
                "error": "Seller Hub has never been signed in — run `python scripts/sellerhub_login.py`."}))
        log.warning("hub_read_skipped", reason="no profile")
        return "needs_you", "Seller Hub has never been signed in - run `python scripts/sellerhub_login_and_read.py` and sign in once."
    try:
        from fkpulse.hublock import HubBusy, hub_lock
        try:
            with hub_lock(wait_s=180):   # the session keeper may be mid-ping; wait for it rather than fight over the profile
                results = sellerhub.read_all(profile, db_path, headless=bool(hcfg.get("headless", True)))
        except HubBusy:
            return "skipped", "The Seller Hub browser was busy (another job or a sign-in is using it); will retry next time."
    except sellerhub.SessionExpired as exc:
        _set_kv(db_path, "sellerhub_error", json.dumps({"at": datetime.now().isoformat(), "kind": "session", "error": str(exc)}))
        log.warning("hub_read_session_expired")
        return "needs_you", ("Flipkart ended the Seller Hub login - sign in again with `python scripts/sellerhub_login_and_read.py` "
                             "(a background job cannot type an OTP).")
    except Exception as exc:  # noqa: BLE001 — must never kill the scheduler
        _set_kv(db_path, "sellerhub_error", json.dumps({"at": datetime.now().isoformat(), "kind": "error", "error": str(exc)[:300]}))
        log.error("hub_read_failed", error=str(exc))
        return "failed", str(exc)[:300]
    return finish_hub_read(config, db_path, results)


def finish_hub_read(config: dict, db_path: str, results: dict) -> tuple[str, str]:
    """After a Seller Hub read (scheduled or done by the session keeper): record what was missed, refresh recommendations."""
    log = _log("hub_read")
    failed = {k: v for k, v in results.items() if v != "ok"}
    _set_kv(db_path, "sellerhub_error", json.dumps({"at": datetime.now().isoformat(), "kind": "partial",
            "error": "Some Seller Hub pages could not be read: " + "; ".join(f"{k} ({v})" for k, v in failed.items())}) if failed else None)
    _set_kv(db_path, "sellerhub_last_ok", datetime.now().isoformat())
    log.info("hub_read_ok", areas=len(results), failed=list(failed))
    try:
        from fkpulse import sellerhub
        log.info("listings_refreshed_from_hub", updated=sellerhub.refresh_listings_from_hub(db_path))
    except Exception as exc:  # noqa: BLE001 - a refresh problem must not lose the read itself
        log.error("listings_refresh_failed", error=str(exc))
    job_digest(config, db_path)  # new numbers -> fresh recommendations
    if failed:
        return "partial", "Read " + str(len(results) - len(failed)) + f" of {len(results)} Seller Hub areas; missed: " + ", ".join(failed)
    return "ok", f"Read all {len(results)} Seller Hub areas."


def job_api_sync(config: dict, db_path: str) -> tuple[str, str]:
    """Pull listings/orders/returns/settlements/inventory via api_client."""
    log = _log("api_sync")
    try:
        from fkpulse.api_client import FlipkartSellerClient, sync_all
        vault = None
        if config.get("mode") == "live":
            import os

            from fkpulse.vault import Vault
            password = os.environ.get("FKPULSE_VAULT_PASSWORD")
            if not password:
                raise RuntimeError(
                    "FKPULSE_VAULT_PASSWORD env var not set; required to "
                    "unlock the vault for unattended live-mode sync."
                )
            vault = Vault(config.get("vault_file", "vault.enc"), password)
        client = FlipkartSellerClient(config, vault=vault)
        sync_all(client, db_path)
        conn = sqlite3.connect(db_path, timeout=30)
        try:
            conn.execute(
                "INSERT OR REPLACE INTO kv_config(key, value) VALUES (?, ?)",
                ("last_sync", datetime.now().isoformat()))
            conn.execute("DELETE FROM kv_config WHERE key = 'last_sync_error'")
            conn.commit()
        finally:
            conn.close()
        log.info("api_sync_ok")
        return "ok", "Listings, orders, returns, settlements and stock synced."
    except Exception as exc:  # noqa: BLE001 — job must never kill scheduler
        log.error("api_sync_failed", error=str(exc))
        _record_sync_error(db_path, str(exc))
        from fkpulse.health import explain_error
        # Credentials are something only the owner can fix, so they are "needs_you", not a generic failure.
        needs_owner = any(t in str(exc) for t in ("FKPULSE_VAULT_PASSWORD", "wrong master password", "VaultPassword", "fk_app_id", "fk_app_secret", "LiveModeCredentials", "401", "403", "invalid_client"))
        return ("needs_you" if needs_owner else "failed"), explain_error(str(exc))


def job_rank_scan(config: dict, db_path: str) -> tuple[str, str]:
    """Scan tracked keywords via RankHarvester and store rank positions."""
    log = _log("rank_scan")
    try:
        from fkpulse.harvester import RankHarvester
        max_kw = (config.get("harvester", {}) or {}).get(
            "max_keywords_per_run", 10)
        conn = sqlite3.connect(db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            keywords = conn.execute(
                """SELECT fsn, keyword FROM tracked_keywords
                   WHERE active = 1 LIMIT ?""", (max_kw,)).fetchall()
            if not keywords:
                log.info("rank_scan_skipped", reason="no tracked keywords")
                return "skipped", "No tracked keywords."
            harvester = RankHarvester(config)
            fetched_at = datetime.now().isoformat()
            inserted = 0
            for row in keywords:
                results = harvester.scan_keyword(row["keyword"], {row["fsn"]})
                for r in results:
                    conn.execute(
                        """INSERT INTO rank_history
                           (fsn, keyword, position, page, serp_median_price,
                            fetched_at)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (r.get("fsn"), row["keyword"], r.get("position"),
                         r.get("page"), r.get("serp_median_price"),
                         fetched_at))
                    inserted += 1
                # Commit after EACH keyword. The scan takes ~20 minutes (polite delays between pages); holding one
                # transaction open for all of it kept the database write-locked, so every other write (the robot's
                # heartbeat, the run log, the Seller Hub keeper) failed silently and the dashboard said "not running".
                conn.commit()
        finally:
            conn.close()
        log.info("rank_scan_ok", keywords=len(keywords), inserted=inserted)
        return "ok", f"Scanned {len(keywords)} keywords, stored {inserted} rank readings."
    except Exception as exc:  # noqa: BLE001
        log.error("rank_scan_failed", error=str(exc))
        return "failed", str(exc)[:300]


def job_digest(config: dict, db_path: str) -> tuple[str, str]:
    """Daily digest: recompute KPIs, then regenerate recommendations. Runs after every real Seller Hub read (via
    finish_hub_read), on its own daily cron, and once at startup - so this is also where the AI strategic layer
    hooks in, recorded as its own separate job so a slow/failed AI call can never read as a digest failure."""
    log = _log("digest")
    try:
        from fkpulse import kpi, recommend
        snapshots = kpi.compute_all(db_path, config)
        recs = recommend.generate(db_path, config)
        log.info("digest_ok", snapshots=snapshots, new_recommendations=recs)
        outcome = "ok", f"{snapshots} KPI snapshots, {recs} new recommendations."
    except Exception as exc:  # noqa: BLE001
        log.error("digest_failed", error=str(exc))
        outcome = "failed", str(exc)[:300]

    from fkpulse import robot
    started_ai = datetime.now()
    try:
        from fkpulse import ai_analysis
        result = ai_analysis.analyze_and_store(db_path)
        if "credit balance is too low" in str(result):
            result = "skipped: Anthropic AI credit is used up - AI summaries are paused; rules, alerts and all numbers are unaffected"
        status = "ok" if result == "ok" else ("skipped" if result.startswith("skipped") else "failed")
        robot.record_run(db_path, "ai_analysis", started_ai, status, result)
    except Exception as exc:  # noqa: BLE001
        if "credit balance is too low" in str(exc):
            robot.record_run(db_path, "ai_analysis", started_ai, "skipped", "skipped: Anthropic AI credit is used up - AI summaries are paused; rules, alerts and all numbers are unaffected")
        else:
            robot.record_run(db_path, "ai_analysis", started_ai, "failed", f"{type(exc).__name__}: {exc}")

    return outcome


# --------------------------------------------------------------------------- #
# scheduler factory
# --------------------------------------------------------------------------- #

def create_scheduler(config: dict, db_path: str) -> BackgroundScheduler:
    """Build (but do not start) the BackgroundScheduler with all jobs."""
    _configure_logging()
    from fkpulse import robot
    scheduler = BackgroundScheduler()
    robot.publish_state(config, db_path, started_at=datetime.now().isoformat(timespec="seconds"))
    polling = config.get("polling", {}) or {}

    # Heartbeat: once a minute, so a dead Flipkart Robo is noticed within minutes (see fkpulse/robot.py).
    scheduler.add_job(
        robot.beat, IntervalTrigger(minutes=1), args=[config, db_path],
        id="robot_beat", name="robot_beat", replace_existing=True,
    )

    if polling.get("api_enabled", True):  # the Flipkart Seller API is optional; Seller Hub reads are the data source
        scheduler.add_job(
            robot.tracked("api_sync", job_api_sync),
            IntervalTrigger(minutes=int(polling.get("api_minutes", 30))),
            args=[config, db_path],
            id="job_api_sync", name="job_api_sync",
            replace_existing=True,
            next_run_time=datetime.now(),
        )

    # Rank scanning is opt-in only (harvester.enabled default OFF in SPEC).
    harvester_cfg = config.get("harvester", {}) or {}
    if harvester_cfg.get("enabled", False):
        runs_per_day = max(int(polling.get("rank_runs_per_day", 3)), 1)
        hours = 24.0 / runs_per_day  # spread runs over the day
        # jitter derived from configured polite-delay bounds
        jitter_s = int(harvester_cfg.get("min_delay_s", 45))
        scheduler.add_job(
            robot.tracked("rank_scan", job_rank_scan),
            IntervalTrigger(hours=hours, jitter=jitter_s),
            args=[config, db_path],
            id="job_rank_scan", name="job_rank_scan",
            replace_existing=True,
            # First scan a few minutes after start, not "one interval later": after a restart the rank table used to
            # sit empty for ~8 hours (it had no reading at all since 18 Sep).
            next_run_time=datetime.now() + timedelta(minutes=3),
        )
        _log("scheduler").info("rank_scan_enabled",
                               runs_per_day=runs_per_day)

    # Seller Hub reader (opt-out with sellerhub.enabled: false). Not run at startup: a browser window shouldn't
    # appear the moment the scheduler starts; the first read comes one interval later.
    hub_cfg = config.get("sellerhub", {}) or {}
    # With the session keeper (default) the Seller Hub is read from the always-open window, so no interval job is needed.
    if hub_cfg.get("enabled", True) and not hub_cfg.get("keeper", True):
        scheduler.add_job(
            robot.tracked("hub_read", job_hub_read),
            IntervalTrigger(minutes=int((config.get("sellerhub", {}) or {}).get("minutes", 180))),
            args=[config, db_path],
            id="job_hub_read", name="job_hub_read",
            replace_existing=True,
        )

    scheduler.add_job(
        robot.tracked("digest", job_digest),
        CronTrigger(hour=int(polling.get("digest_hour", 7))),
        args=[config, db_path],
        id="job_digest", name="job_digest",
        replace_existing=True,
    )
    # Run once shortly after startup (after the initial api_sync has had time
    # to complete) so KPIs/recommendations aren't empty until the next
    # digest_hour cron tick.
    scheduler.add_job(
        robot.tracked("digest", job_digest),
        DateTrigger(run_date=datetime.now() + timedelta(seconds=30)),
        args=[config, db_path],
        id="job_digest_startup", name="job_digest_startup",
    )
    return scheduler
