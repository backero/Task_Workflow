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
from zoneinfo import ZoneInfo
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PLATFORMS = {
    'amazon': ('app.mirror', 'data/capture.json'),
    'flipkart': ('fkpulse.mirror', 'fk_pulse.db'),
    'meesho': ('app.mirror', 'data/saas.db'),
    'snapdeal': ('app.mirror', 'data/sdpulse.db'),
}


def flatten_metrics(value, prefix='', result=None):
    """Extract only numeric seller facts from a safe mirror export."""
    result = result if result is not None else {}
    if isinstance(value, dict):
        if isinstance(value.get('value'), (int, float)):
            result[prefix] = value['value']
        else:
            for key, item in value.items():
                next_prefix = f'{prefix}.{key}' if prefix else key
                flatten_metrics(item, next_prefix, result)
    return result


def trend_metrics(data):
    metrics = flatten_metrics(data.get('metrics') or {})
    inventory = data.get('inventorySummary') or {}
    for key, value in inventory.items():
        if isinstance(value, (int, float)):
            metrics[f'inventory.{key}'] = value
    return metrics


def capture_day(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        parsed = datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(ZoneInfo('Asia/Kolkata')).strftime('%Y-%m-%d')


def capture_timestamp(value):
    """Keep the seller's real capture timestamp, never the publisher's time."""
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def is_successful_capture(data):
    status = data.get('status') or {}
    state = status.get('state') if isinstance(status, dict) else status
    return state not in {'needs_you', 'needs_connection', 'error', 'failed'}


def amazon_sales_traffic_metrics(row):
    """Allowlist numeric facts from Amazon's date-wise Sales & Traffic report."""
    fields = {
        'orderedProductSales': 'business_reports.ordered_product_sales',
        'orderedProductSalesB2b': 'business_reports.ordered_product_sales_b2b',
        'unitsOrdered': 'business_reports.units_ordered',
        'unitsOrderedB2b': 'business_reports.units_ordered_b2b',
        'totalOrderItems': 'business_reports.total_order_items',
        'totalOrderItemsB2b': 'business_reports.total_order_items_b2b',
        'averageSalesPerOrderItem': 'business_reports.average_sales_per_order_item',
        'averageSalesPerOrderItemB2b': 'business_reports.average_sales_per_order_item_b2b',
    }
    return {target: row[source] for source, target in fields.items() if isinstance(row.get(source), (int, float))}


def publish_amazon_sales_traffic(history, organization_id, data, captured_at):
    """Persist each real Business Report day, including zero-sale days, once."""
    rows = data.get('salesTrafficByDate') or []
    for row in rows:
        report_date = row.get('date') if isinstance(row, dict) else None
        if not isinstance(report_date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', report_date):
            continue
        metrics = amazon_sales_traffic_metrics(row)
        if not metrics:
            continue
        report_data = {
            'status': {'state': 'ok', 'detail': 'Amazon Seller Central Sales and Traffic report.', 'at': captured_at.isoformat()},
            'reportType': 'sales_and_traffic_by_date',
        }
        history.update_one(
            {'organizationId': organization_id, 'platform': 'amazon', 'date': report_date},
            {'$set': {
                'capturedAt': captured_at, 'source': 'seller_central_business_reports',
                'metrics': metrics, 'data': report_data,
            }},
            upsert=True,
        )


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
    history = destination['marketplacesellersnapshots']
    history.create_index([('organizationId', 1), ('platform', 1), ('date', 1)], unique=True)
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
            # A minute-by-minute mirror is useful for the current dashboard but
            # wasteful for long-term reporting. Keep the latest real reading per
            # India business day, organization and platform instead.
            metrics = trend_metrics(data)
            captured_at = capture_timestamp(data.get('lastScrapedAt'))
            if metrics and captured_at and is_successful_capture(data):
                history.update_one(
                    {'organizationId': org_id, 'platform': args.platform, 'date': capture_day(data.get('lastScrapedAt'))},
                    {'$set': {
                        'capturedAt': captured_at,
                        'source': data.get('source') or args.platform,
                        'metrics': metrics,
                        'data': data,
                    }},
                    upsert=True,
                )
                if args.platform == 'amazon':
                    publish_amazon_sales_traffic(history, org_id, data, captured_at)
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
