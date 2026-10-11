#!/usr/bin/env python3
# Enhanced demo data generator for Flipkart FK-Pulse robot
# Generates realistic inventory data simulating live Flipkart seller account

import sqlite3
import json
from datetime import datetime
import random
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'fk_pulse.db')

CATEGORIES = ['Casual Shoes', 'Sarees', 'Kurtas', 'Ethnic Wear', 'Accessories']
BRANDS = ['TestBrand', 'MyBrand', 'TopSeller', 'Quality', 'Premium']

def generate_listings():
    listings = []
    fsns = [f'FSN{str(i).zfill(6)}' for i in range(1, 26)]

    for i, fsn in enumerate(fsns):
        base_impressions = random.randint(800, 4000)
        clicks = int(base_impressions * random.uniform(0.01, 0.03))
        orders = int(clicks * random.uniform(0.04, 0.15))

        listings.append({
            'fsn': fsn,
            'sku': f'SKU{str(i+1).zfill(4)}',
            'title': f'Product {i+1} - {CATEGORIES[i % len(CATEGORIES)]}',
            'brand': BRANDS[i % len(BRANDS)],
            'category': CATEGORIES[i % len(CATEGORIES)],
            'price': random.randint(250, 3500),
            'mrp': random.randint(500, 5000),
            'stock': random.randint(5, 600),
            'status': 'active',
            'attributes_json': json.dumps({'color': 'varied', 'size': 'M-XL'}),
            'rating_avg': round(random.uniform(3.0, 4.9), 1),
            'rating_count': random.randint(5, 800),
            'review_count': random.randint(2, 300),
            'impressions_7d': base_impressions,
            'clicks_7d': clicks,
            'orders_7d': orders,
            'returns_7d': int(orders * random.uniform(0.05, 0.12)),
            'revenue_7d': orders * random.randint(150, 1200),
            'cancellation_rate': round(random.uniform(0.1, 2.5), 2),
            'rtd_breach_rate': round(random.uniform(0.2, 1.0), 2),
            'dispatch_sla': round(random.uniform(90, 99), 1),
            'listed_date': (datetime.now().date()).isoformat(),
            'updated_at': datetime.now().isoformat()
        })

    return listings

def insert_demo_data():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        listings = generate_listings()

        for listing in listings:
            try:
                cursor.execute('''
                    INSERT OR REPLACE INTO listings (
                        fsn, sku, title, brand, category, price, mrp, stock, status,
                        attributes_json, rating_avg, rating_count, review_count,
                        impressions_7d, clicks_7d, orders_7d, returns_7d, revenue_7d,
                        cancellation_rate, rtd_breach_rate, dispatch_sla,
                        listed_date, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    listing['fsn'], listing['sku'], listing['title'], listing['brand'],
                    listing['category'], listing['price'], listing['mrp'], listing['stock'],
                    listing['status'], listing['attributes_json'], listing['rating_avg'],
                    listing['rating_count'], listing['review_count'],
                    listing['impressions_7d'], listing['clicks_7d'], listing['orders_7d'],
                    listing['returns_7d'], listing['revenue_7d'],
                    listing['cancellation_rate'], listing['rtd_breach_rate'],
                    listing['dispatch_sla'], listing['listed_date'], listing['updated_at']
                ))
            except Exception as e:
                print(f'[Demo] Skipped listing {listing["fsn"]}: {str(e)[:50]}')

        conn.commit()
        conn.close()
        print(f'✅ Generated {len(listings)} Flipkart demo listings')
    except Exception as e:
        print(f'[Demo] Could not insert data (table might not exist yet): {str(e)[:100]}')

if __name__ == '__main__':
    insert_demo_data()
