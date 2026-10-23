"""Validated data models shared by the listings API."""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class Listing(BaseModel):
    """Represent one source listing with the source JSON field names."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    id: str
    source: str
    address: str
    city: str
    state: str
    zip: str
    price: float = Field(ge=0, allow_inf_nan=False)
    bedrooms: int = Field(ge=0)
    bathrooms: float = Field(ge=0, allow_inf_nan=False)
    sqft: int = Field(ge=0)
    latitude: float = Field(allow_inf_nan=False)
    longitude: float = Field(allow_inf_nan=False)
    listed_date: date = Field(alias="listedDate")
    status: str
    description: str
    allow_small_dogs: bool = Field(default=False, alias="allowSmallDogs")
    allow_large_dogs: bool = Field(default=False, alias="allowLargeDogs")
    allow_cats: bool = Field(default=False, alias="allowCats")
    elevator: bool = False
    pool: bool = False
    basement: bool = False
    utilities_included: bool = Field(default=False, alias="utilitiesIncluded")
    dishwasher: bool = False
    furnished: bool = False


class RankedListing(BaseModel):
    """Pair a listing with its computed relevance score."""

    listing: Listing
    score: float


class SearchResponse(BaseModel):
    """Return ranked page data and all pagination metadata."""

    results: list[RankedListing]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")
    total_pages: int = Field(alias="totalPages")
    has_previous: bool = Field(alias="hasPrevious")
    has_next: bool = Field(alias="hasNext")


class ScoreResponse(BaseModel):
    """Return one listing and its relevance score."""

    listing: Listing
    target_budget: float = Field(alias="targetBudget")
    score: float


class ErrorDetail(BaseModel):
    """Describe one invalid request field."""

    field: str
    message: str


class ErrorBody(BaseModel):
    """Provide a consistent structured API error."""

    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    """Wrap structured API errors in a stable envelope."""

    error: ErrorBody
