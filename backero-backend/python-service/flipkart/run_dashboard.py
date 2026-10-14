"""FK-Pulse dashboard entry wrapper.

Usage:  python run_dashboard.py
Equivalent to: streamlit run fkpulse/ui/app.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent / "fkpulse" / "ui" / "app.py"


def main() -> int:
    cmd = [sys.executable, "-m", "streamlit", "run", str(APP), *sys.argv[1:]]
    try:
        return subprocess.call(cmd)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
