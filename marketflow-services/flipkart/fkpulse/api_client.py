"""Flipkart Seller API client for FK-Pulse (fixture + live modes).

Fixture mode reads ``fixtures/*.json`` so the whole app runs offline without
credentials. Live mode talks to the Flipkart Seller API v3.0 public pattern
(base ``https://api.flipkart.net/sellers``) using OAuth2 client-credentials,
caching the access token in the encrypted vault under ``fk_access_token``.

Field-mapping policy: only fields actually present in a response/fixture are
mapped; anything missing maps to ``None``. Fields are never fabricated.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import time
from typing import Any, Optional

import requests
from requests.auth import HTTPBasicAuth
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .db import get_conn, init_db
from .vault import Vault

LIVE_BASE_URL = "https://api.flipkart.net/sellers"
OAUTH_TOKEN_URL = "https://api.flipkart.net/oauth-service/oauth/token"
TOKEN_VAULT_KEY = "fk_access_token"

# Listing columns, in listings-table order.
_LISTING_FIELDS = (
    "fsn", "sku", "title", "brand", "category", "price", "mrp", "stock",
    "status", "attributes_json", "attributes_total", "image_count",
    "rating_avg", "rating_count", "review_count", "listed_date", "updated_at",
)
_ORDER_FIELDS = (
    "order_id", "fsn", "sku", "qty", "price", "order_date", "status",
    "cancelled", "rtd_breach", "rto", "pincode", "payment_type",
)
_RETURN_FIELDS = ("order_id", "fsn", "type", "reason", "return_date")
_SETTLEMENT_FIELDS = (
    "order_id", "amount", "fees_json", "order_date", "settled_date",
)


class FixtureDataMissingError(FileNotFoundError):
    """Raised when fixture mode cannot find a required fixtures/*.json file."""


class LiveModeCredentialsError(RuntimeError):
    """Raised when live mode lacks the required vault credentials."""


def _parse_date(value: Any) -> Optional[dt.date]:
    """Parse an ISO date/datetime string into a date, or None."""
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return dt.date.fromisoformat(str(value)[:10])
        except ValueError:
            return None


class FlipkartSellerClient:
    """Client for Flipkart seller data with fixture and live modes.

    Args:
        config: Loaded FK-Pulse config dict (see config.example.yaml).
        vault: Optional Vault for live-mode credentials/token cache. Required
            for ``mode=live``.
    """

    def __init__(self, config: dict, vault: Optional[Vault] = None):
        self.config = config
        self.vault = vault
        self.mode = config.get("mode", "fixture")
        self.fixture_dir = config.get("fixture_dir", "fixtures")
        self.base_url = config.get("live_base_url", LIVE_BASE_URL)
        self._session: Optional[requests.Session] = None

    # -- public data methods -------------------------------------------------

    def get_listings(self) -> list[dict]:
        """Return listings with fields matching the listings table."""
        if self.mode == "fixture":
            return [self._normalize(row, _LISTING_FIELDS)
                    for row in self._load_fixture("listings.json")]
        rows = []
        for item in self._paginated_get("/v2/listings", params={"status": "ACTIVE"}):
            rows.append(self._map_live_listing(item))
        return rows

    def get_orders(self, since_days: int = 60) -> list[dict]:
        """Return orders from the last ``since_days`` days."""
        if self.mode == "fixture":
            rows = [self._normalize(row, _ORDER_FIELDS)
                    for row in self._load_fixture("orders.json")]
            return self._filter_window(rows, "order_date", since_days)
        date_from = (dt.date.today() - dt.timedelta(days=since_days)).isoformat()
        rows = []
        for item in self._paginated_get(
            "/v2/orders", params={"searchDate": date_from, "orderState": "ALL"}
        ):
            rows.append(self._map_live_order(item))
        return rows

    def get_returns(self, since_days: int = 60) -> list[dict]:
        """Return customer/courier returns from the last ``since_days`` days."""
        if self.mode == "fixture":
            rows = [self._normalize(row, _RETURN_FIELDS)
                    for row in self._load_fixture("returns.json")]
            return self._filter_window(rows, "return_date", since_days)
        rows = []
        for item in self._paginated_get(
            "/v2/returns", params={"source": "courier_return,customer_return"}
        ):
            rows.append(self._map_live_return(item))
        return rows

    def get_settlements(self, since_days: int = 60) -> list[dict]:
        """Return settlements from the last ``since_days`` days."""
        if self.mode == "fixture":
            rows = [self._normalize(row, _SETTLEMENT_FIELDS)
                    for row in self._load_fixture("settlements.json")]
            return self._filter_window(rows, "settled_date", since_days)
        date_from = (dt.date.today() - dt.timedelta(days=since_days)).isoformat()
        rows = []
        for item in self._paginated_get(
            "/v2/settlements", params={"settledDateFrom": date_from}
        ):
            rows.append(self._map_live_settlement(item))
        return rows

    def get_inventory(self) -> list[dict]:
        """Return inventory rows as ``[{fsn, sku, stock}, ...]``."""
        if self.mode == "fixture":
            rows = self._load_fixture("inventory.json")
            return [
                {
                    "fsn": row.get("fsn"),
                    "sku": row.get("sku"),
                    "stock": row.get("stock"),
                }
                for row in rows
            ]
        rows = []
        for item in self._paginated_get("/v2/listings", params={"status": "ACTIVE"}):
            rows.append({
                "fsn": item.get("fsn"),
                "sku": item.get("sku"),
                "stock": (item.get("stockCount")
                          if item.get("stockCount") is not None
                          else item.get("stock")),
            })
        return rows

    # -- fixture helpers -----------------------------------------------------

    def _load_fixture(self, filename: str) -> list[dict]:
        """Load a fixture JSON file; raise a clear error if it is missing."""
        path = os.path.join(self.fixture_dir, filename)
        if not os.path.exists(path):
            raise FixtureDataMissingError(
                f"Fixture file not found: {path}. "
                f"Run from the project root or set fixture_dir in config.yaml."
            )
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            raise FixtureDataMissingError(
                f"Fixture file {path} must contain a JSON list."
            )
        return data

    @staticmethod
    def _normalize(row: dict, fields: tuple[str, ...]) -> dict:
        """Keep only known fields; missing fields become None (never faked)."""
        return {field: row.get(field) for field in fields}

    @staticmethod
    def _filter_window(rows: list[dict], date_field: str,
                       since_days: int) -> list[dict]:
        """Keep rows within ``since_days`` of the newest row's date.

        Windowing is anchored on the latest date present in the data (not on
        wall-clock time) so fixture behavior stays deterministic.
        """
        dates = [d for d in (_parse_date(r.get(date_field)) for r in rows)
                 if d is not None]
        if not dates:
            return rows
        anchor = max(dates)
        cutoff = anchor - dt.timedelta(days=since_days)
        out = []
        for row in rows:
            row_date = _parse_date(row.get(date_field))
            if row_date is None or row_date >= cutoff:
                out.append(row)
        return out

    # -- live mode: OAuth2 client-credentials + session ----------------------

    def _get_session(self) -> requests.Session:
        """Return an authenticated requests.Session (token auto-refreshed)."""
        if self.vault is None:
            raise LiveModeCredentialsError(
                "Live mode requires a Vault for credentials and token cache."
            )
        if self._session is None:
            self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {self._access_token()}",
            "Content-Type": "application/json",
        })
        return self._session

    def _access_token(self) -> str:
        """Return a valid access token, refreshing via OAuth2 if needed."""
        assert self.vault is not None
        cached = self.vault.get(TOKEN_VAULT_KEY)
        if cached:
            try:
                payload = json.loads(cached)
                token = payload.get("access_token")
                expires_at = float(payload.get("expires_at", 0))
                if token and time.time() < expires_at - 60:
                    return token
            except (ValueError, TypeError):
                # Legacy: raw token string cached without expiry.
                return cached

        app_id = self.vault.get("fk_app_id")
        app_secret = self.vault.get("fk_app_secret")
        if not app_id or not app_secret:
            raise LiveModeCredentialsError(
                "Live mode requires fk_app_id and fk_app_secret in the vault "
                "(obtain them from Flipkart Seller Hub > API credentials)."
            )
        return self._refresh_token(app_id, app_secret)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(requests.RequestException),
        reraise=True,
    )
    def _refresh_token(self, app_id: str, app_secret: str) -> str:
        """Request a new OAuth2 client-credentials token and cache it."""
        resp = requests.post(
            OAUTH_TOKEN_URL,
            params={"grant_type": "client_credentials", "scope": "Seller_Api"},
            auth=HTTPBasicAuth(app_id, app_secret),
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        token = body.get("access_token")
        if not token:
            raise LiveModeCredentialsError(
                "OAuth2 token response did not contain access_token."
            )
        expires_in = float(body.get("expires_in", 3600))
        assert self.vault is not None
        self.vault.set(TOKEN_VAULT_KEY, json.dumps({
            "access_token": token,
            "expires_at": time.time() + expires_in,
        }))
        return token

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(requests.RequestException),
        reraise=True,
    )
    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        """GET a live API path with tenacity retry (3x, exp backoff)."""
        session = self._get_session()
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        resp = session.get(url, params=params, timeout=30)
        if resp.status_code in (401, 403):
            # Token may have been revoked mid-session; refresh once.
            assert self.vault is not None
            self.vault.delete(TOKEN_VAULT_KEY)
            session = self._get_session()
            resp = session.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _paginated_get(self, path: str, params: Optional[dict] = None) -> list[dict]:
        """Follow hasMore/nextUrl pagination and return the item list."""
        items: list[dict] = []
        next_path: Optional[str] = path
        next_params = params
        while next_path:
            body = self._get(next_path, params=next_params)
            for key in ("items", "shipments", "orderItems", "listings",
                        "returns", "settlements"):
                if isinstance(body.get(key), list):
                    items.extend(body[key])
                    break
            next_path = body.get("nextUrl") if body.get("hasMore") else None
            next_params = None
        return items

    # -- live mode: field mapping (only observed fields; missing -> None) ----

    @staticmethod
    def _map_live_listing(item: dict) -> dict:
        attrs = item.get("attributeValues") or item.get("attributes")
        return {
            "fsn": item.get("fsn"),
            "sku": item.get("sku") or item.get("skuId"),
            "title": item.get("title"),
            "brand": item.get("brand"),
            "category": item.get("category"),
            "price": item.get("price"),
            "mrp": item.get("mrp"),
            "stock": item.get("stockCount")
                     if item.get("stockCount") is not None
                     else item.get("stock"),
            "status": item.get("status"),
            "attributes_json": json.dumps(attrs) if attrs is not None else None,
            "attributes_total": item.get("attributesTotal"),
            "image_count": item.get("imageCount"),
            "rating_avg": item.get("ratingAvg"),
            "rating_count": item.get("ratingCount"),
            "review_count": item.get("reviewCount"),
            "listed_date": item.get("listedDate"),
            "updated_at": item.get("updatedAt"),
        }

    @staticmethod
    def _map_live_order(item: dict) -> dict:
        status = item.get("status") or item.get("orderState")
        return {
            "order_id": item.get("orderId") or item.get("order_id"),
            "fsn": item.get("fsn"),
            "sku": item.get("sku"),
            "qty": item.get("quantity") or item.get("qty"),
            "price": item.get("price"),
            "order_date": item.get("orderDate") or item.get("order_date"),
            "status": status,
            "cancelled": 1 if status == "CANCELLED" else 0 if status else None,
            "rtd_breach": item.get("rtdBreach"),
            "rto": item.get("rto"),
            "pincode": item.get("pincode") or item.get("pinCode"),
            "payment_type": item.get("paymentType"),
        }

    @staticmethod
    def _map_live_return(item: dict) -> dict:
        return {
            "order_id": item.get("orderId") or item.get("order_id"),
            "fsn": item.get("fsn"),
            "type": item.get("type") or item.get("returnType"),
            "reason": item.get("reason"),
            "return_date": item.get("returnDate") or item.get("return_date"),
        }

    @staticmethod
    def _map_live_settlement(item: dict) -> dict:
        fees = item.get("fees")
        return {
            "order_id": item.get("orderId") or item.get("order_id"),
            "amount": item.get("amount"),
            "fees_json": json.dumps(fees) if fees is not None else None,
            "order_date": item.get("orderDate") or item.get("order_date"),
            "settled_date": item.get("settledDate") or item.get("settled_date"),
        }


def sync_all(client: FlipkartSellerClient, db_path: str) -> dict[str, int]:
    """Upsert listings/orders/returns/settlements/inventory into the DB.

    Args:
        client: A configured FlipkartSellerClient (fixture or live mode).
        db_path: Path to the SQLite database file.

    Returns:
        Dict with row counts written per entity.
    """
    init_db(db_path)
    conn = get_conn(db_path)
    counts: dict[str, int] = {}
    try:
        listings = client.get_listings()
        for row in listings:
            conn.execute(
                """INSERT OR REPLACE INTO listings(
                    fsn, sku, title, brand, category, price, mrp, stock,
                    status, attributes_json, attributes_total, image_count,
                    rating_avg, rating_count, review_count, listed_date,
                    updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                tuple(row.get(f) for f in _LISTING_FIELDS),
            )
        counts["listings"] = len(listings)

        orders = client.get_orders()
        for row in orders:
            conn.execute(
                """INSERT OR REPLACE INTO orders(
                    order_id, fsn, sku, qty, price, order_date, status,
                    cancelled, rtd_breach, rto, pincode, payment_type)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                tuple(row.get(f) for f in _ORDER_FIELDS),
            )
        counts["orders"] = len(orders)

        returns = client.get_returns()
        written = 0
        for row in returns:
            cur = conn.execute(
                "SELECT id FROM returns WHERE order_id=? AND type=? AND fsn IS ?",
                (row.get("order_id"), row.get("type"), row.get("fsn")),
            )
            if cur.fetchone() is None:
                conn.execute(
                    """INSERT INTO returns(order_id, fsn, type, reason,
                                           return_date)
                    VALUES (?,?,?,?,?)""",
                    tuple(row.get(f) for f in _RETURN_FIELDS),
                )
                written += 1
        counts["returns"] = written

        settlements = client.get_settlements()
        written = 0
        for row in settlements:
            cur = conn.execute(
                "SELECT id FROM settlements WHERE order_id=?",
                (row.get("order_id"),),
            )
            if cur.fetchone() is None:
                conn.execute(
                    """INSERT INTO settlements(order_id, amount, fees_json,
                                               order_date, settled_date)
                    VALUES (?,?,?,?,?)""",
                    tuple(row.get(f) for f in _SETTLEMENT_FIELDS),
                )
                written += 1
        counts["settlements"] = written

        inventory = client.get_inventory()
        for row in inventory:
            conn.execute(
                "UPDATE listings SET stock=? WHERE fsn=?",
                (row.get("stock"), row.get("fsn")),
            )
        counts["inventory"] = len(inventory)

        conn.execute(
            "INSERT OR REPLACE INTO kv_config(key, value) VALUES('last_sync', ?)",
            (dt.datetime.now().isoformat(timespec="seconds"),),
        )
        conn.commit()
    finally:
        conn.close()
    return counts
