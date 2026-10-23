"""Load and validate the source listing dataset."""

import json
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError

from app.models import Listing

DATA_FILE = Path(__file__).resolve().parents[2] / "resource" / "sample_listings.json"


@lru_cache(maxsize=1)
def load_listings() -> tuple[Listing, ...]:
    """Read the JSON source once and reject malformed or duplicate source rows."""
    try:
        raw_listings = json.loads(DATA_FILE.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not load listing dataset at {DATA_FILE}: {exc}") from exc

    if not isinstance(raw_listings, list):
        raise RuntimeError(f"Listing dataset at {DATA_FILE} must contain a JSON array")

    try:
        listings = tuple(Listing.model_validate(row) for row in raw_listings)
    except ValidationError as exc:
        raise RuntimeError(f"Listing dataset at {DATA_FILE} contains invalid rows: {exc}") from exc

    identities = [(listing.source, listing.id) for listing in listings]
    if len(identities) != len(set(identities)):
        raise RuntimeError(f"Listing dataset at {DATA_FILE} contains duplicate source/id pairs")

    return listings
