"""Official Snapdeal API connector — activates when you obtain partner/seller
API credentials from Snapdeal (the same API layer aggregators like Unicommerce
use). Until then this stub reports a clear, honest status instead of failing
mysteriously."""
import os, datetime
from .base import Connector

class ApiConnector(Connector):
    name = "api"
    is_demo = False

    def _ready(self):
        if not (os.environ.get("SD_API_KEY") and os.environ.get("SD_API_SECRET")):
            raise RuntimeError(
                "No SD_API_KEY/SD_API_SECRET in .env. Request seller/partner API access "
                "from Snapdeal first; until then use connector=demo, browser, or csv.")
        return True

    def _headers(self):
        return {"Authorization": f"Bearer {os.environ['SD_API_KEY']}"}

    def fetch_listings(self):
        self._ready()
        import httpx
        base = os.environ.get("SD_API_BASE", "https://api.snapdeal.com")
        r = httpx.get(f"{base}/v1/listings", headers=self._headers(), timeout=30)
        r.raise_for_status()
        return r.json().get("listings", [])

    def fetch_metrics(self, days=30):
        self._ready(); import httpx
        base = os.environ.get("SD_API_BASE", "https://api.snapdeal.com")
        r = httpx.get(f"{base}/v1/orders?days={days}", headers=self._headers(), timeout=30)
        r.raise_for_status()
        return r.json().get("orders", [])

    def fetch_scorecard(self):
        self._ready(); import httpx
        base = os.environ.get("SD_API_BASE", "https://api.snapdeal.com")
        r = httpx.get(f"{base}/v1/performance", headers=self._headers(), timeout=30)
        r.raise_for_status()
        d = r.json()
        d.setdefault("day", datetime.date.today().isoformat())
        return d

    def fetch_ads(self, days=30):
        self._ready(); import httpx
        base = os.environ.get("SD_API_BASE", "https://api.snapdeal.com")
        r = httpx.get(f"{base}/v1/ads/report?days={days}", headers=self._headers(), timeout=30)
        r.raise_for_status()
        return r.json().get("campaigns", [])
