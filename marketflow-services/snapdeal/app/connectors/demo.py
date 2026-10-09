"""Demo connector — realistic simulated Snapdeal data so the whole dashboard
is provable before any credential exists. Every value here is SYNTHETIC and
the UI labels it DEMO. Deterministic per day so trends are stable."""
import random, datetime
from .base import Connector

CATALOG = [
    ("SD-KUR-001", "Aarna Fab Men Solid Cotton Kurta Blue", "Aarna Fab", "Men > Kurtas", 449, 999, 38, 4.2, 214, "Dropship", 1, 9, 12),
    ("SD-KUR-002", "Aarna Fab Men Printed Cotton Kurta Maroon", "Aarna Fab", "Men > Kurtas", 399, 899, 0, 3.6, 12, "Dropship", 0, 5, 12),
    ("SD-SHO-014", "Walklite Men Casual Sneakers White", "Walklite", "Footwear > Casual", 699, 1599, 52, 4.4, 640, "SD Plus", 1, 11, 12),
    ("SD-SHO-021", "Walklite Men Running Shoes Black", "Walklite", "Footwear > Sports", 899, 2199, 21, 4.1, 88, "Dropship", 1, 8, 12),
    ("SD-SAR-007", "ShreeVastra Women Cotton Saree Teal", "ShreeVastra", "Women > Sarees", 549, 1299, 64, 4.5, 1204, "SD Plus", 1, 10, 12),
    ("SD-SAR-009", "ShreeVastra Women Silk Blend Saree Pink", "ShreeVastra", "Women > Sarees", 749, 1799, 12, 3.9, 41, "Dropship", 1, 7, 12),
    ("SD-HOM-033", "CasaDecor Cotton Cushion Covers Set of 5", "CasaDecor", "Home > Furnishing", 329, 799, 140, 4.3, 467, "Dropship", 1, 12, 12),
    ("SD-HOM-041", "CasaDecor Double Bedsheet Cotton 144TC", "CasaDecor", "Home > Bedding", 499, 1199, 77, 4.0, 55, "Dropship", 0, 6, 12),
]

class DemoConnector(Connector):
    name = "demo"
    is_demo = True

    def _rng(self, salt=""):
        d = datetime.date.today().isoformat()
        return random.Random(hash(d + salt) & 0xffffffff)

    def fetch_listings(self):
        out = []
        for sku, t, b, c, p, m, st, r, rv, f, img, af, at in CATALOG:
            out.append(dict(sku=sku, title=t, brand=b, category=c, price=p, mrp=m,
                            stock=st, status="live" if st > 0 else "out_of_stock",
                            rating=r, reviews=rv, fulfilment=f, image_ok=img,
                            attrs_filled=af, attrs_total=at,
                            created="2023-04-11", updated=datetime.date.today().isoformat()))
        return out

    def fetch_metrics(self, days=30):
        rows = []
        base_imp = {"SD-KUR-001": 1400, "SD-KUR-002": 260, "SD-SHO-014": 2200,
                    "SD-SHO-021": 900, "SD-SAR-007": 3100, "SD-SAR-009": 620,
                    "SD-HOM-033": 1800, "SD-HOM-041": 750}
        for sku, *_ in CATALOG:
            for i in range(days):
                day = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
                rng = random.Random(hash(day + sku) & 0xffffffff)
                imp = int(base_imp[sku] * rng.uniform(0.75, 1.25))
                # SD-KUR-002 is decaying (velocity stall scenario); SD-SAR-007 rising
                if sku == "SD-KUR-002": imp = int(imp * max(0.15, 1 - i * 0.05))
                if sku == "SD-SAR-007": imp = int(imp * (1 + (days - i) * 0.01))
                clicks = int(imp * rng.uniform(0.008, 0.03))
                orders = int(clicks * rng.uniform(0.06, 0.16))
                cancel = 1 if rng.random() < 0.012 and orders > 0 else 0
                dto = 1 if rng.random() < (0.06 if sku == "SD-SAR-009" else 0.02) and orders > 0 else 0
                rto = 1 if rng.random() < 0.04 and orders > 0 else 0
                price = next(x[4] for x in CATALOG if x[0] == sku)
                rows.append(dict(sku=sku, day=day, impressions=imp, clicks=clicks,
                                 orders=orders, cancellations=cancel, dto=dto, rto=rto,
                                 revenue=round(orders * price, 2)))
        return rows

    def fetch_scorecard(self):
        rng = self._rng("score")
        return dict(day=datetime.date.today().isoformat(),
                    cancellation_pct=round(rng.uniform(0.6, 1.6), 2),   # flirts with 1% line
                    ontime_pct=round(rng.uniform(96.2, 99.1), 1),
                    rating=round(rng.uniform(3.9, 4.4), 1),
                    dto_pct=round(rng.uniform(3.5, 7.5), 1),
                    rto_pct=round(rng.uniform(2.0, 4.5), 1),
                    dispatched_24h_pct=round(rng.uniform(88, 97), 1))

    def fetch_ads(self, days=30):
        rows = []
        camps = [("Kurta-Search-Q4", "SD-KUR-001"), ("Saree-Festive-Push", "SD-SAR-007"),
                 ("Sneakers-AlwaysOn", "SD-SHO-014")]
        for camp, sku in camps:
            for i in range(days):
                day = (datetime.date.today() - datetime.timedelta(days=i)).isoformat()
                rng = random.Random(hash(day + camp) & 0xffffffff)
                imp = int(3000 * rng.uniform(0.7, 1.4))
                clicks = int(imp * rng.uniform(0.01, 0.035))
                spend = round(clicks * rng.uniform(2.2, 4.8), 2)
                orders = int(clicks * rng.uniform(0.05, 0.14))
                price = {"SD-KUR-001": 449, "SD-SAR-007": 549, "SD-SHO-014": 699}[sku]
                rows.append(dict(campaign=camp, sku=sku, day=day, spend=spend,
                                 impressions=imp, clicks=clicks, orders=orders,
                                 revenue=round(orders * price, 2)))
        return rows
