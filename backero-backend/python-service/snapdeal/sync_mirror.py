"""Read-only publisher for existing Snapdeal captures, without a second browser."""
import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
import mongo_sync
from app.mirror import sync_mirror

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    while True:
        try:
            synced = sync_mirror(str(ROOT / 'data' / 'sdpulse.db'))
            print('Snapdeal details published.' if synced else 'No capture or organization binding; not published.', flush=True)
        except Exception as exc:
            print(f'Snapdeal detail sync failed: {type(exc).__name__}', flush=True)
            if not args.watch:
                raise SystemExit(1)
        if not args.watch:
            break
        time.sleep(60)
