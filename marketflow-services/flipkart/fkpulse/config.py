"""Configuration loading for FK-Pulse.

Reads ``config.example.yaml`` as the default set and merges a user-supplied
``config.yaml`` on top of it (deep merge for nested dicts). If the user config
is missing, the example defaults are used as-is (mode=fixture).
"""

from __future__ import annotations

import copy
import os
from typing import Any

import yaml

_DEFAULT_EXAMPLE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "config.example.yaml",
)


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge ``override`` into a copy of ``base``."""
    merged = copy.deepcopy(base)
    for key, value in override.items():
        if (
            key in merged
            and isinstance(merged[key], dict)
            and isinstance(value, dict)
        ):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def load_config(path: str = "config.yaml") -> dict[str, Any]:
    """Load configuration, merging ``path`` over the example defaults.

    Args:
        path: Path to the user YAML config file. Defaults to ``config.yaml``.

    Returns:
        The merged configuration dictionary. If ``path`` does not exist, the
        defaults from ``config.example.yaml`` are returned unchanged
        (mode=fixture).
    """
    with open(_DEFAULT_EXAMPLE, "r", encoding="utf-8") as fh:
        defaults: dict[str, Any] = yaml.safe_load(fh) or {}

    if not os.path.exists(path):
        return defaults

    with open(path, "r", encoding="utf-8") as fh:
        user_cfg: dict[str, Any] = yaml.safe_load(fh) or {}

    return _deep_merge(defaults, user_cfg)
