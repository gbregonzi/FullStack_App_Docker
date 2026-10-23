"""HTTP routes and request validation for the listings search API."""

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.data import load_listings
from app.models import ErrorDetail, ErrorResponse, ScoreResponse, SearchResponse
from app.scoring import calculate_relevance_score
from app.search import CityNotFoundError, NoKeywordMatchesError, SearchValidationError, search_listings

app = FastAPI(title="Listings Search API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Convert framework query validation into the API error envelope."""
    details = [
        ErrorDetail(
            field=".".join(str(part) for part in error["loc"] if part != "query"),
            message=error["msg"],
        ).model_dump()
        for error in exc.errors()
    ]
    response = ErrorResponse(
        error={
            "code": "validation_error",
            "message": "One or more request parameters are invalid.",
            "details": details,
        }
    )
    return JSONResponse(status_code=422, content=response.model_dump())


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Report API liveness without loading the listing dataset."""
    return {"status": "ok"}


@app.get("/api/listings/search", response_model=SearchResponse)
def search(
    target_budget: float = Query(alias="targetBudget", gt=0, allow_inf_nan=False),
    min_price: float | None = Query(default=None, alias="minPrice", ge=0, allow_inf_nan=False),
    max_price: float | None = Query(default=None, alias="maxPrice", ge=0, allow_inf_nan=False),
    min_bedrooms: int | None = Query(default=None, alias="minBedrooms", ge=0),
    city: str | None = Query(default=None, min_length=1, max_length=100),
    keyword: str | None = Query(default=None, min_length=1, max_length=200),
    allow_small_dogs: bool = Query(default=False, alias="allowSmallDogs"),
    allow_large_dogs: bool = Query(default=False, alias="allowLargeDogs"),
    allow_cats: bool = Query(default=False, alias="allowCats"),
    elevator: bool = Query(default=False),
    pool: bool = Query(default=False),
    basement: bool = Query(default=False),
    utilities_included: bool = Query(default=False, alias="utilitiesIncluded"),
    dishwasher: bool = Query(default=False),
    furnished: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, alias="pageSize", ge=1, le=100),
) -> SearchResponse | JSONResponse:
    """Search listings by filters and return one relevance-ranked page."""
    try:
        return search_listings(
            listings=load_listings(),
            target_budget=target_budget,
            min_price=min_price,
            max_price=max_price,
            min_bedrooms=min_bedrooms,
            city=city,
            keyword=keyword,
            allow_small_dogs=allow_small_dogs,
            allow_large_dogs=allow_large_dogs,
            allow_cats=allow_cats,
            elevator=elevator,
            pool=pool,
            basement=basement,
            utilities_included=utilities_included,
            dishwasher=dishwasher,
            furnished=furnished,
            page=page,
            page_size=page_size,
        )
    except SearchValidationError as exc:
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error={
                    "code": "invalid_filter_range",
                    "message": str(exc),
                    "details": [
                        {"field": "minPrice/maxPrice", "message": str(exc)}
                    ],
                }
            ).model_dump(),
        )
    except CityNotFoundError as exc:
        return JSONResponse(
            status_code=404,
            content=ErrorResponse(
                error={
                    "code": "city_not_found",
                    "message": str(exc),
                    "details": [{"field": "city", "message": str(exc)}],
                }
            ).model_dump(),
        )
    except NoKeywordMatchesError as exc:
        return JSONResponse(
            status_code=404,
            content=ErrorResponse(
                error={
                    "code": "no_keyword_matches",
                    "message": str(exc),
                    "details": [{"field": "keyword", "message": str(exc)}],
                }
            ).model_dump(),
        )

@app.get("/api/listings/{source}/{listing_id}/score", response_model=ScoreResponse)
def score_listing(
    source: str,
    listing_id: str,
    target_budget: float = Query(alias="targetBudget", gt=0, allow_inf_nan=False),
) -> ScoreResponse | JSONResponse:
    """Score a single source-qualified listing for the requested budget."""
    listing = next(
        (
            item
            for item in load_listings()
            if item.source.casefold() == source.casefold() and item.id == listing_id
        ),
        None,
    )
    if listing is None:
        return JSONResponse(
            status_code=404,
            content=ErrorResponse(
                error={
                    "code": "listing_not_found",
                    "message": f"Listing '{listing_id}' was not found for source '{source}'.",
                    "details": [{"field": "source/listing_id", "message": "No matching listing."}],
                }
            ).model_dump(),
        )
    return ScoreResponse(
        listing=listing,
        targetBudget=target_budget,
        score=calculate_relevance_score(listing, target_budget),
    )
