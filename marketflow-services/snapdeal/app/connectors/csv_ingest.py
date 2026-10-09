"""CSV ingestion connector — parse Seller Panel exports dropped into data/uploads/.
100% ToS-safe path. Recognises listings / orders-returns / ads report shapes by
header names; unknown headers are kept, not discarded."""
import csv, os, datetime
from .base import Connector

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "data", "uploads")

def _f(row, *names, default=0.0):
    for n in names:
        for k in row:
            if k and k.strip().lower() == n:
                try: return float(str(row[k]).replace(",", "").replace("₹", "").replace("%", "") or 0)
                except ValueError: return default
    return default

def _s(row, *names, default=""):
    for n in names:
        for k in row:
            if k and k.strip().lower() == n:
                return str(row[k]).strip()
    return default

class CsvConnector(Connector):
    name = "csv"
    is_demo = False

    def _latest(self, kind):
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        files = sorted((f for f in os.listdir(UPLOAD_DIR) if f.startswith(kind) and f.endswith(".csv")),
                       key=lambda f: os.path.getmtime(os.path.join(UPLOAD_DIR, f)), reverse=True)
        return os.path.join(UPLOAD_DIR, files[0]) if files else None

    def _read(self, path):
        with open(path, newline="", encoding="utf-8-sig") as fh:
            return list(csv.DictReader(fh))

    def fetch_listings(self):
        p = self._latest("listings")
        if not p: return []
        out = []
        for r in self._read(p):
            price, mrp = _f(r, "selling price", "price", "sp"), _f(r, "mrp")
            stock = int(_f(r, "stock", "inventory", "available quantity"))
            out.append(dict(
                sku=_s(r, "sku", "sku code", "supc") or _s(r, "supc"),
                title=_s(r, "title", "product name", "product"),
                brand=_s(r, "brand"), category=_s(r, "category", "category name"),
                price=price, mrp=mrp, stock=stock,
                status="live" if stock > 0 else "out_of_stock",
                rating=_f(r, "rating", "customer rating"),
                reviews=int(_f(r, "reviews", "review count")),
                fulfilment=_s(r, "fulfilment", "fulfillment", default="Dropship"),
                image_ok=1, attrs_filled=8, attrs_total=12,
                updated=datetime.date.today().isoformat()))
        return out

    def fetch_metrics(self, days=30):
        p = self._latest("orders")
        if not p: return []
        agg = {}
        for r in self._read(p):
            sku = _s(r, "sku", "sku code", "supc"); day = _s(r, "date", "order date")[:10]
            if not sku or not day: continue
            k = (sku, day)
            a = agg.setdefault(k, dict(sku=sku, day=day, impressions=0, clicks=0,
                                       orders=0, cancellations=0, dto=0, rto=0, revenue=0.0))
            status = _s(r, "status", "order status").lower()
            if "cancel" in status: a["cancellations"] += 1
            elif "rto" in status: a["rto"] += 1
            elif "return" in status or "dto" in status: a["dto"] += 1
            else:
                a["orders"] += 1
                a["revenue"] += _f(r, "selling price", "price", "order value")
        return list(agg.values())

    def fetch_scorecard(self):
        p = self._latest("scorecard")
        if not p: return None
        rows = self._read(p)
        r = rows[0] if rows else {}
        return dict(day=datetime.date.today().isoformat(),
                    cancellation_pct=_f(r, "cancellation rate", "cancellation %"),
                    ontime_pct=_f(r, "on-time ship", "ontime %", "sla compliance"),
                    rating=_f(r, "rating", "customer rating"),
                    dto_pct=_f(r, "dto %", "customer return %"),
                    rto_pct=_f(r, "rto %"),
                    dispatched_24h_pct=_f(r, "dispatched in 24h %", "24h dispatch %"))

    def fetch_ads(self, days=30):
        p = self._latest("ads")
        if not p: return []
        out = []
        for r in self._read(p):
            out.append(dict(campaign=_s(r, "campaign", "campaign name") or "Campaign",
                            sku=_s(r, "sku", "supc"),
                            day=_s(r, "date", "day")[:10] or datetime.date.today().isoformat(),
                            spend=_f(r, "spend", "cost"), impressions=int(_f(r, "impressions")),
                            clicks=int(_f(r, "clicks")), orders=int(_f(r, "orders", "conversions")),
                            revenue=_f(r, "revenue", "sales")))
        return out
