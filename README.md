# HomeFind Listings Search

A complete listings-search application: a Python/FastAPI REST API reads the supplied JSON dataset, applies validated filters, scores and ranks matches, then returns paginated results to a React + TypeScript interface.

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer and npm

## Run locally

Open two terminals from the project root.

### Start the API

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Interactive OpenAPI docs are at `http://127.0.0.1:8000/docs`.

### Start the React UI

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). Vite forwards `/api` requests to the local FastAPI service.

### Run backend tests

From the project root, after installing backend requirements:

```powershell
cd backend
python -m pytest
```

### Build the frontend

```powershell
cd frontend
npm run build
```

## REST API

All query parameter validation errors use this envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "One or more request parameters are invalid.",
    "details": [{ "field": "pageSize", "message": "Input should be greater than or equal to 1" }]
  }
}
```

### Search and pagination

`GET /api/listings/search` returns scored results ordered highest relevance first.

| Parameter | Required | Rules |
| --- | --- | --- |
| `targetBudget` | Yes | Positive finite USD amount |
| `minPrice` | No | Non-negative finite USD amount |
| `maxPrice` | No | Non-negative finite USD amount |
| `minBedrooms` | No | Integer greater than or equal to zero |
| `city` | No | Case-insensitive exact city name |
| `keyword` | No | Case-insensitive substring of description |
| `allowSmallDogs`, `allowLargeDogs`, `allowCats` | No | When `true`, require that pet permission |
| `elevator`, `pool`, `basement`, `utilitiesIncluded`, `dishwasher`, `furnished` | No | When `true`, require that feature |
| `page` | No | 1-based integer; defaults to `1` |
| `pageSize` | No | Integer from 1 to 100; defaults to `10` |

Example:

```text
GET /api/listings/search?targetBudget=500000&minPrice=400000&minBedrooms=2&city=Springfield&keyword=transit&page=1&pageSize=5
```

The response includes `results`, `total`, `page`, `pageSize`, `totalPages`, `hasPrevious`, and `hasNext`. A valid search with no matches returns an empty `results` array and `total: 0`; a page beyond the last page is also empty but retains the full match count. A city absent from the source returns HTTP 404 with `city_not_found`. Contradictory price bounds return HTTP 422 with `invalid_filter_range`.

### Score one listing

`GET /api/listings/{source}/{listing_id}/score?targetBudget=500000` returns one scored listing. Both `source` and `listing_id` form its identity because IDs are only unique within a source. Unknown listings return HTTP 404 with `listing_not_found`.

### Health

`GET /api/health` returns `{"status":"ok"}`.

## Relevance scoring

The score is in the range 0–100 and is computed per listing as:

```text
ageDays   = max((asOfDate - listedDate).days, 0)
budgetFit = exp(-abs(price - targetBudget) / targetBudget)
recency   = 2 ^ (-ageDays / 30)
score     = round(100 * (0.80 * budgetFit + 0.20 * recency), 4)
```

The API uses the current server date as `asOfDate`; scoring code accepts an explicit reference date for repeatable tests. A future `listedDate` is treated as age zero. Budget match receives 80% weight, since affordability is the primary user intent; exponential distance gives a smooth, non-negative penalty without a hard cutoff. Recency receives 20% weight and halves every 30 days, which gives newer inventory a consistent but secondary advantage. The formula is deterministic for a given listing, budget, and date.

Results are ordered by descending computed score (rounded to four decimals), then by lower price, more recent listing date, source name, and listing ID. Explicit tie-breakers keep ordering reproducible across pages and runs. A score is a ranking aid, not a financial recommendation.

## Input and no-result behavior

- Missing, non-finite, non-numeric, or out-of-range query values produce HTTP 422 and a structured `validation_error`.
- `minPrice > maxPrice` produces HTTP 422 and `invalid_filter_range`.
- A city that does not occur in the dataset produces HTTP 404 and `city_not_found`.
- A valid combination of filters with no matching listings produces a normal empty search response so the UI can show its no-results state.
- Page numbers are 1-based. `pageSize` cannot be zero or negative and is capped at 100. No results yield `totalPages: 0`; an out-of-range page is empty and keeps previous/next metadata accurate.
- Listings are identified by `(source, id)`, not `id` alone.

## Source dataset

The supplied file is `resource/sample_listings.json` (the prompt references `/source/sample_listings.json`). The API validates records at load time and rejects malformed records or duplicate `(source, id)` pairs rather than silently ignoring data.

## Architecture

See [docs/architecture.md](docs/architecture.md) for component boundaries, request flow, and the project file inventory.
See [docs/engineering.md](docs/engineering.md) for local development, validation, API behavior, and extension guidance.

## File inventory

| File | Purpose |
| --- | --- |
| `.gitignore` | Excludes local environments, installed dependencies, and generated build/test files |
| `README.md` | Setup, API contract, scoring explanation, and project entry point |
| `docs/architecture.md` | Architecture, request flow, and complete source/data file inventory |
| `docs/engineering.md` | Development workflow, API behavior, extension guidance, and testing expectations |
| `resource/sample_listings.json` | Supplied JSON listing dataset |
| `resource/field-type-12.csv` | Supplied field/type/notes reference |
| `backend/requirements.txt` | Python API and test dependencies |
| `backend/app/__init__.py` | Marks the API package |
| `backend/app/models.py` | Validated listing, score, pagination, and error models |
| `backend/app/data.py` | Dataset loading and integrity validation |
| `backend/app/scoring.py` | Budget/recency relevance formula |
| `backend/app/search.py` | Filtering, deterministic ranking, and pagination |
| `backend/app/main.py` | FastAPI routes, CORS, and structured request errors |
| `backend/tests/test_search.py` | Scoring, filtering, pagination, and API validation tests |
| `frontend/package.json` | UI dependencies and npm commands |
| `frontend/package-lock.json` | Reproducible frontend dependency versions |
| `frontend/tsconfig.json` | Strict TypeScript compiler settings |
| `frontend/vite.config.ts` | React plugin and API development proxy |
| `frontend/index.html` | Browser document and React mount point |
| `frontend/src/types.ts` | Typed API response and listing shapes |
| `frontend/src/api.ts` | Typed fetch wrapper and API error handling |
| `frontend/src/main.tsx` | React application bootstrap |
| `frontend/src/App.tsx` | Search form, async states, result cards, and pagination |
| `frontend/src/styles.css` | Responsive visual design and state styling |

Every application function and method has a source-level docstring or JSDoc description.
