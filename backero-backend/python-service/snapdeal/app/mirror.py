"""Organization-bound export of actual Snapdeal Seller Panel captures."""
import sqlite3
from pathlib import Path


def build_mirror(db_path):
    conn = sqlite3.connect(Path(db_path).resolve().as_uri() + '?mode=ro', uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('BEGIN')
        result = {'source': 'seller_panel', 'mode': 'browser', 'metrics': {}, 'coverage': {}}
        for row in conn.execute('SELECT area,key,value,text,captured_at FROM panel_metrics WHERE id IN '
                                '(SELECT MAX(id) FROM panel_metrics GROUP BY area,key)'):
            result['metrics'].setdefault(row['area'], {})[row['key']] = {
                'value': row['value'] if row['value'] is not None else row['text'],
                'capturedAt': row['captured_at'],
            }
        # Join only rows actually read from Seller Panel, not old demo/API defaults.
        result['listings'] = [dict(r) for r in conn.execute(
            'SELECT l.sku,l.title,l.brand,l.category,l.price,l.mrp,l.stock,l.status,l.fulfilment,l.last_synced,'
            'p.pog_id,p.product_rating_pct,p.gross_payable,p.msp,p.captured_at '
            'FROM listing_panel p JOIN listings l ON l.sku=p.sku ORDER BY l.title,l.sku')]
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        result['sections'] = {r['area']: {'state': r['state'], 'detail': r['detail'], 'checkedAt': r['checked_at']}
                              for r in conn.execute('SELECT * FROM panel_area_status')} if 'panel_area_status' in tables else {}
        for key, table in [('performance', 'sku_performance'), ('settlements', 'settlements')]:
            result[key] = [dict(r) for r in conn.execute(f'SELECT * FROM {table} ORDER BY captured_at DESC')] if table in tables else []
        for key in ('listings', 'performance', 'settlements'):
            dates = [r['captured_at'] for r in result[key] if r.get('captured_at')]
            result['coverage'][key] = {'capturedAt': max(dates) if dates else None, 'count': len(result[key])}
        result['lastScrapedAt'] = conn.execute('SELECT MAX(captured_at) FROM panel_metrics').fetchone()[0]
        run = conn.execute("SELECT status,detail,finished_at FROM robot_runs WHERE job='panel_read' ORDER BY id DESC LIMIT 1").fetchone()
        result['status'] = {'state': run['status'], 'detail': run['detail'], 'at': run['finished_at']} if run else {
            'state': 'needs_you', 'detail': 'No Seller Panel read has completed yet.', 'at': None}
        result['status']['failedAreas'] = [area for area, status in result['sections'].items() if status['state'] != 'ok']
        result['limitations'] = [
            'Orders and returns are account-level summaries, not individual order/return records.',
            'Ads values are the captured advertising summary for its displayed range, not organic traffic.',
            'A failed Ads read can leave older captured values visible; check the dates for each section.',
            'Product performance covers the panel products table that was captured, not a complete per-SKU sales report.',
            'Listings and settlement rows retain their own capture dates; row dates can differ from the latest account read.',
            'Keyword/search-term reports and organic CTR/CVR have not been captured.',
            'Page refresh loads saved data. Seller scraping runs separately using the authenticated Seller Panel session.',
        ]
        return result
    finally:
        conn.close()


def sync_mirror(db_path):
    import os
    import sys
    from datetime import datetime, timezone
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from mongo_sync import _get_collection
    from bson import ObjectId
    org = os.environ.get('SNAPDEAL_ORGANIZATION_ID')
    if not org:
        return False
    if not ObjectId.is_valid(org):
        raise ValueError('Invalid SNAPDEAL_ORGANIZATION_ID')
    data = build_mirror(db_path)
    if not data['lastScrapedAt']:
        return False
    collection = _get_collection().database['snapdealsellermirrors']
    collection.create_index('organizationId', unique=True)
    collection.update_one({'organizationId': ObjectId(org)},
                          {'$set': {'data': data, 'syncedAt': datetime.now(timezone.utc)}}, upsert=True)
    return True
