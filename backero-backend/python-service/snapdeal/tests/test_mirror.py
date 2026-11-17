import sqlite3

from app.database import SCHEMA
from app.connectors.panel_reader import SCHEMA as PANEL_SCHEMA, ads_login_required
from app.mirror import build_mirror


def test_real_panel_rows_only_and_per_field_dates(tmp_path):
    path = str(tmp_path / 'seller.db')
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA + PANEL_SCHEMA)
        conn.execute("INSERT INTO listings(sku,title,price,stock,rating) VALUES ('DEMO','Demo',99,5,5)")
        conn.execute("INSERT INTO listings(sku,title,price,stock,rating) VALUES ('REAL','Real',100,0,99)")
        conn.execute("INSERT INTO listing_panel(sku,pog_id,product_rating_pct,captured_at) VALUES ('REAL','POG1',88,'2026-11-17T10:00:00')")
        conn.execute("INSERT INTO panel_metrics(captured_at,area,key,value) VALUES ('2026-11-16T10:00:00','ads','spend',50)")
        conn.execute("INSERT INTO panel_metrics(captured_at,area,key,value) VALUES ('2026-11-17T10:00:00','orders','pending',0)")
        conn.execute("INSERT INTO settlements(ref,amount,transactions,captured_at) VALUES ('SETTLE1',0,1,'2026-11-16T10:00:00')")
        conn.execute("INSERT INTO robot_runs(job,finished_at,status,detail) VALUES ('panel_read','2026-11-17T10:00:00','partial','Ads read failed')")
        conn.execute("INSERT INTO panel_area_status VALUES ('ads','needs_login','Ads sign-in required','2026-11-17T10:00:00')")
    data = build_mirror(path)
    assert [r['sku'] for r in data['listings']] == ['REAL']
    assert data['listings'][0]['stock'] == 0
    assert 'rating' not in data['listings'][0]  # source rating scale was not verified
    assert data['listings'][0]['product_rating_pct'] == 88
    assert data['metrics']['orders']['pending']['value'] == 0
    assert data['metrics']['ads']['spend']['capturedAt'] == '2026-11-16T10:00:00'
    assert data['coverage']['settlements']['count'] == 1
    assert data['settlements'][0]['amount'] == 0
    assert data['status']['state'] == 'partial'
    assert data['sections']['ads']['state'] == 'needs_login'


def test_ads_sign_in_is_distinct_from_a_parser_or_seller_session_failure():
    assert ads_login_required('Start Selling on Snapdeal Enter Mobile No. Login')
    assert not ads_login_required('CPT Ads Summary Start Selling on Snapdeal Enter Mobile No.')
    assert not ads_login_required('Account Health : Good Orders & Sales Summary')
