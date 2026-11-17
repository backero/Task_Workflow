"""Read-only order-history capture from the same responses Seller Hub displays."""
from __future__ import annotations

import json
import sqlite3
import copy
from datetime import datetime

SCHEMA = '''
CREATE TABLE IF NOT EXISTS hub_history_captures(
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, captured_at TEXT NOT NULL,
 status TEXT NOT NULL, detail TEXT, period TEXT, total INTEGER, rows_json TEXT NOT NULL);
'''


def normalize_shipments(payload, state):
    branch = (payload.get('data') or {}).get('filteredShipmentGroups') or {}
    rows = []
    for group in branch.get('shipmentGroups') or []:
        for shipment in group.get('shipments') or []:
            shipment_id = shipment.get('shippingId') or shipment.get('shipmentId')
            if not shipment_id:
                continue
            items = shipment.get('shipmentOrderItems') or []
            if not items:
                rows.append({'shipment_id': shipment_id, 'status': state})
            else:
                for item in items:
                    # Only business fields: buyer names, addresses and phone numbers never leave the browser.
                    rows.append({
                        'shipment_id': shipment_id,
                        'order_id': item.get('orderId'), 'order_item_id': item.get('orderItemId'),
                        'sku': item.get('sku'), 'fsn': item.get('fsn'), 'title': item.get('title'),
                        'quantity': item.get('quantity'), 'price': item.get('sellingPrice'),
                        'order_date': item.get('orderDate'), 'status': item.get('status') or state,
                        'dispatch_by': item.get('dispatchByDate'),
                    })
    page_info = branch.get('pageInfo') or {}
    errors = payload.get('dataErrors') or payload.get('graphErrors')
    messages = []
    def collect(value):
        if isinstance(value, dict):
            if isinstance(value.get('message'), str):
                messages.append(value['message'][:300])
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)
    collect(errors)
    return {'rows': rows, 'total': page_info.get('total'), 'hasMore': page_info.get('hasMore'),
            'errors': list(dict.fromkeys(messages))[:3]}


def store_capture(db_path, kind, rows, status, detail, total=None, period=None):
    now = datetime.now().isoformat(timespec='seconds')
    with sqlite3.connect(db_path, timeout=30) as conn:
        conn.executescript(SCHEMA)
        conn.execute('INSERT INTO hub_history_captures(kind,captured_at,status,detail,period,total,rows_json) '
                     'VALUES (?,?,?,?,?,?,?)', (kind, now, status, detail, period, total, json.dumps(rows)))


def read_history(ctx, db_path):
    from fkpulse.sellerhub import BASE, SessionExpired, _is_landing
    results = {}
    page = ctx.new_page()
    captures = []
    request_template = []
    def response_received(response):
        if response.url.split('?')[0] != 'https://seller.flipkart.com/orchestrator/graphql':
            return
        try:
            data = response.json()
            if (data.get('data') or {}).get('filteredShipmentGroups') is not None:
                captures.append(normalize_shipments(data, 'completed'))
                body = response.request.post_data_json
                if isinstance(body, dict) and body.get('query', '').lstrip().startswith('query'):
                    request_template[:] = [body, {
                        k: v for k, v in response.request.all_headers().items()
                        if k.lower() in ('content-type', 'x-csrf-token', 'x-xsrf-token', 'x-client-version')
                    }]
        except Exception:
            pass
    page.on('response', response_received)
    try:
        page.goto(BASE + '#dashboard/active-orders?query=%7B%22activeShipmentTile%22%3A%22completed%22%7D',
                  wait_until='domcontentloaded', timeout=60000)
        page.wait_for_timeout(12000)
        if _is_landing(page):
            raise SessionExpired('Flipkart order-history login expired.')
        if not captures:
            store_capture(db_path, 'fullOrders', [], 'unavailable', 'Seller Hub did not return readable order-history data.')
            results['order_history'] = 'unavailable: seller did not return readable shipment details'
        else:
            latest = captures[-1]
            # Replay only the read query the page itself made, keeping its filters and
            # session in the browser. Never copy authentication material to disk.
            if latest['hasMore'] and request_template:
                body, headers = request_template
                body = copy.deepcopy(body)
                paging = body.get('variables', {}).get('input', {}).get('paginationInput')
                if isinstance(paging, dict) and isinstance(paging.get('pageNum'), int):
                    first_page = paging['pageNum']
                    paging['pageSize'] = 100
                    all_rows = {}
                    all_errors = []
                    for page_num in range(first_page, first_page + 50):
                        paging['pageNum'] = page_num
                        try:
                            data = page.evaluate('''async ({body,headers}) => {
                              const r = await fetch('/orchestrator/graphql', {method:'POST',
                                credentials:'same-origin',headers:{...headers,'Content-Type':'application/json'},
                                body:JSON.stringify(body)});
                              if (!r.ok) throw new Error('Seller history request failed: '+r.status);
                              return await r.json();
                            }''', {'body': body, 'headers': headers})
                        except Exception:
                            latest['hasMore'] = True
                            break
                        chunk = normalize_shipments(data, 'completed')
                        before = len(all_rows)
                        for row in chunk['rows']:
                            all_rows[(row['shipment_id'], row.get('order_item_id'))] = row
                        all_errors.extend(chunk['errors'])
                        if chunk.get('total') is not None:
                            latest['total'] = chunk['total']
                        latest['hasMore'] = chunk['hasMore']
                        if not chunk['hasMore'] or len(all_rows) == before:
                            break
                        page.wait_for_timeout(1200)
                    if all_rows:
                        latest['rows'] = list(all_rows.values())
                        latest['errors'] = list(dict.fromkeys(all_errors))[:3]
            detail = 'Captured completed-order shipments from the selected Seller Hub view.'
            partial = latest['hasMore'] or latest['errors'] or any(not r.get('order_id') for r in latest['rows'])
            if partial:
                detail = 'Partial capture: Seller Hub returned shipment identifiers but some order-item details or pages are unavailable.'
            if latest['errors']:
                detail += ' Flipkart reported an upstream data error. Product, price and order-date fields remain unavailable where not returned.'
            store_capture(db_path, 'fullOrders', latest['rows'], 'partial' if partial else 'ok', detail,
                          latest['total'], 'Completed shipments · seller-selected filters')
            results['order_history'] = 'unavailable: partial shipment details; see history coverage' if partial else 'ok'
        # This is the self-ship returns queue. It must not be labelled all customer/courier returns.
        page.goto(BASE + '#dashboard/returns', wait_until='domcontentloaded', timeout=60000)
        page.wait_for_timeout(10000)
        if _is_landing(page):
            raise SessionExpired('Flipkart returns login expired.')
        text = page.inner_text('body')
        if 'Self Ship Returns' in text and 'There are no items to show.' in text:
            store_capture(db_path, 'returnDetails', [], 'partial',
                          'The selected self-ship Return Request queue is empty. Other return states and fulfilment modes are not captured.',
                          0, 'Self-ship · Return Request only')
            results['return_details'] = 'unavailable: self-ship queue only; other return modes not connected'
        else:
            store_capture(db_path, 'returnDetails', [], 'unavailable',
                          'Return rows could not yet be mapped reliably; use the summary counts until a supported report is connected.')
            results['return_details'] = 'unavailable: return detail layout not connected'
    finally:
        page.close()
    return results
