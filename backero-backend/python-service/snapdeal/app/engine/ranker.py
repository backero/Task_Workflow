"""Rank tracker — queries Snapdeal's PUBLIC search pages (no login needed)
and records where your SKUs appear for your tracked keywords."""
import os, datetime, re
import httpx
from .. import database as db

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

def keywords():
    ks = db.get_setting("track_keywords") or os.environ.get("SD_TRACK_KEYWORDS", "")
    return [k.strip() for k in ks.split(",") if k.strip()]

def track_once():
    """One pass over all tracked keywords. Returns (checked, found, note)."""
    listings = db.q("SELECT sku, title, brand FROM listings")
    if not listings: return 0, 0, "no listings in DB"
    brand = (db.get_setting("seller_brand") or os.environ.get("SD_SELLER_BRAND", "") or
             next((l["brand"] for l in listings if l["brand"]), "")).lower()
    found, checked = 0, 0
    rows_out = []
    for kw in keywords():
        checked += 1
        try:
            r = httpx.get("https://www.snapdeal.com/search",
                          params={"keyword": kw, "sort": "plrty", "start": 0},
                          headers={"User-Agent": UA}, timeout=25, follow_redirects=True)
            html = r.text
        except Exception as e:
            db.log_sync("ranker", "failed", f"{kw}: {e}")
            continue
        # product tiles carry data-pogid / product-title markup; match by brand or title fragment
        tiles = re.findall(r'product-title[^>]*>([^<]+)<', html)
        for pos, title in enumerate(tiles[:48], start=1):
            t = title.strip().lower()
            for l in listings:
                frag = " ".join(l["title"].lower().split()[:4])
                if (brand and brand in t) or (frag and frag in t):
                    rows_out.append(dict(sku=l["sku"], keyword=kw, position=pos,
                                         page=1, day=datetime.date.today().isoformat()))
                    found += 1
    if rows_out:
        db.upsert_ranks(rows_out)
    db.log_sync("ranker", "ok", f"{checked} keywords checked, {found} placements found")
    return checked, found, "ok"
