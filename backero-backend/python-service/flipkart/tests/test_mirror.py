import sqlite3

import pytest

from fkpulse.db import init_db
from fkpulse.mirror import build_mirror
from fkpulse.sellerhub import init_hub_tables


@pytest.fixture
def captured_db(tmp_path):
    path = str(tmp_path / "seller.db")
    init_db(path)
    with sqlite3.connect(path) as conn:
        init_hub_tables(conn)
        conn.executemany(
            "INSERT INTO hub_metrics(captured_at,area,key,value,text) VALUES (?,?,?,?,?)",
            [
                ("2026-11-16T10:00:00", "home", "units_today", 9, None),
                ("2026-11-17T10:00:00", "home", "units_today", 0, None),
                ("2026-11-16T10:00:00", "traffic", "conversion_30d_pct", None, None),
            ],
        )
        conn.executemany(
            "INSERT INTO hub_listing_rows(captured_at,sku,title,stock) VALUES (?,?,?,?)",
            [("2026-11-16T10:00:00", "old", "Old", 10),
             ("2026-11-17T10:00:00", "current", "Current", 0)],
        )
        conn.execute("INSERT INTO kv_config(key,value) VALUES ('sellerhub_error',?)",
                     ('{"kind":"partial","error":"Traffic page changed"}',))
    return path


def test_latest_capture_preserves_zero_and_unknown(captured_db):
    data = build_mirror(captured_db)
    assert data["metrics"]["home"]["units_today"]["value"] == 0
    assert data["metrics"]["traffic"]["conversion_30d_pct"] == {
        "value": None, "capturedAt": "2026-11-16T10:00:00"
    }
    assert [row["sku"] for row in data["listings"]] == ["current"]
    assert data["listings"][0]["stock"] == 0
    assert data["coverage"]["campaigns"] == {"capturedAt": None, "count": 0}
    assert data["status"]["sellerhub_error"]["kind"] == "partial"
    assert data["keywords"] == []


def test_missing_source_is_not_created(tmp_path):
    path = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        build_mirror(str(path))
    assert not path.exists()


def test_no_org_binding_does_not_publish(monkeypatch):
    monkeypatch.delenv("FLIPKART_ORGANIZATION_ID", raising=False)
    # Avoid the environment loader in this test; only test the publication guard.
    import sys
    from types import SimpleNamespace
    from fkpulse.mirror import sync_mirror
    monkeypatch.setitem(sys.modules, "mongo_sync", SimpleNamespace(_get_collection=lambda: pytest.fail("must not write")))
    assert sync_mirror("does-not-exist.db") is False
