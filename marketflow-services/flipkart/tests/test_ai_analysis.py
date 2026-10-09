"""AI strategic analysis: skips cleanly without a key, builds context from real tables, never breaks the digest."""
from fkpulse import ai_analysis as ai
from fkpulse import db
from fkpulse.sellerhub import HUB_SCHEMA


def _fresh(tmp_path):
    p = str(tmp_path / "t.db")
    db.init_db(p)
    conn = db.get_conn(p)
    conn.executescript(HUB_SCHEMA)
    conn.commit()
    return p, conn


def test_skips_cleanly_without_an_api_key(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    path, conn = _fresh(tmp_path)
    conn.execute("INSERT INTO listings(fsn, sku, title, price, mrp, stock, status) VALUES "
                 "('FSN1','SKU1','Curry Leaf Oil',179,399,10,'ACTIVE')")
    conn.commit()
    conn.close()
    assert ai.analyze_and_store(path) == "skipped: ANTHROPIC_API_KEY not set"
    conn = db.get_conn(path)
    assert conn.execute("SELECT COUNT(*) FROM ai_insights").fetchone()[0] == 0


def test_skips_cleanly_with_no_real_data_yet(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    path, conn = _fresh(tmp_path)
    conn.close()
    assert ai.analyze_and_store(path) == "skipped: no real data yet"


def test_build_context_pulls_from_the_real_tables(tmp_path):
    path, conn = _fresh(tmp_path)
    conn.execute("INSERT INTO listings(fsn, sku, title, price, mrp, stock, status) VALUES "
                 "('FSN1','SKU1','Curry Leaf Oil',179,399,10,'ACTIVE')")
    conn.execute("INSERT INTO recommendations(scope, fsn, rule_id, severity, title, detail, status, created_at) "
                 "VALUES ('fsn:FSN1','FSN1','RAT01','high','Rating below floor','4.0 < 4.2','open','2026-09-27')")
    conn.commit()
    ctx = ai.build_context(conn)
    assert ctx["listings"][0]["fsn"] == "FSN1" and ctx["listings"][0]["price"] == 179
    assert len(ctx["open_findings"]) == 1 and ctx["open_findings"][0]["severity"] == "high"


def test_analyze_and_store_calls_claude_and_stores_the_reply(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    path, conn = _fresh(tmp_path)
    conn.execute("INSERT INTO listings(fsn, sku, title, price, mrp, stock, status) VALUES "
                 "('FSN1','SKU1','Curry Leaf Oil',179,399,10,'ACTIVE')")
    conn.commit()
    conn.close()

    class FakeBlock:
        type = "text"
        text = "1. Reprice FSN1 closer to the SERP median."

    class FakeMessage:
        content = [FakeBlock()]

    class FakeMessages:
        def create(self, **kwargs):
            assert kwargs["model"]
            assert "Flipkart" in kwargs["system"]
            return FakeMessage()

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", lambda: FakeClient())
    outcome = ai.analyze_and_store(path)
    assert outcome == "ok"
    conn = db.get_conn(path)
    row = conn.execute("SELECT summary, model FROM ai_insights ORDER BY id DESC LIMIT 1").fetchone()
    assert "SERP median" in row[0] and row[1]


def test_a_failed_api_call_is_reported_not_raised(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-for-test")
    path, conn = _fresh(tmp_path)
    conn.execute("INSERT INTO listings(fsn, sku, title, price, mrp, stock, status) VALUES "
                 "('FSN1','SKU1','Curry Leaf Oil',179,399,10,'ACTIVE')")
    conn.commit()
    conn.close()

    class FakeMessages:
        def create(self, **kwargs):
            raise RuntimeError("rate limited")

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr("anthropic.Anthropic", lambda: FakeClient())
    outcome = ai.analyze_and_store(path)
    assert outcome.startswith("failed:") and "rate limited" in outcome
