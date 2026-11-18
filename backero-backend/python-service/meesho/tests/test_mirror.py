import sqlite3

from app.database import init_db
from app.connectors.panel_reader import init_panel_tables, PRODUCT_SCHEMA, PRICING_SCHEMA
from app.mirror import build_mirror
from app.mirror import current_read_status
from datetime import datetime, timedelta


def test_only_real_captured_batches_are_exported_and_stale_login_is_preserved(tmp_path):
    path = str(tmp_path / 'source.db')
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        init_db(conn)
        init_panel_tables(conn)
        conn.executescript(PRODUCT_SCHEMA + PRICING_SCHEMA)
        conn.execute("INSERT INTO panel_metrics(captured_at,area,key,value) VALUES ('2026-11-17T10:00:00','business_overview','views',0)")
        conn.execute("INSERT INTO panel_products(product_id,title,views,captured_at) VALUES ('old','Old',4,'2026-11-16T10:00:00')")
        conn.execute("INSERT INTO panel_products(product_id,title,views,captured_at) VALUES ('new','New',0,'2026-11-17T10:00:00')")
        conn.execute("UPDATE panel_products SET conversion_pct=645.2 WHERE product_id='new'")
        conn.execute("INSERT INTO panel_metrics(captured_at,area,key,value) VALUES ('2026-11-17T10:00:00','business_overview','conversion_pct',41.5)")
        conn.execute("INSERT INTO robot_runs(job,started_at,finished_at,status,detail) VALUES ('panel_read','start','finish','needs_you','Login expired')")
    data = build_mirror(path)
    assert data['metrics']['business_overview']['views']['value'] == 0
    assert [p['product_id'] for p in data['products']] == ['new']
    assert data['products'][0]['views'] == 0
    assert data['products'][0]['conversion_pct'] is None
    assert data['metrics']['business_overview']['conversion_pct']['value'] is None
    assert data['pricing'] == []
    assert data['status']['state'] == 'needs_you'
    assert data['coverage']['pricing']['capturedAt'] is None


def test_new_verified_session_replaces_only_the_old_login_warning_while_reading():
    now = datetime(2026, 11, 18, 12, 0)
    old = {'state': 'needs_you', 'at': (now - timedelta(minutes=5)).isoformat(), 'detail': 'Old login warning'}
    session = {'signedIn': True, 'checkedAt': now.isoformat()}
    assert current_read_status(old, session, now)['state'] == 'syncing'
    assert current_read_status(old, {**session, 'signedIn': False}, now) == old
    assert current_read_status(old, session, now + timedelta(minutes=11)) == old
    failure = {**old, 'state': 'failed'}
    assert current_read_status(failure, session, now) == failure
