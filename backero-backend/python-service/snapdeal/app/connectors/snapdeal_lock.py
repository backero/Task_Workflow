"""One user of the Seller Panel browser profile (data/snapdeal-profile) at a time.

Same problem and fix as Meesho's app/connector/panel_lock.py and Flipkart's fkpulse/hublock.py: Chromium refuses to
open the same persistent profile twice, and both the keeper and a manual `python -m app.connectors.login` run want
it. An OS file lock, released automatically if its holder dies.
"""
from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path

LOCK_FILE = Path(__file__).resolve().parents[2] / "data" / "snapdeal-profile.lock"


class ProfileBusy(Exception):
    """Another job is using the Seller Panel browser profile right now."""


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
def profile_lock(wait_s: float = 0.0, path=None):
    lock_path = Path(path) if path else LOCK_FILE
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(lock_path, "a+b")
    try:
        deadline = time.monotonic() + wait_s
        while not _try_lock(fh):
            if time.monotonic() >= deadline:
                raise ProfileBusy("another Seller Panel job is using the browser profile")
            time.sleep(0.5)
        try:
            yield
        finally:
            _unlock(fh)
    finally:
        fh.close()
