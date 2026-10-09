"""One user of the Seller Hub browser profile at a time.

Chrome refuses to open the same profile twice, and three things want it: the session keeper (every few minutes), the
Seller Hub read (every 3 hours) and the sign-in script you run by hand. This is a lock across processes and threads.
It is an OS file lock, so it is released automatically if its holder dies — there is no stale lock to clean up.
"""
from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path

LOCK_FILE = Path(__file__).resolve().parents[1] / "sellerhub-profile.lock"


class HubBusy(Exception):
    """Another job is using the Seller Hub browser right now."""


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
def hub_lock(wait_s: float = 0.0, path: Path | str | None = None):
    """Hold the Seller Hub browser. ``wait_s`` = how long to wait for the current holder; 0 = give up at once (raises HubBusy)."""
    fh = open(path or LOCK_FILE, "a+b")
    try:
        deadline = time.monotonic() + wait_s
        while not _try_lock(fh):
            if time.monotonic() >= deadline:
                raise HubBusy("another Seller Hub job is using the browser")
            time.sleep(0.5)
        try:
            yield
        finally:
            _unlock(fh)
    finally:
        fh.close()
