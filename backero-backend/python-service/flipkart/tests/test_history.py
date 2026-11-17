import sqlite3

from fkpulse.history import normalize_shipments, store_capture
from fkpulse.mirror import build_mirror
from fkpulse.db import init_db
from fkpulse.sellerhub import init_hub_tables


def test_partial_shipments_do_not_invent_order_details_or_expose_buyer():
    data = normalize_shipments({
        'data': {'filteredShipmentGroups': {'pageInfo': {'total': 668, 'hasMore': True},
            'shipmentGroups': [{'shipments': [{'shippingId': 'SHIP-1', 'shipmentOrderItems': [],
                                              'buyer': {'phone': 'private'}}]}]}},
        'dataErrors': {'shipment': {'errors': [{'message': 'Order details unavailable'}]}},
    }, 'completed')
    assert data['rows'] == [{'shipment_id': 'SHIP-1', 'status': 'completed'}]
    assert data['total'] == 668
    assert data['hasMore'] is True
    assert data['errors'] == ['Order details unavailable']


def test_history_capture_exports_partial_coverage(tmp_path):
    path = str(tmp_path / 'source.db')
    init_db(path)
    with sqlite3.connect(path) as conn:
        init_hub_tables(conn)
    store_capture(path, 'fullOrders', [{'shipment_id': 'SHIP-1'}], 'partial', 'Details missing', 668, 'Completed')
    data = build_mirror(path)
    assert data['coverage']['fullOrders']['status'] == 'partial'
    assert data['coverage']['fullOrders']['total'] == 668
    assert data['fullOrders'][0]['shipment_id'] == 'SHIP-1'
    assert data['coverage']['returnDetails']['status'] == 'unavailable'
