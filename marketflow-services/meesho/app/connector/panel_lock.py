"""One user of the Supplier Panel browser profile (``data/session``) at a time.

Chromium refuses to open the same persistent profile twice, and two things want it: the keeper (holds it
continuously while signed in) and the older catalog pull (launches its own short-lived context every 2h). Same
problem and same fix as Flipkart's ``fkpulse/hublock.py``: an OS file lock, released automatically if its holder
dies, so there is no stale lock to clean up.
"""
from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path

LOCK_FILE = Path(__file__).resolve().parents[2] / "data" / "session.lock"


class PanelBusy(Exception):
    """Another job is using the Supplier Panel browser right now."""


def _try_lock(fh) -> bool:
    try:
        if os.name == "nt":
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def _unlock(fh) -> None:
    try:
        if os.name == "nt":
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass


@contextmanager
def panel_lock(wait_s: float = 0.0, path=None):
    """Hold the Supplier Panel browser. ``wait_s`` = how long to wait for the current holder; 0 = give up at once."""
    lock_path = Path(path) if path else LOCK_FILE
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(lock_path, "a+b")
    try:
        deadline = time.monotonic() + wait_s
        while not _try_lock(fh):
            if time.monotonic() >= deadline:
                raise PanelBusy("another Supplier Panel job is using the browser")
            time.sleep(0.5)
        try:
            yield
        finally:
            _unlock(fh)
    finally:
        fh.close()
