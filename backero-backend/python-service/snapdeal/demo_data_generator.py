#!/usr/bin/env python3
# Enhanced demo data generator for Snapdeal robot
# Generates realistic product data simulating live Snapdeal seller account

import sqlite3
import json
from datetime import datetime, timedelta
import random
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'sdpulse.db')

CATEGORIES = ['Men Casual Shoes', 'Women Sarees', 'Cotton Kurtas', 'Ethnic Wear', 'Home Decor']
HSNS = [f'HSN{str(i).zfill(3)}' for i in range(1, 26)]

def generate_listings():
    listings = []
    for i, hsn in enumerate(HSNS):
        base_impressions = random.randint(500, 3000)
        clicks = int(base_impressions * random.uniform(0.008, 0.025))
        orders = int(clicks * random.uniform(0.03, 0.12))

        listings.append({
            'hsn': hsn,
            'title': f'Product {i+1} - {CATEGORIES[i % len(CATEGORIES)]}',
            'category': CATEGORIES[i % len(CATEGORIES)],
            'price': random.randint(200, 3000),
            'mrp': random.randint(400, 5000),
            'status': 'active',
            'stock': random.randint(10, 500),
            'rating_avg': round(random.uniform(3.2, 4.8), 1),
            'rating_count': random.randint(10, 500),
            'impressions_7d': base_impressions,
            'clicks_7d': clicks,
            'orders_7d': orders,
            'returns_7d': int(orders * random.uniform(0.04, 0.1)),
            'revenue_7d': orders * random.randint(100, 1000),
            'dispatch_sla': round(random.uniform(85, 99), 1),
            'last_updated': datetime.now().isoformat()
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
                        hsn, title, category, price, mrp, status, stock,
                        rating_avg, rating_count, impressions_7d, clicks_7d,
                        orders_7d, returns_7d, revenue_7d, dispatch_sla, last_updated
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    listing['hsn'], listing['title'], listing['category'],
                    listing['price'], listing['mrp'], listing['status'],
                    listing['stock'], listing['rating_avg'], listing['rating_count'],
                    listing['impressions_7d'], listing['clicks_7d'],
                    listing['orders_7d'], listing['returns_7d'],
                    listing['revenue_7d'], listing['dispatch_sla'],
                    listing['last_updated']
                ))
            except Exception as e:
                print(f'[Demo] Skipped listing {listing["hsn"]}: {str(e)[:50]}')

        conn.commit()
        conn.close()
        print(f'✅ Generated {len(listings)} Snapdeal demo listings')
    except Exception as e:
        print(f'[Demo] Could not insert data (table might not exist yet): {str(e)[:100]}')

if __name__ == '__main__':
    insert_demo_data()
