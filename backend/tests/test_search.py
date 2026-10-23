"""Tests for listing scoring, searching, and HTTP validation."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.data import load_listings
from app.main import app
from app.models import Listing
from app.scoring import calculate_relevance_score
from app.search import (
    CityNotFoundError,
    NoKeywordMatchesError,
    SearchValidationError,
    search_listings,
)

client = TestClient(app)
FIXED_DATE = date(2026, 9, 10)


def test_source_dataset_loads_with_source_scoped_identity() -> None:
    """Load the provided dataset and verify unique source-qualified identities."""
    listings = load_listings()
    assert len(listings) == 12
    identities = {(listing.source, listing.id) for listing in listings}
    assert len(identities) == len(listings)
    assert listings[0].listed_date == date(2026, 8, 29)


def test_identical_ids_from_different_sources_remain_distinct() -> None:
    """Keep same-ID listings from separate providers as independent results."""
    first = load_listings()[0]
    second = first.model_copy(update={"source": "MLS_OTHER"})
    results = search_listings((first, second), first.price, as_of=FIXED_DATE)
    assert len(results.results) == 2
    assert {item.listing.source for item in results.results} == {"MLS_A", "MLS_OTHER"}


def test_relevance_score_rewards_budget_fit_and_recent_listings() -> None:
    """Verify the score's budget and recency components move in expected directions."""
    listing = load_listings()[0]
    exact_budget = calculate_relevance_score(listing, listing.price, FIXED_DATE)
    distant_budget = calculate_relevance_score(listing, listing.price * 2, FIXED_DATE)
    newer_date = calculate_relevance_score(listing, listing.price, date(2026, 8, 29))
    assert exact_budget > distant_budget
    assert newer_date > exact_budget


def test_search_returns_ranked_results_and_correct_pagination() -> None:
    """Return the requested page, with consistent totals and navigation flags."""
    result = search_listings(load_listings(), 450_000, page=2, page_size=3, as_of=FIXED_DATE)
    assert result.total == 12
    assert result.total_pages == 4
    assert len(result.results) == 3
    assert result.has_previous is True
    assert result.has_next is True


def test_last_and_out_of_range_pages_are_handled() -> None:
    """Allow the last partial page and return an empty page beyond the end."""
    last_page = search_listings(
        load_listings(), 450_000, page=4, page_size=3, as_of=FIXED_DATE
    )
    empty_page = search_listings(
        load_listings(), 450_000, page=5, page_size=3, as_of=FIXED_DATE
    )
    assert len(last_page.results) == 3
    assert last_page.has_next is False
    assert empty_page.results == []
    assert empty_page.total == 12
    assert empty_page.has_previous is True


def test_keyword_matches_case_insensitive_substrings() -> None:
    """Support partial keyword matches within individual listing descriptions."""
    result = search_listings(
        load_listings(),
        450_000,
        keyword="transit",
        as_of=FIXED_DATE,
    )
    assert result.total > 0
    assert all("transit" in item.listing.description.casefold() for item in result.results)


def test_amenity_filters_require_all_selected_features() -> None:
    """Apply selected amenity filters together and omit non-matching listings."""
    listings = load_listings()
    matching = listings[0].model_copy(
        update={"allow_small_dogs": True, "pool": True}
    )
    missing_pool = listings[1].model_copy(
        update={"allow_small_dogs": True, "pool": False}
    )
    missing_dog_permission = listings[2].model_copy(
        update={"allow_small_dogs": False, "pool": True}
    )

    result = search_listings(
        (matching, missing_pool, missing_dog_permission),
        450_000,
        allow_small_dogs=True,
        pool=True,
        as_of=FIXED_DATE,
    )

    assert [item.listing.id for item in result.results] == [matching.id]


@pytest.mark.parametrize(
    "feature",
    [
        "allowSmallDogs",
        "allowLargeDogs",
        "allowCats",
        "elevator",
        "pool",
        "basement",
        "utilitiesIncluded",
        "dishwasher",
        "furnished",
    ],
)
def test_search_http_endpoint_filters_and_returns_listing_features(feature: str) -> None:
    """Accept each feature query parameter and return only explicitly matching listings."""
    response = client.get(f"/api/listings/search?targetBudget=450000&{feature}=true")

    assert response.status_code == 200
    results = response.json()["results"]
    assert results
    assert all(result["listing"][feature] for result in results)


def test_no_keyword_matches_returns_explicit_error() -> None:
    """Raise the explicit domain error when no matches keywords are found."""
    with pytest.raises(NoKeywordMatchesError):
        search_listings(load_listings(), 450_000, keyword="keyword-not-present")

def test_equal_scores_have_deterministic_tie_breaks() -> None:
    """Use stable listing attributes to order listings with equal scores."""
    same_date = date(2026, 9, 1)
    source_rows = load_listings()
    rows = tuple(
        listing.model_copy(
            update={"price": 450_000.0, "listed_date": same_date}
        )
        for listing in source_rows[:2]
    )
    ranked = search_listings(rows, 450_000, as_of=FIXED_DATE).results
    assert ranked[0].score == ranked[1].score
    assert [(item.listing.source, item.listing.id) for item in ranked] == [
        ("MLS_A", "A1"),
        ("MLS_B", "B7"),
    ]


def test_minimum_price_above_maximum_price_is_rejected() -> None:
    """Reject contradictory price bounds instead of silently returning no matches."""
    with pytest.raises(SearchValidationError):
        search_listings(load_listings(), 450_000, min_price=500_000, max_price=400_000)


def test_unknown_city_is_reported_distinctly() -> None:
    """Raise the explicit domain error when a requested city is absent."""
    with pytest.raises(CityNotFoundError):
        search_listings(load_listings(), 450_000, city="Atlantis")


@pytest.mark.parametrize(
    ("query", "expected_field"),
    [
        ("", "targetBudget"),
        ("?targetBudget=0", "targetBudget"),
        ("?targetBudget=400000&pageSize=0", "pageSize"),
        ("?targetBudget=400000&minPrice=not-a-number", "minPrice"),
    ],
)
def test_invalid_http_parameters_have_structured_errors(
    query: str,
    expected_field: str,
) -> None:
    """Return consistent validation envelopes for missing and invalid inputs."""
    response = client.get(f"/api/listings/search{query}")
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert expected_field in body["error"]["details"][0]["field"]


def test_price_range_and_unknown_city_have_structured_http_errors() -> None:
    """Expose domain validation and missing-city outcomes as clear API errors."""
    invalid_range = client.get(
        "/api/listings/search?targetBudget=400000&minPrice=500000&maxPrice=400000"
    )
    unknown_city = client.get(
        "/api/listings/search?targetBudget=400000&city=Atlantis"
    )
    assert invalid_range.status_code == 422
    assert invalid_range.json()["error"]["code"] == "invalid_filter_range"
    assert unknown_city.status_code == 404
    assert unknown_city.json()["error"]["code"] == "city_not_found"


def test_score_route_uses_source_and_id_as_identity() -> None:
    """Return a separately callable score endpoint for source-qualified IDs."""
    response = client.get("/api/listings/MLS_A/A1/score?targetBudget=450000")
    assert response.status_code == 200
    assert response.json()["listing"]["id"] == "A1"
    assert response.json()["targetBudget"] == 450000
