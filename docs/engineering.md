# Engineering Guide

This document describes how to develop, validate, and extend the HomeFind listings search application. For component boundaries and the full request-flow diagram, see [architecture.md](./architecture.md). For the complete user-facing API reference and setup instructions, see the [README](../README.md).

## System boundaries

The application has a Python 3.10+ FastAPI backend and a React 18 + TypeScript frontend. The backend owns listing validation, search filters, ranking, pagination, and API error semantics. The frontend owns filter input, client-side field validation, request lifecycle and presentation. The JSON dataset is the current source of listing records.

| Area | Location | Responsibility |
| --- | --- | --- |
| Dataset and validation | `resource/sample_listings.json`, `backend/app/data.py`, `backend/app/models.py` | Load the JSON dataset once, validate rows, reject duplicate `(source, id)` identities, and define API models |
| Search and scoring | `backend/app/search.py`, `backend/app/scoring.py` | Apply filters, calculate relevance, order results deterministically, and paginate |
| HTTP API | `backend/app/main.py` | Validate query parameters, expose health/search/score routes, and convert errors to the API envelope |
| Frontend API boundary | `frontend/src/api.ts`, `frontend/src/types.ts` | Call the API and describe its success and error payloads |
| User interface | `frontend/src/App.tsx`, `frontend/src/FilterDialog.tsx`, `frontend/src/styles.css` | Collect filters, manage loading/error/result states, and render results and pagination |

The development server is configured to proxy `/api` to `http://127.0.0.1:8000` by `frontend/vite.config.ts`. Keep browser requests on the relative `/api` path so local development uses that proxy.

## Local development

Follow the setup steps in the [README](../README.md) to create the backend environment, install dependencies, and install frontend packages. Run the API and Vite development server in separate terminals.

From the repository root, the validation commands are:

```powershell
Set-Location backend
python -m pytest
```

```powershell
Set-Location frontend
npm run build
```

The backend tests use pytest and FastAPI's `TestClient`. The frontend build runs TypeScript project checks before bundling with Vite. There is currently no frontend test script in `frontend/package.json`.

## Request and data lifecycle

1. The UI validates budget and price fields, then serializes the active filter state into query parameters. Only enabled feature filters are sent.
2. A request is made to `GET /api/listings/search`. The UI aborts the previous request when its effect is cleaned up, preventing stale responses from replacing current state.
3. FastAPI validates individual parameters. The search service validates filter combinations and normalizes city and keyword values.
4. `load_listings()` reads and validates `resource/sample_listings.json` on first use and caches the resulting tuple for the process lifetime. Bad JSON, invalid listing rows, or duplicate `(source, id)` pairs fail explicitly.
5. The search service filters the dataset, computes scores, sorts the full matching set, and then slices the requested 1-based page.
6. The frontend displays the response and uses server-provided pagination metadata to enable navigation.

The score endpoint, `GET /api/listings/{source}/{listing_id}/score`, uses the same scoring function as search. Listing IDs are source-scoped; callers must supply both source and ID.

## API behavior to preserve

- Search requires a positive finite `targetBudget`. Page numbers start at 1; `pageSize` is 1–100.
- Minimum and maximum prices are inclusive. A minimum above the maximum is an invalid filter combination.
- City matching is trimmed, case-insensitive, and exact. Keyword matching is trimmed, case-insensitive, and searches listing descriptions for a substring.
- Enabled feature filters combine with AND: a result must have every selected feature explicitly set to `true`.
- Search ranks the complete filtered set before pagination. Ranking sorts by descending score, then ascending price, newer listing date, source, and ID.
- A city absent from the source returns `404 city_not_found`. A keyword absent from all descriptions returns `404 no_keyword_matches`. Other valid filter combinations can return an empty page with `200`; an out-of-range page retains the total match count.
- API errors use `{ "error": { "code", "message", "details" } }`. Keep error codes and response fields consistent with the frontend's handling.
- Search operates on every dataset status; it does not implicitly exclude any status.

The scoring formula and its rationale are documented in the [README](../README.md#relevance-scoring). When testing score-dependent ordering, pass an explicit `as_of` date to avoid depending on the system date.

## Extending the application

### Add or change a listing field

1. Confirm the source field and its type in the dataset and `resource/field-type-12.csv`.
2. Update the Pydantic `Listing` model in `backend/app/models.py`, including aliases, defaults, and constraints as appropriate.
3. Update the TypeScript listing types in `frontend/src/types.ts` if the field is returned by the API.
4. Update the UI or search/filter handling only if the field is user-facing or affects search.
5. Add backend tests for valid and invalid source data and for the API response shape.

### Add or change a search filter

1. Define the filter's validation and public query parameter in `backend/app/main.py`.
2. Implement the filtering behavior in `backend/app/search.py`; keep this module independent of HTTP concerns.
3. Wire the input and query serialization in `frontend/src/App.tsx`, and keep its state/type definitions synchronized.
4. Update the API documentation in the README if the public request contract changes.
5. Add tests for matching, non-matching, combined-filter behavior, and invalid input as applicable.

### Change ranking or pagination

Keep score calculation in `backend/app/scoring.py` and ordering/pagination in `backend/app/search.py`. Cover score boundaries, deterministic ties, page boundaries, and metadata in backend tests. Do not move authoritative ranking or pagination into the UI.

## Testing expectations

For backend behavior, prefer focused unit tests of `search_listings()` and `calculate_relevance_score()`, plus `TestClient` tests for the HTTP contract. Use explicit sample listings or the validated fixture dataset, and fixed dates for deterministic score assertions.

When changing the frontend/API boundary, run the frontend production build to catch TypeScript errors. Verify requests use the documented parameter names and that structured API failures continue to map to a useful UI state.

For changes that span both application layers, run both validation commands above and update the README or this guide if public behavior or the development workflow changes.
