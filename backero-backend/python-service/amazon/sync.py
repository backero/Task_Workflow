"""Read selected Amazon India Seller Central data through the official SP-API.

This collector intentionally has no browser automation and never stores LWA or
AWS credentials in its capture. Configure secrets only in backero-backend/.env
on the machine running this process.
"""
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode

ROOT = Path(__file__).resolve().parent
CAPTURE = ROOT / 'data' / 'capture.json'
MARKETPLACE_ID = os.environ.get('AMAZON_MARKETPLACE_ID', 'A21TJRUUN4KGV')  # Amazon.in
REGION = os.environ.get('AMAZON_SP_API_REGION', 'eu-west-1')
HOST = os.environ.get('AMAZON_SP_API_HOST', 'sellingpartnerapi-eu.amazon.com')


def _required(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f'{name} is not configured')
    return value


def _sign(key, value):
    return hmac.new(key, value.encode('utf-8'), hashlib.sha256).digest()


def lwa_access_token(requests_module):
    response = requests_module.post('https://api.amazon.com/auth/o2/token', data={
        'grant_type': 'refresh_token', 'refresh_token': _required('AMAZON_LWA_REFRESH_TOKEN'),
        'client_id': _required('AMAZON_LWA_CLIENT_ID'), 'client_secret': _required('AMAZON_LWA_CLIENT_SECRET'),
    }, timeout=30)
    response.raise_for_status()
    token = response.json().get('access_token')
    if not token:
        raise RuntimeError('Amazon LWA token response did not contain an access token')
    return token


def sp_api_get(requests_module, path, params, access_token):
    """Perform one AWS SigV4-signed SP-API GET request."""
    now = datetime.now(timezone.utc)
    stamp, amz_date = now.strftime('%Y%m%d'), now.strftime('%Y%m%dT%H%M%SZ')
    canonical_query = urlencode(sorted((key, str(value)) for key, value in (params or {}).items()), quote_via=quote, safe='-_.~')
    headers = {'host': HOST, 'user-agent': 'BackeroAmazonMirror/1.0', 'x-amz-access-token': access_token, 'x-amz-date': amz_date}
    session_token = os.environ.get('AMAZON_AWS_SESSION_TOKEN')
    if session_token:
        headers['x-amz-security-token'] = session_token
    canonical_headers = ''.join(f'{key}:{headers[key].strip()}\n' for key in sorted(headers))
    signed_headers = ';'.join(sorted(headers))
    payload_hash = hashlib.sha256(b'').hexdigest()
    canonical_request = '\n'.join(['GET', path, canonical_query, canonical_headers, signed_headers, payload_hash])
    scope = f'{stamp}/{REGION}/execute-api/aws4_request'
    string_to_sign = '\n'.join(['AWS4-HMAC-SHA256', amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()])
    secret = _required('AMAZON_AWS_SECRET_ACCESS_KEY')
    signing_key = _sign(_sign(_sign(_sign(('AWS4' + secret).encode(), stamp), REGION), 'execute-api'), 'aws4_request')
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()
    headers['Authorization'] = f'AWS4-HMAC-SHA256 Credential={_required("AMAZON_AWS_ACCESS_KEY_ID")}/{scope}, SignedHeaders={signed_headers}, Signature={signature}'
    response = requests_module.get(f'https://{HOST}{path}', params=canonical_query, headers=headers, timeout=45)
    response.raise_for_status()
    return response.json()


def metric(value, captured_at):
    return {'value': value, 'capturedAt': captured_at}


def collect(requests_module=None):
    if requests_module is None:
        import requests as requests_module
    token = lwa_access_token(requests_module)
    participants = sp_api_get(requests_module, '/sellers/v1/marketplaceParticipations', {}, token)
    participant = next((item for item in participants.get('payload', []) if item.get('marketplace', {}).get('id') == MARKETPLACE_ID), None)
    if not participant:
        raise RuntimeError('The configured seller is not authorized for the requested Amazon marketplace')
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace('+00:00', 'Z')
    orders_response = sp_api_get(requests_module, '/orders/2026-01-01/orders', {
        'marketplaceIds': MARKETPLACE_ID, 'createdAfter': since, 'maxResultsPerPage': 100,
    }, token)
    payload = orders_response.get('payload') or orders_response
    source_orders = payload.get('orders') or payload.get('Orders') or []
    captured_at = datetime.now().astimezone().isoformat(timespec='seconds')
    orders, sales = [], 0.0
    for order in source_orders:
        total = order.get('orderTotal') or order.get('OrderTotal') or {}
        try:
            amount = float(total.get('amount') or total.get('Amount') or 0)
        except (TypeError, ValueError):
            amount = None
        if amount is not None:
            sales += amount
        orders.append({
            'order_id': order.get('amazonOrderId') or order.get('AmazonOrderId'),
            'status': order.get('orderStatus') or order.get('OrderStatus'),
            'purchase_date': order.get('purchaseDate') or order.get('PurchaseDate'),
            'fulfillment_channel': order.get('fulfillmentChannel') or order.get('FulfillmentChannel'),
            'sales_channel': order.get('salesChannel') or order.get('SalesChannel'),
            'amount': amount, 'currency': total.get('currencyCode') or total.get('CurrencyCode'),
        })
    return {
        'source': 'amazon_sp_api', 'marketplace': {'id': MARKETPLACE_ID, 'name': participant.get('marketplace', {}).get('name') or 'Amazon India'},
        'seller': {'id': participant.get('participant', {}).get('id'), 'name': participant.get('participant', {}).get('name')},
        'lastScrapedAt': captured_at,
        'status': {'state': 'ok', 'detail': 'Official Amazon SP-API read completed.', 'at': captured_at},
        'metrics': {'orders': {'orders_30d': metric(len(orders), captured_at), 'sales_30d': metric(sales, captured_at)}},
        'orders': orders, 'listings': [],
        'coverage': {
            'orders': {'capturedAt': captured_at, 'count': len(orders), 'period': 'Last 30 days; first 100 API results only', 'status': 'partial', 'detail': 'Pagination and order-item detail are not included in the initial connector.'},
            'listings': {'capturedAt': None, 'count': 0, 'status': 'unavailable', 'detail': 'Listing reports are not enabled in the initial SP-API connector.'},
        },
        'limitations': [
            'Orders show the first 100 SP-API results from the last 30 days; pagination and order-item detail are pending.',
            'Listing, inventory, returns, settlements, advertising and keyword reports require additional Amazon SP-API roles and report jobs.',
            'Sales are summed order totals returned by SP-API and do not represent settled payout or profit.',
        ],
    }


def write_capture():
    try:
        capture = collect()
    except Exception as exc:  # retain no token or provider response body
        now = datetime.now().astimezone().isoformat(timespec='seconds')
        capture = {'source': 'amazon_sp_api', 'lastScrapedAt': None,
                   'status': {'state': 'needs_connection', 'detail': f'Amazon SP-API connection needs attention: {type(exc).__name__}.', 'at': now},
                   'metrics': {}, 'listings': [], 'orders': [], 'coverage': {},
                   'limitations': ['Check the local collector configuration and Amazon SP-API authorization.']}
    CAPTURE.parent.mkdir(parents=True, exist_ok=True)
    temporary = CAPTURE.with_suffix('.tmp')
    temporary.write_text(json.dumps(capture, ensure_ascii=False), encoding='utf-8')
    temporary.replace(CAPTURE)
    return capture


if __name__ == '__main__':
    result = write_capture()
    print(result['status']['state'], flush=True)
