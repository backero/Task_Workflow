#!/usr/bin/env python3
"""Initialize the FK-Pulse database: schema + tracked_keywords seed.

Seeds 5 tracked keywords for each of the 3 hero SKUs of the demo cosmetics
brand. Hero FSNs are resolved from fixtures/listings.json when available
(config fixture_dir); otherwise the known demo FSNs are used.

Usage:
    python scripts/init_db.py [--config config.yaml] [--db PATH]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# Allow running as a plain script from the project root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fkpulse.config import load_config
from fkpulse.db import get_conn, init_db

# Hero demo SKUs -> FSN fallback (matches fixtures/listings.json).
HERO_SKU_FSN = {
    "NS10-30": "SERGV5NKHDGFHZ1",   # Niacinamide 10% Face Serum
    "PM-50": "MSTPM50CGHJKL2P",     # Peptide + Ceramide Moisturizer
    "VC15-30": "SVC15GHYU67BNM4",   # Vitamin C 15% Face Serum
}

# 5 keywords tracked per hero SKU.
HERO_KEYWORDS = {
    "NS10-30": [
        "niacinamide serum",
        "niacinamide 10 serum",
        "face serum for pores",
        "serum for oily skin",
        "face serum",
    ],
    "PM-50": [
        "peptide moisturizer",
        "ceramide moisturizer",
        "moisturizer for dry skin",
        "anti aging moisturizer",
        "face moisturizer",
    ],
    "VC15-30": [
        "vitamin c serum",
        "vitamin c face serum",
        "serum for glowing skin",
        "brightening serum",
        "face serum for dark spots",
    ],
}


def _resolve_hero_fsns(fixture_dir: str) -> dict[str, str]:
    """Map hero SKU codes to FSNs using fixtures/listings.json if present."""
    mapping = dict(HERO_SKU_FSN)
    path = os.path.join(fixture_dir, "listings.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            for row in json.load(fh):
                if row.get("sku") in mapping and row.get("fsn"):
                    mapping[row["sku"]] = row["fsn"]
    return mapping


def seed_tracked_keywords(db_path: str, fixture_dir: str = "fixtures") -> int:
    """Insert hero-SKU keyword rows if not already seeded.

    Returns:
        Number of keyword rows inserted (0 if already seeded).
    """
    conn = get_conn(db_path)
    try:
        existing = conn.execute("SELECT COUNT(*) FROM tracked_keywords").fetchone()[0]
        if existing:
            return 0
        fsn_by_sku = _resolve_hero_fsns(fixture_dir)
        rows = []
        for sku, keywords in HERO_KEYWORDS.items():
            for kw in keywords:
                rows.append((fsn_by_sku[sku], kw, 1))
        conn.executemany(
            "INSERT INTO tracked_keywords(fsn, keyword, active) VALUES (?,?,?)",
            rows,
        )
        conn.commit()
        return len(rows)
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize the FK-Pulse DB.")
    parser.add_argument("--config", default="config.yaml",
                        help="Path to config file (default: config.yaml)")
    parser.add_argument("--db", default=None,
                        help="Override DB path (default: from config)")
    args = parser.parse_args()

    config = load_config(args.config)
    db_path = args.db or config.get("db_path", "fk_pulse.db")
    fixture_dir = config.get("fixture_dir", "fixtures")

    init_db(db_path)
    seeded = seed_tracked_keywords(db_path, fixture_dir)
    print(f"Initialized DB at {db_path}; seeded {seeded} tracked keywords "
          f"(3 hero SKUs x 5 keywords).")


if __name__ == "__main__":
    main()
