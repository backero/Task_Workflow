"""Unit tests for fkpulse.api_client (fixture mode, sync_all, token cache)."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fkpulse.api_client import (
    TOKEN_VAULT_KEY,
    FixtureDataMissingError,
    FlipkartSellerClient,
    sync_all,
)
from fkpulse.vault import Vault

FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures"
)


@pytest.fixture()
def cfg() -> dict:
    return {"mode": "fixture", "fixture_dir": FIXTURE_DIR}


def test_fixture_listings(cfg):
    rows = FlipkartSellerClient(cfg).get_listings()
    assert len(rows) == 12
    for row in rows:
        assert row["fsn"] and row["sku"] and row["title"]
        assert isinstance(json.loads(row["attributes_json"]), dict)
        assert row["attributes_total"] == 12


def test_fixture_orders_window(cfg):
    client = FlipkartSellerClient(cfg)
    orders = client.get_orders(since_days=60)
    assert 350 <= len(orders) <= 450  # ~400 rows / 60d
    narrow = client.get_orders(since_days=7)
    assert 0 < len(narrow) < len(orders)
    for row in orders:
        assert row["order_id"] and row["fsn"]
        assert row["payment_type"] in ("COD", "PREPAID")
        assert row["cancelled"] in (0, 1)


def test_fixture_returns_settlements_inventory(cfg):
    client = FlipkartSellerClient(cfg)
    returns = client.get_returns()
    assert returns and all(r["type"] in ("CUSTOMER", "COURIER_RTO") for r in returns)
    settlements = client.get_settlements()
    assert settlements and all(
        json.loads(s["fees_json"]) for s in settlements
    )
    inventory = client.get_inventory()
    assert len(inventory) == 12
    assert all(set(row) == {"fsn", "sku", "stock"} for row in inventory)


def test_missing_fields_map_to_none(cfg):
    row = FlipkartSellerClient._normalize(
        {"fsn": "X", "sku": "Y"}, ("fsn", "sku", "price", "stock")
    )
    assert row == {"fsn": "X", "sku": "Y", "price": None, "stock": None}


def test_missing_fixture_file_raises(tmp_path):
    client = FlipkartSellerClient(
        {"mode": "fixture", "fixture_dir": str(tmp_path)}
    )
    with pytest.raises(FixtureDataMissingError):
        client.get_listings()


def test_sync_all_upserts(cfg, tmp_path):
    db_path = str(tmp_path / "test.db")
    client = FlipkartSellerClient(cfg)
    counts = sync_all(client, db_path)
    assert counts["listings"] == 12
    assert counts["inventory"] == 12

    conn = sqlite3.connect(db_path)
    try:
        n_listings = conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0]
        n_orders = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        n_returns = conn.execute("SELECT COUNT(*) FROM returns").fetchone()[0]
        n_settl = conn.execute("SELECT COUNT(*) FROM settlements").fetchone()[0]
        last_sync = conn.execute(
            "SELECT value FROM kv_config WHERE key='last_sync'"
        ).fetchone()
        hero_stock = conn.execute(
            "SELECT stock FROM listings WHERE sku='NS10-30'"
        ).fetchone()[0]
    finally:
        conn.close()
    assert n_listings == 12
    assert n_orders == counts["orders"] > 0
    assert n_returns == counts["returns"] > 0
    assert n_settl == counts["settlements"] > 0
    assert last_sync and last_sync[0]
    assert hero_stock > 0  # inventory upsert landed on listings.stock

    # Second sync must not duplicate returns/settlements.
    counts2 = sync_all(client, db_path)
    assert counts2["returns"] == 0
    assert counts2["settlements"] == 0


def test_access_token_cached_in_vault(tmp_path):
    """Live-mode token is fetched once and cached in the vault."""
    vault = Vault(str(tmp_path / "vault.enc"), "pw")
    vault.set("fk_app_id", "id")
    vault.set("fk_app_secret", "secret")
    client = FlipkartSellerClient({"mode": "live"}, vault=vault)

    with mock.patch.object(
        client, "_refresh_token", return_value="tok-1"
    ) as refresh:
        assert client._access_token() == "tok-1"
        # Simulate the refresh writing the cache (as the real method does).
        vault.set(TOKEN_VAULT_KEY, json.dumps(
            {"access_token": "tok-1", "expires_at": 9e18}))
        assert client._access_token() == "tok-1"
        assert refresh.call_count == 1  # second call served from cache


def test_live_mode_requires_credentials(tmp_path):
    from fkpulse.api_client import LiveModeCredentialsError

    vault = Vault(str(tmp_path / "vault.enc"), "pw")
    client = FlipkartSellerClient({"mode": "live"}, vault=vault)
    with pytest.raises(LiveModeCredentialsError):
        client._access_token()
