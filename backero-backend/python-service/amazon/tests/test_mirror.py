import json

from app.mirror import build_mirror


def test_missing_capture_is_connection_state(tmp_path):
    result = build_mirror(tmp_path / 'missing.json')
    assert result['status']['state'] == 'needs_connection'
    assert result['orders'] == []


def test_mirror_exports_only_allowlisted_capture_fields(tmp_path):
    capture = tmp_path / 'capture.json'
    capture.write_text(json.dumps({
        'lastScrapedAt': '2026-11-18T12:00:00+05:30', 'status': {'state': 'ok'},
        'metrics': {'orders': {'orders_30d': {'value': 0}}}, 'orders': [{'order_id': 'A'}],
        'listings': [], 'coverage': {}, 'limitations': [], 'access_token': 'must-not-export',
    }), encoding='utf-8')
    result = build_mirror(capture)
    assert result['metrics']['orders']['orders_30d']['value'] == 0
    assert result['orders'] == [{'order_id': 'A'}]
    assert 'access_token' not in result
