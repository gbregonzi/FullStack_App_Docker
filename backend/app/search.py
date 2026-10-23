"""Listing filtering, ranking, and pagination business logic."""

from datetime import date
from math import ceil

from app.models import Listing, RankedListing, SearchResponse
from app.scoring import calculate_relevance_score


class SearchValidationError(ValueError):
    """Represent a validly parsed request with an invalid filter combination."""


class CityNotFoundError(LookupError):
    """Represent a requested city that is absent from the source dataset."""
    
class NoKeywordMatchesError(LookupError):
    """Represent a requested keyword that yields no matches in the source dataset."""

def search_listings(
    listings: tuple[Listing, ...],
    target_budget: float,
    min_price: float | None = None,
    max_price: float | None = None,
    min_bedrooms: int | None = None,
    city: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 10,
    as_of: date | None = None,
    allow_small_dogs: bool = False,
    allow_large_dogs: bool = False,
    allow_cats: bool = False,
    elevator: bool = False,
    pool: bool = False,
    basement: bool = False,
    utilities_included: bool = False,
    dishwasher: bool = False,
    furnished: bool = False,
) -> SearchResponse:
    """Filter, score, deterministically rank, and paginate listings."""
    if min_price is not None and max_price is not None and min_price > max_price:
        raise SearchValidationError("minPrice must be less than or equal to maxPrice")

    normalized_city = city.strip() if city and city.strip() else None
    normalized_keyword = keyword.strip().casefold() if keyword and keyword.strip() else None

    if normalized_city and not any(
        listing.city.casefold() == normalized_city.casefold() for listing in listings
    ):
        raise CityNotFoundError(f"No listings were found for city '{normalized_city}'")

    if normalized_keyword and not any(
        normalized_keyword in listing.description.casefold() for listing in listings
    ):
        raise NoKeywordMatchesError(f"No listings were found for keyword '{normalized_keyword}'")
    
    filtered = [
        listing
        for listing in listings
        if (min_price is None or listing.price >= min_price)
        and (max_price is None or listing.price <= max_price)
        and (min_bedrooms is None or listing.bedrooms >= min_bedrooms)
        and (
            not normalized_city
            or listing.city.casefold() == normalized_city.casefold()
        )
        and (
            not normalized_keyword
            or normalized_keyword in listing.description.casefold()
        )
        and (not allow_small_dogs or listing.allow_small_dogs)
        and (not allow_large_dogs or listing.allow_large_dogs)
        and (not allow_cats or listing.allow_cats)
        and (not elevator or listing.elevator)
        and (not pool or listing.pool)
        and (not basement or listing.basement)
        and (not utilities_included or listing.utilities_included)
        and (not dishwasher or listing.dishwasher)
        and (not furnished or listing.furnished)
    ]

    ranked = [
        RankedListing(
            listing=listing,
            score=calculate_relevance_score(listing, target_budget, as_of),
        )
        for listing in filtered
    ]
    ranked.sort(
        key=lambda result: (
            -result.score,
            result.listing.price,
            -result.listing.listed_date.toordinal(),
            result.listing.source,
            result.listing.id,
        )
    )

    total = len(ranked)
    total_pages = ceil(total / page_size) if total else 0
    start = (page - 1) * page_size
    page_results = ranked[start : start + page_size] if start < total else []

    return SearchResponse(
        results=page_results,
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
        hasPrevious=page > 1 and total > 0,
        hasNext=page < total_pages,
    )
