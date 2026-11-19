"""Export an Amazon SP-API capture without creating sample seller figures."""
import json
from pathlib import Path


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
        'limitations': data.get('limitations') or [],
    }
    return result
