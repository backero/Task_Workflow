"""fkpulse/api.py: the read-only API the unified cross-platform dashboard consumes. Checks it reads the real
schema correctly against a throwaway database, not that it duplicates business logic already tested elsewhere."""
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from fkpulse import api, db
from fkpulse.sellerhub import HUB_SCHEMA


@pytest.fixture()
def client(tmp_path, monkeypatch):
    path = tmp_path / "t.db"
    db.init_db(str(path))
    conn = sqlite3.connect(str(path))
    conn.executescript(HUB_SCHEMA)
    conn.executescript("CREATE TABLE IF NOT EXISTS ai_insights(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, "
                       "summary TEXT NOT NULL, model TEXT, based_on TEXT)")
    conn.execute("INSERT INTO listings(fsn, sku, title, price, mrp, stock, status, rating_avg, rating_count) "
                "VALUES ('FSN1','SKU1','Curry Leaf Oil',179,399,10,'ACTIVE',4.2,50)")
    conn.execute("INSERT INTO recommendations(scope, fsn, rule_id, severity, title, detail, status, created_at) "
                "VALUES ('fsn:FSN1','FSN1','RAT01','high','Rating below floor','4.0 < 4.2','open','2026-09-27')")
    conn.execute("INSERT INTO ai_insights(ts, summary, model) VALUES ('2026-09-27T10:00:00','Reprice FSN1.','claude-haiku')")
    conn.execute("INSERT INTO kv_config(key, value) VALUES ('robot_state', ?)", (json.dumps({"state": "healthy", "message": "ok"}),))
    conn.commit()
    conn.close()
    monkeypatch.setattr(api, "DB_PATH", path)
    return TestClient(api.app)


def test_overview_reads_real_listings_and_findings(client):
    r = client.get("/api/overview").json()
    assert r["listings"] == 1 and r["active"] == 1 and r["avg_rating"] == 4.2
    assert r["open_recommendations"] == {"high": 1}


def test_listings_include_hub_snapshot_when_present(client):
    rows = client.get("/api/listings").json()
    assert rows[0]["fsn"] == "FSN1" and rows[0]["hub"] is None  # no hub_listing_rows inserted in this fixture


def test_recommendations_filters_by_status(client):
    assert len(client.get("/api/recommendations", params={"status": "open"}).json()) == 1
    assert len(client.get("/api/recommendations", params={"status": "resolved"}).json()) == 0


def test_ai_insights_returns_the_real_summary(client):
    rows = client.get("/api/ai_insights").json()
    assert rows[0]["summary"] == "Reprice FSN1."


def test_robot_returns_the_published_state(client):
    assert client.get("/api/robot").json() == {"state": "healthy", "message": "ok"}


def test_robot_with_no_state_yet_is_silent_not_an_error(tmp_path, monkeypatch):
    path = tmp_path / "empty.db"
    db.init_db(str(path))
    monkeypatch.setattr(api, "DB_PATH", path)
    c = TestClient(api.app)
    assert c.get("/api/robot").json()["state"] == "silent"
