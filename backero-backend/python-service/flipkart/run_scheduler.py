"""FK-Pulse scheduler entry point.

Starts the APScheduler background loop (api sync, optional rank scan, daily
digest) and blocks forever. Stop with Ctrl-C.

Usage:  python run_scheduler.py
"""

from __future__ import annotations

import os
import sys
import time

# mongo_sync.py lives one level up, in python-service/ (shared by all 3 platforms).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fkpulse.scheduler import create_scheduler, _configure_logging, _log


def _sync_to_mongo():
    # Reuses the exact function the old /api/overview route called directly --
    # @app.get(...) only registers it, the function itself is callable plain.
    from fkpulse.api import overview
    from mongo_sync import upsert_overview
    upsert_overview("flipkart", overview())


def main() -> None:
    _configure_logging()
    log = _log("main")
    from fkpulse.config import load_config  # Agent A's module (runtime import)
    config = load_config()
    db_path = config.get("db_path", "fk_pulse.db")

    scheduler = create_scheduler(config, db_path)
    scheduler.start()
    log.info("scheduler_started", db_path=db_path,
             jobs=[j.id for j in scheduler.get_jobs()])

    try:
        _sync_to_mongo()
    except Exception as exc:
        log.error("mongo_sync_failed", error=str(exc))
    scheduler.add_job(_sync_to_mongo, "interval", minutes=3, id="mongo_sync",
                       max_instances=1, coalesce=True)

    keeper = None
    hub_cfg = config.get("sellerhub", {}) or {}
    if hub_cfg.get("enabled", True) and hub_cfg.get("keeper", True):
        from fkpulse.hubkeeper import HubKeeper   # the always-open Seller Hub window that keeps the Flipkart login alive
        keeper = HubKeeper(config, db_path)
        keeper.start()
    try:
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        log.info("scheduler_stopping")
        if keeper:
            keeper.stop()
        scheduler.shutdown()


if __name__ == "__main__":
    main()
