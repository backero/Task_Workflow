"""Encrypted credential vault for FK-Pulse.

Stores secrets (OAuth tokens, app credentials) in a JSON file where each value
is a Fernet token. The Fernet key is derived from a master password via
PBKDF2HMAC-SHA256 with a per-vault random salt stored alongside the data.

The master password is NEVER written to disk. Supplying a wrong password
raises :class:`VaultPasswordError` on first access to an existing vault.
"""

from __future__ import annotations

import base64
import json
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

_PBKDF2_ITERATIONS = 390_000
_SALT_BYTES = 16


class VaultPasswordError(Exception):
    """Raised when the master password does not match an existing vault."""


class Vault:
    """Fernet-encrypted key/value store gated by a master password.

    The vault file is JSON: ``{"salt": <base64>, "data": {key: token}}``.
    """

    def __init__(self, vault_file: str, master_password: str):
        """Open (or create on first ``set``) the vault.

        Args:
            vault_file: Path to the encrypted vault JSON file.
            master_password: Master password used to derive the encryption
                key. Never persisted.

        Raises:
            VaultPasswordError: If the vault exists and the password is wrong.
        """
        self._vault_file = vault_file
        self._password = master_password.encode("utf-8")
        self._salt: bytes
        self._data: dict[str, str] = {}

        if os.path.exists(self._vault_file):
            with open(self._vault_file, "r", encoding="utf-8") as fh:
                payload = json.load(fh)
            self._salt = base64.b64decode(payload["salt"])
            self._data = dict(payload.get("data", {}))
            # Verify password against existing data, or by round-tripping a
            # canary so empty vaults also fail fast on a wrong password.
            if self._data:
                probe_key = next(iter(self._data))
                self.get(probe_key)  # raises VaultPasswordError if wrong
            else:
                token = self._fernet().encrypt(b"fkpulse-canary")
                self._fernet().decrypt(token)
        else:
            self._salt = os.urandom(_SALT_BYTES)

    # -- internal helpers ---------------------------------------------------

    def _fernet(self) -> Fernet:
        """Build a Fernet instance from the master password and vault salt."""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=self._salt,
            iterations=_PBKDF2_ITERATIONS,
        )
        key = base64.urlsafe_b64encode(kdf.derive(self._password))
        return Fernet(key)

    def _save(self) -> None:
        """Persist the vault payload to disk (JSON: salt + data)."""
        payload = {
            "salt": base64.b64encode(self._salt).decode("ascii"),
            "data": self._data,
        }
        with open(self._vault_file, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)

    # -- public API ---------------------------------------------------------

    def set(self, key: str, value: str) -> None:
        """Encrypt and store ``value`` under ``key``."""
        token = self._fernet().encrypt(value.encode("utf-8")).decode("ascii")
        self._data[key] = token
        self._save()

    def get(self, key: str) -> Optional[str]:
        """Return the decrypted value for ``key``, or None if absent.

        Raises:
            VaultPasswordError: If the value cannot be decrypted, which means
                the master password is wrong for this vault.
        """
        token = self._data.get(key)
        if token is None:
            return None
        try:
            return self._fernet().decrypt(token.encode("ascii")).decode("utf-8")
        except InvalidToken as exc:
            raise VaultPasswordError(
                "Could not decrypt vault entry: wrong master password "
                "or corrupted vault file."
            ) from exc

    def delete(self, key: str) -> None:
        """Remove ``key`` from the vault (no-op if absent)."""
        if key in self._data:
            del self._data[key]
            self._save()

    def keys(self) -> list[str]:
        """Return the list of stored key names."""
        return list(self._data.keys())
