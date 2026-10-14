"""AI strategic analysis: skips cleanly without a key, builds context from real tables, never breaks recompute."""
import sqlite3

import pytest

from app import ai_analysis as ai
from app.connectors import panel_reader as pr
from app.database import SCHEMA


@pytest.fixture()
def conn(tmp_path):
    c = sqlite3.connect(str(tmp_path / "t.db"))
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    pr.init_panel_tables(c)
    c.executescript(pr.PRODUCT_SCHEMA)
    c.executescript(pr.PRICING_SCHEMA)
    yield c
    c.close()


def test_skips_cleanly_without_an_api_key(conn, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    pr.store_metrics(conn, "business_overview", {"views": 100}, "2026-09-27T10:00:00")
    conn.commit()
    assert ai.analyze_and_store(conn) == "skipped: ANTHROPIC_API_KEY not set"
    assert conn.execute("SELECT COUNT(*) FROM ai_insights").fetchone()[0] == 0


def test_skips_cleanly_with_no_real_data_yet(conn, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    assert ai.analyze_and_store(conn) == "skipped: no real data yet"


def test_build_context_pulls_from_the_real_tables(conn):
    pr.store_metrics(conn, "business_overview", {"views": 8118, "orders": 8}, "2026-09-27T10:00:00")
    conn.execute("INSERT INTO panel_products VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                 ("507683275", "TREYFA Hibiscus Hair Conditioner", 3.0, 2069, 79, 2, 27.3, 96.7, 247, 0, "2026-09-27T10:00:00"))
    conn.execute("INSERT INTO recommendations(ts, code, priority, title, reason, status) VALUES (?,?,?,?,?,?)",
                 ("2026-09-27T10:00:00", "RATING_STOP", "critical", "Rating below discontinue line", "3.0 stars", "open"))
    conn.commit()
    ctx = ai.build_context(conn)
    assert ctx["account_metrics"]["business_overview"]["views"] == 8118
    assert ctx["products"][0]["product_id"] == "507683275" and ctx["products"][0]["rating"] == 3.0
    assert len(ctx["open_findings"]) == 1 and ctx["open_findings"][0]["priority"] == "critical"


def test_analyze_and_store_calls_claude_and_stores_the_reply(conn, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    pr.store_metrics(conn, "business_overview", {"views": 8118}, "2026-09-27T10:00:00")
    conn.commit()

    class FakeBlock:
        type = "text"
        text = "1. Lower the price on SKU X to match the category median."

    class FakeMessage:
        content = [FakeBlock()]

    class FakeMessages:
        def create(self, **kwargs):
            assert kwargs["model"]
            assert "Meesho" in kwargs["system"]
            return FakeMessage()

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", lambda: FakeClient())
    outcome = ai.analyze_and_store(conn)
    assert outcome == "ok"
    row = conn.execute("SELECT summary, model FROM ai_insights ORDER BY id DESC LIMIT 1").fetchone()
    assert "Lower the price" in row["summary"] and row["model"]


def test_a_failed_api_call_is_reported_not_raised(conn, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    pr.store_metrics(conn, "business_overview", {"views": 1}, "2026-09-27T10:00:00")
    conn.commit()

    class FakeMessages:
        def create(self, **kwargs):
            raise RuntimeError("rate limited")

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", lambda: FakeClient())
    outcome = ai.analyze_and_store(conn)
    assert outcome.startswith("failed:") and "rate limited" in outcome
