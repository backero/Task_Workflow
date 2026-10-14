"""Configuration handling for Meesho Seller Command Center.

Config lives at data/config.yaml (YAML). On first run it is created from
config.example.yaml in the repo root. Access via dot-path keys:

    get("thresholds.qs_warn", 15.0)
"""

import os
import shutil

import yaml

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONFIG_PATH = os.path.join(DATA_DIR, "config.yaml")
EXAMPLE_PATH = os.path.join(BASE_DIR, "config.example.yaml")

_cache = None


def _ensure_config():
    """Make sure data/ and data/config.yaml exist (copy example if missing)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(CONFIG_PATH):
        shutil.copyfile(EXAMPLE_PATH, CONFIG_PATH)


def load_config(force=False):
    """Load config.yaml into memory and return it as a dict."""
    global _cache
    if _cache is not None and not force:
        return _cache
    _ensure_config()
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            _cache = yaml.safe_load(f) or {}
    except Exception:
        _cache = {}
    return _cache


def save_config(cfg):
    """Persist a config dict to data/config.yaml and refresh the cache."""
    global _cache
    _ensure_config()
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
    _cache = cfg


def get(key, default=None):
    """Dot-path lookup into the loaded config.

    get("thresholds.qs_warn", 15.0) -> 15.0
    Returns `default` if any path segment is missing or not a mapping.
    """
    cfg = load_config()
    node = cfg
    for part in str(key).split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return default
    return node
