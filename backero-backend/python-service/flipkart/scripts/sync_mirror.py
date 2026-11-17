"""Publish existing captures without starting a second Seller Hub browser."""
import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))

import mongo_sync  # loads the shared backend environment
from fkpulse.config import load_config
from fkpulse.mirror import sync_mirror

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    db_path = Path(load_config(str(ROOT / "config.yaml")).get("db_path", "fk_pulse.db"))
    if not db_path.is_absolute():
        db_path = ROOT / db_path
    while True:
        try:
            synced = sync_mirror(str(db_path))
            print("Flipkart details published." if synced else "No capture or organization binding; not published.", flush=True)
        except Exception as exc:
            print(f"Flipkart detail sync failed: {type(exc).__name__}", flush=True)
            if not args.watch:
                raise SystemExit(1)
        if not args.watch:
            break
        time.sleep(60)
