"""FK-Pulse scheduler entry point.

Starts the APScheduler background loop (api sync, optional rank scan, daily
digest) and blocks forever. Stop with Ctrl-C.

Usage:  python run_scheduler.py
"""

from __future__ import annotations

import time

from fkpulse.scheduler import create_scheduler, _configure_logging, _log


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
