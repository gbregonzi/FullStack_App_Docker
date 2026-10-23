"""Deterministic budget and freshness relevance scoring."""

from datetime import date
from math import exp

from app.models import Listing


def calculate_relevance_score(
    listing: Listing,
    target_budget: float,
    as_of: date | None = None,
) -> float:
    """Score budget proximity and listing freshness on a 0–100 scale."""
    reference_date = as_of or date.today()
    age_days = max((reference_date - listing.listed_date).days, 0)
    budget_fit = exp(-abs(listing.price - target_budget) / target_budget)
    recency_fit = 2 ** (-age_days / 30)
    return round(100 * (0.8 * budget_fit + 0.2 * recency_fit), 4)
