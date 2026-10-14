"""Shared TypeSafe/Jev AI client for the 3 Python marketplace-automation scrapers
(Meesho, Snapdeal, Flipkart) -- replaces the old Claude narrative-summary insight
with structured sales-manager predictions.

Jev is TypeSafe's System One model (https://docs.typesafe.ai) -- it is NOT a chat/
text-generation model. You send a block of text/JSON ("state") plus typed questions
(Noul = yes/no probability, Choice = pick one option, Score = rate on an ordered
rubric) and it returns typed values with confidence/probabilities, evaluated in
parallel and in isolation against the same state. That's a better, cheaper fit for
"is this right or wrong" judgment calls than asking a narrative model for prose, so
each platform's real current data (the same build_context() each ai_analysis.py
already collects) is sent as `state`, alongside a fixed set of sales-manager-style
questions that generalize across all 3 platforms (they all have pricing, rating/
quality, fulfilment, and an open-findings/alerts list).

Uses the official `typesafe-sdk` package (pip install typesafe-sdk). Silently
no-ops until TYPESAFE_API_KEY is set, matching how the old Claude path silently
no-op'd without ANTHROPIC_API_KEY. Get a key at console.typesafe.ai/keys.
"""
from __future__ import annotations

import os

MODEL = os.environ.get("TYPESAFE_MODEL", "jev-latest")

# Generic sales-manager judgment calls -- deliberately platform-agnostic so all 3
# Python services (and, in spirit, Amazon's Node side) ask the same questions of
# their own real data. "Right vs wrong" calls, not a narrative.
#
# Built lazily (see _questions()) because the Noul/Choice/Score classes come from
# the typesafe_sdk package, which we don't want to hard-require at import time --
# is_configured() must stay usable even before the package is confirmed installed.


def _questions():
    from typesafe_sdk import Choice, Noul, Score

    return {
        "pricing_risk": Noul(
            instructions="Based on this seller's current pricing vs. competitors or the platform's recommended price, is pricing currently a competitive risk?",
        ),
        "quality_risk": Noul(
            instructions="Based on ratings, reviews and return-rate data, is product quality/rating currently at risk of hurting visibility?",
        ),
        "fulfilment_risk": Noul(
            instructions="Based on dispatch, stock and fulfilment data, is fulfilment health currently a risk?",
        ),
        "urgency": Score(
            instructions="How urgent is it to take action this week based on this data?",
            criteria=[
                "No action needed",
                "Worth a look this week",
                "Should act soon",
                "Urgent — act now",
            ],
        ),
        "priority_area": Choice(
            instructions="Which single area most needs attention right now?",
            criteria={
                "pricing": "Price competitiveness vs. market or recommended price",
                "quality_or_rating": "Product quality, ratings, or reviews",
                "fulfilment": "Dispatch, stock, or delivery health",
                "returns": "Return or RTO rate",
                "advertising": "Ads spend or performance",
            },
        ),
    }


def is_configured() -> bool:
    return bool(os.environ.get("TYPESAFE_API_KEY"))


def ask(state: dict) -> dict:
    """Sends the real business-data context + the fixed question set to Jev AI via
    the official typesafe-sdk client. Returns a plain-dict snapshot of the answers
    (one entry per question id, each with its type-specific fields) suitable for
    JSON storage. Raises on any failure; callers must catch.
    """
    from typesafe_sdk import TypeSafeClient

    with TypeSafeClient() as client:  # reads TYPESAFE_API_KEY automatically
        response = client.system_one(model=MODEL, state=state, questions=_questions())

    result = {}
    for name, answer in response.answers.items():
        if answer.type == "noul":
            result[name] = {"type": "noul", "noul": answer.noul}
        elif answer.type == "choice":
            result[name] = {"type": "choice", "choice": answer.choice, "confidence": answer.confidence}
        elif answer.type == "score":
            result[name] = {"type": "score", "score": answer.score, "confidence": answer.confidence}
    return result
