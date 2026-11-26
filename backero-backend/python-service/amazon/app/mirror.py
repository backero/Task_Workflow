"""Export an Amazon SP-API capture without creating sample seller figures."""
import json
from pathlib import Path


def inventory_summary(listings):
    """Derive facts only from the rows already captured by the collector."""
    rows = [row for row in listings if isinstance(row, dict)]
    prices = [row.get('price') for row in rows if isinstance(row.get('price'), (int, float))]
    stock = [row.get('stock') for row in rows if isinstance(row.get('stock'), (int, float))]
    return {
        'visible_listings': len(rows),
        'stock_units': sum(max(0, value) for value in stock),
        'fba_listings': sum(1 for row in rows if row.get('fulfillment') == 'FBA'),
        'fbm_listings': sum(1 for row in rows if row.get('fulfillment') == 'FBM'),
        'average_price': (sum(prices) / len(prices)) if prices else None,
    }


def asin_performance(value):
    """Keep only the business-report ASIN fields the browser collector owns."""
    source = value if isinstance(value, dict) else {}
    allowed = {
        'parentAsin', 'childAsin', 'sku', 'title',
        'sessions', 'sessionsB2b', 'pageViews', 'pageViewsB2b',
        'featuredOfferPercentage', 'featuredOfferPercentageB2b',
        'unitsOrdered', 'unitsOrderedB2b',
        'unitSessionPercentage', 'unitSessionPercentageB2b',
        'orderedProductSales', 'orderedProductSalesB2b',
        'totalOrderItems', 'totalOrderItemsB2b',
    }
    rows = []
    for item in source.get('rows') or []:
        if not isinstance(item, dict):
            continue
        row = {key: item[key] for key in allowed if key in item and isinstance(item[key], (str, int, float))}
        if any(key in row for key in ('childAsin', 'sku')):
            rows.append(row)
    return {
        'range': [value for value in (source.get('range') or []) if isinstance(value, str)][:2],
        'capturedAt': source.get('capturedAt') if isinstance(source.get('capturedAt'), str) else None,
        'rows': rows,
    }


def build_mirror(capture_path):
    path = Path(capture_path)
    # A missing capture is a configuration state, not an empty seller account.
    if not path.exists():
        return {
            'source': 'amazon_sp_api', 'mode': 'api', 'lastScrapedAt': None,
            'status': {'state': 'needs_connection', 'detail': 'Amazon SP-API has not been configured on the collector yet.', 'at': None},
            'metrics': {}, 'listings': [], 'orders': [], 'coverage': {},
            'limitations': ['No Amazon seller data has been captured yet. Connect SP-API to begin a read-only sync.'],
        }
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError('Amazon capture must be a JSON object.')
    # Explicitly allow only known report fields to prevent credentials or raw
    # response headers being accidentally published with a capture.
    result = {
        'source': data.get('source') or 'amazon_sp_api', 'mode': data.get('mode') or 'api',
        'marketplace': data.get('marketplace'), 'seller': data.get('seller'),
        'lastScrapedAt': data.get('lastScrapedAt'), 'status': data.get('status') or {},
        'metrics': data.get('metrics') or {}, 'listings': data.get('listings') or [],
        'orders': data.get('orders') or [], 'coverage': data.get('coverage') or {},
        # Date-wise facts from Seller Central Business Reports.  They are kept
        # separate from the current dashboard snapshot so the publisher can
        # store every report date as a truthful historical reading.
        'salesTrafficByDate': data.get('salesTrafficByDate') or [],
        'asinPerformance': asin_performance(data.get('asinPerformance')),
        'limitations': data.get('limitations') or [],
    }
    result['inventorySummary'] = inventory_summary(result['listings'])
    return result
