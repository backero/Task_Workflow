"""AI strategic analysis: skips cleanly without a key, builds context from real tables, never breaks the sync."""
import pytest

from app import ai_analysis as ai
from app import database as db


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB", str(tmp_path / "t.db"))
    db.init()
    yield


def test_skips_cleanly_without_an_api_key(fresh_db, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    db.upsert_listings([dict(sku="TRCFW-1", title="Face Wash", price=179, mrp=399, stock=10, status="live",
                             rating=0, reviews=0, fulfilment="Dropship", image_ok=1, attrs_filled=10, attrs_total=10)])
    assert ai.analyze_and_store() == "skipped: ANTHROPIC_API_KEY not set"
    assert db.q("SELECT COUNT(*) c FROM ai_insights")[0]["c"] == 0


def test_skips_cleanly_with_no_real_data_yet(fresh_db, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    assert ai.analyze_and_store() == "skipped: no real data yet"


def test_build_context_pulls_from_the_real_tables(fresh_db):
    db.upsert_listings([dict(sku="TRCFW-1", title="Face Wash", price=179, mrp=399, stock=10, status="live",
                             rating=0, reviews=0, fulfilment="Dropship", image_ok=1, attrs_filled=10, attrs_total=10)])
    with db.conn() as c:
        c.execute("INSERT INTO alerts(ts, severity, module, entity, code, title, reason, status) VALUES "
                  "('2026-09-27T10:00:00','critical','Listing Audit','TRCFW-1','DUPLICATE_TITLE','Same title','x','open')")
    ctx = ai.build_context()
    assert ctx["listings"][0]["sku"] == "TRCFW-1" and ctx["listings"][0]["price"] == 179
    assert len(ctx["open_alerts"]) == 1 and ctx["open_alerts"][0]["severity"] == "critical"


def test_analyze_and_store_calls_claude_and_stores_the_reply(fresh_db, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    db.upsert_listings([dict(sku="TRCFW-1", title="Face Wash", price=179, mrp=399, stock=10, status="live",
                             rating=0, reviews=0, fulfilment="Dropship", image_ok=1, attrs_filled=10, attrs_total=10)])

    class FakeBlock:
        type = "text"
        text = "1. Drop price on TRCFW-1 to match the 40-60% discount band."

    class FakeMessage:
        content = [FakeBlock()]

    class FakeMessages:
        def create(self, **kwargs):
            assert kwargs["model"]
            assert "Snapdeal" in kwargs["system"]
            return FakeMessage()

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", lambda: FakeClient())
    outcome = ai.analyze_and_store()
    assert outcome == "ok"
    row = db.q("SELECT summary, model FROM ai_insights ORDER BY id DESC LIMIT 1")[0]
    assert "discount band" in row["summary"] and row["model"]


def test_a_failed_api_call_is_reported_not_raised(fresh_db, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    db.upsert_listings([dict(sku="TRCFW-1", title="Face Wash", price=179, mrp=399, stock=10, status="live",
                             rating=0, reviews=0, fulfilment="Dropship", image_ok=1, attrs_filled=10, attrs_total=10)])

    class FakeMessages:
        def create(self, **kwargs):
            raise RuntimeError("rate limited")

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", lambda: FakeClient())
    outcome = ai.analyze_and_store()
    assert outcome.startswith("failed:") and "rate limited" in outcome
