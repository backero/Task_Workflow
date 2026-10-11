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
(written by each platform's own mongo_sync.py call) is the only handoff
point to backero-backend's Node code.

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


def _venv_python(platform):
    sub = "Scripts" if IS_WIN else "bin"
    exe = "python.exe" if IS_WIN else "python"
    return os.path.join(ROOT, platform, "venv", sub, exe)


def main():
    procs = {}

    def start(name):
        platform_dir = os.path.join(ROOT, name)
        python = _venv_python(name)
        p = subprocess.Popen(
            [python, "run_scheduler.py"],
            cwd=platform_dir,
        )
        procs[name] = p
        print(f"[monolith] started {name} (pid={p.pid})", flush=True)

    for name in PLATFORMS:
        start(name)

    try:
        while True:
            time.sleep(5)
            for name in list(procs.keys()):
                p = procs[name]
                if p.poll() is not None:
                    print(f"[monolith] {name} exited (code={p.returncode}) -- restarting", flush=True)
                    start(name)
    except KeyboardInterrupt:
        print("[monolith] stopping all platforms", flush=True)
        for p in procs.values():
            p.terminate()
        for p in procs.values():
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    main()
