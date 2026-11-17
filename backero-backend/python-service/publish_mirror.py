"""Publish a local seller capture to an explicitly configured website database.

No credentials are copied from seller browsers. Existing MongoDB credentials are
loaded from backero-backend/.env; destination database and org must be explicit.
"""
import argparse
import importlib
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PLATFORMS = {
    'flipkart': ('fkpulse.mirror', 'fk_pulse.db'),
    'meesho': ('app.mirror', 'data/saas.db'),
    'snapdeal': ('app.mirror', 'data/sdpulse.db'),
}


def main():
    from dotenv import load_dotenv
    from pymongo import MongoClient
    from bson import ObjectId
    load_dotenv(ROOT.parent / '.env')
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', choices=PLATFORMS, required=True)
    parser.add_argument('--database', default=os.environ.get('MARKETPLACE_MIRROR_DATABASE'))
    parser.add_argument('--organization-id', default=os.environ.get('MARKETPLACE_MIRROR_ORGANIZATION_ID'))
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    if not args.database or not re.fullmatch(r'[A-Za-z0-9_-]+', args.database):
        parser.error('An explicit valid destination database is required.')
    if not args.organization_id or not ObjectId.is_valid(args.organization_id):
        parser.error('An explicit valid destination organization is required.')
    platform_root = ROOT / args.platform
    sys.path.insert(0, str(platform_root))
    module_name, db_relative = PLATFORMS[args.platform]
    module = importlib.import_module(module_name)
    client = MongoClient(os.environ['MONGODB_URI'], serverSelectionTimeoutMS=10000)
    destination = client[args.database]
    org_id = ObjectId(args.organization_id)
    if not destination.organizations.find_one({'_id': org_id, 'isActive': True}, {'_id': 1}):
        raise RuntimeError('Destination organization does not exist or is inactive.')
    collection = destination[args.platform + 'sellermirrors']
    collection.create_index('organizationId', unique=True)
    while True:
        try:
            # Reload export logic without interrupting the seller login browser.
            module = importlib.reload(module)
            data = module.build_mirror(str(platform_root / db_relative))
            if not data.get('lastScrapedAt'):
                raise RuntimeError('No real seller capture exists.')
            collection.update_one({'organizationId': org_id}, {'$set': {
                'data': data, 'syncedAt': datetime.now(timezone.utc),
            }}, upsert=True)
            print(f'{args.platform} seller mirror published to {args.database}.', flush=True)
        except Exception as exc:
            print(f'{args.platform} publish failed: {type(exc).__name__}', flush=True)
            if not args.watch:
                raise SystemExit(1)
        if not args.watch:
            break
        time.sleep(60)
    client.close()


if __name__ == '__main__':
    main()
