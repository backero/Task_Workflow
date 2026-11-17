"""Export captured Supplier Panel facts; never use synthetic listing snapshots."""
import sqlite3
from pathlib import Path


def build_mirror(db_path):
    conn = sqlite3.connect(Path(db_path).resolve().as_uri() + '?mode=ro', uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute('BEGIN')
        result = {'source': 'supplier_panel', 'mode': 'auto', 'metrics': {}, 'coverage': {}}
        for row in conn.execute('SELECT area,key,value,text,captured_at FROM panel_metrics WHERE id IN '
                                '(SELECT MAX(id) FROM panel_metrics GROUP BY area,key)'):
            result['metrics'].setdefault(row['area'], {})[row['key']] = {
                'value': None if row['key'] == 'conversion_pct' else row['value'] if row['value'] is not None else row['text'],
                'capturedAt': row['captured_at'],
            }
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for key, table in [('products', 'panel_products'), ('pricing', 'panel_pricing')]:
            captured = conn.execute(f'SELECT MAX(captured_at) FROM {table}').fetchone()[0] if table in tables else None
            rows = [dict(r) for r in conn.execute(f'SELECT * FROM {table} WHERE captured_at=?', (captured,))] if captured else []
            # Existing captures contain impossible conversion percentages and the
            # account conversion basis is unverified. Do not publish these as facts.
            if key == 'products':
                for row in rows:
                    row['conversion_pct'] = None
            result[key] = rows
            result['coverage'][key] = {'capturedAt': captured, 'count': len(rows)}
        result['lastScrapedAt'] = conn.execute('SELECT MAX(captured_at) FROM panel_metrics').fetchone()[0]
        run = conn.execute("SELECT status,detail,finished_at FROM robot_runs WHERE job='panel_read' ORDER BY id DESC LIMIT 1").fetchone()
        result['status'] = {'state': run['status'], 'detail': run['detail'], 'at': run['finished_at']} if run else {
            'state': 'needs_you', 'detail': 'No Supplier Panel read has completed yet.', 'at': None}
        result['limitations'] = [
            'Conversion rates are unavailable pending source-column verification; existing captures contain inconsistent values.',
            'Business Dashboard totals use the seller-selected report range; no fixed 7-day period is assumed.',
            'Views and clicks are the Supplier Panel figures. Views are not relabelled as advertising impressions.',
            'Product and pricing tables show the latest captured batch; check capture dates and partial-read warnings.',
            'Orders and returns currently show account summaries, not individual order/return records.',
            'Keyword and search-term reports have not been captured.',
            'A website refresh reloads saved data; a fresh seller scrape requires an authenticated Supplier Panel session.',
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
    org = os.environ.get('MEESHO_ORGANIZATION_ID')
    if not org:
        return False
    if not ObjectId.is_valid(org):
        raise ValueError('Invalid MEESHO_ORGANIZATION_ID')
    data = build_mirror(db_path)
    if not data['lastScrapedAt']:
        return False
    collection = _get_collection().database['meeshosellermirrors']
    collection.create_index('organizationId', unique=True)
    collection.update_one({'organizationId': ObjectId(org)},
                          {'$set': {'data': data, 'syncedAt': datetime.now(timezone.utc)}}, upsert=True)
    return True
