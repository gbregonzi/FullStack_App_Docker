# Architecture

## Overview

The project separates source-data validation, search/scoring logic, HTTP transport, and browser presentation:

```text
resource/sample_listings.json
          |
          v
backend/app/data.py ----> backend/app/models.py
          |                       |
          v                       v
backend/app/search.py <---- backend/app/scoring.py
          |
          v
backend/app/main.py (FastAPI: REST, validation, error envelopes)
          |
          | JSON over /api
          v
frontend/src/api.ts --> frontend/src/App.tsx --> frontend/src/styles.css
```

## Request flow

1. The React search form submits a required target budget, optional filters, and page state to `GET /api/listings/search`.
2. FastAPI validates query types and bounds. `backend/app/main.py` maps framework and domain errors into a stable `{ "error": { "code", "message", "details" } }` envelope.
3. `backend/app/data.py` reads the JSON source once, validates every record, and verifies uniqueness by `(source, id)`.
4. `backend/app/search.py` applies case-insensitive exact city filtering and description substring matching, computes scores, applies explicit tie-breakers, and slices the requested page.
5. The response contains the current page plus total and navigation metadata. `frontend/src/App.tsx` handles loading, error, empty, result, and pagination states.
6. `GET /api/listings/{source}/{listing_id}/score` exposes the same scoring helper for an individual source-qualified listing.

## Responsibilities

- **Models** validate source rows and define stable response envelopes.
- **Data loader** fails explicitly for missing, malformed, or duplicate source records.
- **Scoring** is a pure function with an injectable reference date, making ranking reproducible in tests.
- **Search service** contains no HTTP concerns; it filters, ranks, and paginates passed-in listings.
- **FastAPI routes** handle HTTP parameter validation, API errors, CORS, and endpoint wiring.
- **React UI** owns user input and loading/error/empty states; API ranking and pagination remain authoritative on the server.
- **Vite** serves the TypeScript client and proxies `/api` calls to FastAPI during local development.

## API decisions

- Search requires `targetBudget`, because ranking otherwise has no declared budget target.
- Listing IDs are source-scoped, so the score endpoint requires both source and ID.
- A city absent from the dataset returns a structured 404. A valid filter combination with no listing matches returns an empty result page; a later out-of-range page keeps the total match count.
- Pagination is 1-based, page size is limited to 1–100, and an empty result set has zero total pages.
- Search operates on all statuses present in the JSON source; there is no implicit status exclusion.
- Price and bedroom filters are inclusive minimum/maximum thresholds. City is trimmed and case-insensitive, and keyword is trimmed and case-insensitive against descriptions. Selected listing feature filters are combined with AND and only match source records explicitly marked `true`.

## Complete project file inventory

| File | Purpose |
| --- | --- |
| `.gitignore` | Excludes local environments, installed dependencies, and generated build/test files |
| `README.md` | Installation, run/test/build steps, API contract, scoring details, and source inventory |
| `docs/architecture.md` | Component boundaries, data flow, design decisions, and this file inventory |
| `docs/engineering.md` | Local development, API behavior, extension guidance, and testing expectations |
| `resource/sample_listings.json` | Provided listing records |
| `resource/field-type-12.csv` | Provided data dictionary |
| `backend/requirements.txt` | FastAPI, Uvicorn, pytest, and HTTP test client dependencies |
| `backend/app/__init__.py` | Python package marker |
| `backend/app/models.py` | Listing, ranked result, page, score, and error response schemas |
| `backend/app/data.py` | Cached source JSON loading and integrity checks |
| `backend/app/scoring.py` | Budget-fit and recency relevance score |
| `backend/app/search.py` | Search validation, filtering, sorting, and pagination |
| `backend/app/main.py` | Health/search/score endpoints, CORS, and structured validation errors |
| `backend/tests/test_search.py` | Data, score, tie, filter, page-boundary, and API validation tests |
| `frontend/package.json` | Frontend dependencies and npm scripts |
| `frontend/package-lock.json` | Locked frontend dependency versions |
| `frontend/tsconfig.json` | Strict TypeScript configuration |
| `frontend/vite.config.ts` | Vite React setup and API proxy |
| `frontend/index.html` | Browser shell and app mount element |
| `frontend/src/types.ts` | TypeScript interfaces for API listings and errors |
| `frontend/src/api.ts` | Search request and API error parsing |
| `frontend/src/main.tsx` | React root mounting and stylesheet import |
| `frontend/src/App.tsx` | Filter form, request lifecycle, result presentation, and page navigation |
| `frontend/src/styles.css` | Responsive interface styles and visual states |

All application functions and methods are described with docstrings or JSDoc in their source files.
