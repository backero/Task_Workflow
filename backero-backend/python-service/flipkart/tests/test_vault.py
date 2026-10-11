"""Unit tests for fkpulse.vault (Fernet + PBKDF2HMAC credential vault)."""

from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fkpulse.vault import Vault, VaultPasswordError

PASSWORD = "correct horse battery staple"


def test_roundtrip(tmp_path):
    """set/get roundtrip, keys listing, delete, and reopen persistence."""
    vf = str(tmp_path / "vault.enc")
    vault = Vault(vf, PASSWORD)
    assert vault.get("missing") is None
    vault.set("fk_app_id", "app-123")
    vault.set("fk_access_token", "tok-xyz")
    assert vault.get("fk_app_id") == "app-123"
    assert sorted(vault.keys()) == ["fk_access_token", "fk_app_id"]

    # Reopen from disk with the same password.
    vault2 = Vault(vf, PASSWORD)
    assert vault2.get("fk_access_token") == "tok-xyz"

    vault2.delete("fk_app_id")
    assert vault2.get("fk_app_id") is None
    assert vault2.keys() == ["fk_access_token"]


def test_wrong_password_fails(tmp_path):
    """Opening an existing vault with a wrong password raises a clear error."""
    vf = str(tmp_path / "vault.enc")
    Vault(vf, PASSWORD).set("fk_app_secret", "s3cret")
    with pytest.raises(VaultPasswordError):
        Vault(vf, "wrong-password")


def test_master_password_never_persisted(tmp_path):
    """The vault file must never contain the master password."""
    vf = str(tmp_path / "vault.enc")
    Vault(vf, PASSWORD).set("k", "v")
    raw = open(vf, "r", encoding="utf-8").read()
    assert PASSWORD not in raw
    payload = json.loads(raw)
    assert set(payload) == {"salt", "data"}
    assert payload["data"]["k"] != "v"  # stored encrypted


def test_salt_random_per_vault(tmp_path):
    """Two vaults with the same password must use different salts."""
    v1 = str(tmp_path / "a.enc")
    v2 = str(tmp_path / "b.enc")
    Vault(v1, PASSWORD).set("k", "v")
    Vault(v2, PASSWORD).set("k", "v")
    s1 = json.load(open(v1))["salt"]
    s2 = json.load(open(v2))["salt"]
    assert s1 != s2
