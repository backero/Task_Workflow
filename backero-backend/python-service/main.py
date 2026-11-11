"""
Monolith entry point for the 3 Python marketplace-automation scrapers
(Meesho, Snapdeal, Flipkart) -- one pm2 process, living inside
backero-backend/, instead of 3 separate services.

Each platform runs via its own venv's python (subprocess), not imported
together in one interpreter, for two reasons: (1) each platform has
different, substantial dependencies (Flask vs FastAPI vs Streamlit+FastAPI)
installed in its own venv, and (2) Meesho's and Snapdeal's internal packages
are both named `app` -- true single-interpreter unification would require
rewriting imports across both (working, debugged) codebases. subprocess
gives the same "one thing to start/stop/monitor" operational outcome
without either risk: one pm2 entry, one log stream, one restart policy.

Each platform's own run_scheduler.py (scraper + its existing, unmodified
KPI logic + a periodic MongoDB sync) is completely untouched by this file --
it only launches them. No Flask/FastAPI web servers run anymore; MongoDB
(written by each platform's own mongo_sync.py call, plus watchdog_sync.py
below) is the only handoff point to backero-backend's Node code.

Also launches each platform's watchdog_sync.py alongside run_scheduler.py --
previously this file only started run_scheduler.py, silently dropping the
backstop that run_scheduler.py's own header comment says is required (its
in-process mongo sync has a known race that intermittently pushes zeroed
KPIs; watchdog_sync.py exists specifically to cover for that but was never
actually being started by anything in production).

Also force-restarts every platform's whole process group (scheduler +
watchdog) every RESTART_HOURS, regardless of whether anything crashed --
a clean periodic restart so a silently-wedged browser session/page state
doesn't just sit there serving stale data indefinitely between real crashes.

Usage: python main.py
pm2:   pm2 start main.py --name marketflow-python --interpreter python3
"""
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
IS_WIN = sys.platform == "win32"

PLATFORMS = ["meesho", "snapdeal", "flipkart"]
# Only meesho/snapdeal have a watchdog_sync.py (the backstop for their own mongo_sched race --
# see its header comment). flipkart has no such file; its own run_scheduler.py mongo sync has
# never shown that symptom, so there's nothing to launch a backstop for.
PLATFORMS_WITH_WATCHDOG = {"meesho", "snapdeal"}
RESTART_HOURS = 5


def _venv_python(platform):
    sub = "Scripts" if IS_WIN else "bin"
    exe = "python.exe" if IS_WIN else "python"
    return os.path.join(ROOT, platform, "venv", sub, exe)


def main():
    procs = {}  # name -> {"scheduler": Popen, "watchdog": Popen, "started_at": float}

    def start(name):
        platform_dir = os.path.join(ROOT, name)
        python = _venv_python(name)
        entry = {"scheduler": subprocess.Popen([python, "run_scheduler.py"], cwd=platform_dir), "started_at": time.time()}
        msg = f"scheduler pid={entry['scheduler'].pid}"
        if name in PLATFORMS_WITH_WATCHDOG:
            entry["watchdog"] = subprocess.Popen([python, "watchdog_sync.py", "45"], cwd=platform_dir)
            msg += f", watchdog pid={entry['watchdog'].pid}"
        procs[name] = entry
        print(f"[monolith] started {name} ({msg})", flush=True)

    def stop(name, reason):
        entry = procs[name]
        print(f"[monolith] stopping {name} ({reason})", flush=True)
        keys = [k for k in ("scheduler", "watchdog") if k in entry]
        for key in keys:
            entry[key].terminate()
        for key in keys:
            try:
                entry[key].wait(timeout=10)
            except subprocess.TimeoutExpired:
                entry[key].kill()

    for name in PLATFORMS:
        start(name)

    try:
        while True:
            time.sleep(5)
            for name in list(procs.keys()):
                entry = procs[name]
                crashed = any(entry[key].poll() is not None for key in entry if key in ("scheduler", "watchdog"))
                if crashed:
                    stop(name, "a process exited")
                    start(name)
                    continue
                age_hours = (time.time() - entry["started_at"]) / 3600
                if age_hours >= RESTART_HOURS:
                    stop(name, f"scheduled {RESTART_HOURS}h restart")
                    start(name)
    except KeyboardInterrupt:
        print("[monolith] stopping all platforms", flush=True)
        for name in list(procs.keys()):
            stop(name, "shutdown")


if __name__ == "__main__":
    main()
