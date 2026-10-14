"""Connector interface — every data source implements these four methods
and returns the normalized shapes below. The engine never cares which
connector produced the data."""

class Connector:
    name = "base"
    is_demo = True

    def fetch_listings(self):
        """-> [{sku,title,brand,category,price,mrp,stock,status,rating,reviews,
               fulfilment,image_ok,attrs_filled,attrs_total,created,updated}]"""
        raise NotImplementedError

    def fetch_metrics(self, days=30):
        """-> [{sku,day,impressions,clicks,orders,cancellations,dto,rto,revenue}]"""
        raise NotImplementedError

    def fetch_scorecard(self):
        """-> {day,cancellation_pct,ontime_pct,rating,dto_pct,rto_pct,dispatched_24h_pct}"""
        raise NotImplementedError

    def fetch_ads(self, days=30):
        """-> [{campaign,sku,day,spend,impressions,clicks,orders,revenue}]"""
        raise NotImplementedError
