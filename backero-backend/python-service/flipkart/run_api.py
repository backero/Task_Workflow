"""FK-Pulse read-only API entry wrapper, for the unified cross-platform dashboard.

Usage:  python run_api.py
Equivalent to: uvicorn fkpulse.api:app --host 127.0.0.1 --port 8600
"""
from __future__ import annotations

import uvicorn


def main() -> None:
    uvicorn.run("fkpulse.api:app", host="127.0.0.1", port=8600)


if __name__ == "__main__":
    main()
