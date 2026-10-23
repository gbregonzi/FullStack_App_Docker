import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchListings } from "./api";
import FilterDialog from "./FilterDialog";
import type { ListingFeatureKey, ListingFeatures, RankedListing, SearchResponse } from "./types";

interface Filters extends ListingFeatures {
  targetBudget: string;
  minPrice: string;
  maxPrice: string;
  minBedrooms: string;
  city: string;
  keyword: string;
  pageSize: string;
}

type ValidationErrors = Partial<Record<keyof Filters, string>>;

const initialFilters: Filters = {
  targetBudget: "450,000",
  minPrice: "",
  maxPrice: "",
  minBedrooms: "",
  city: "",
  keyword: "",
  pageSize: "5",
  allowSmallDogs: false,
  allowLargeDogs: false,
  allowCats: false,
  elevator: false,
  pool: false,
  basement: false,
  utilitiesIncluded: false,
  dishwasher: false,
  furnished: false,
};

/** Return field-level issues that should prevent a search request. */
function validateFilters(filters: Filters): ValidationErrors {
  const errors: ValidationErrors = {};
  const targetBudget = Number(filters.targetBudget.replace(/,/g, ""));
  const minPrice = filters.minPrice ? Number(filters.minPrice.replace(/,/g, "")) : undefined;
  const maxPrice = filters.maxPrice ? Number(filters.maxPrice.replace(/,/g, "")) : undefined;

  if (!filters.targetBudget.trim()) {
    errors.targetBudget = "Enter a target budget.";
  } else if (!Number.isFinite(targetBudget) || targetBudget <= 0) {
    errors.targetBudget = "Enter a budget greater than $0.";
  }
  if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) {
    errors.minPrice = "Enter a valid minimum price of $0 or more.";
  }
  if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
    errors.maxPrice = "Enter a valid maximum price of $0 or more.";
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    errors.maxPrice = "Maximum price must be at least the minimum price.";
  }

  return errors;
}

/** Add thousands separators to an integer amount without converting its precision. */
function formatAmount(value: string): string {
  const digits = value.replace(/,/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Render the search experience, results, request states, and pagination. */
export default function App() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [submitted, setSubmitted] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorDescription, setErrorDescription] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isFilterWindowOpen, setIsFilterWindowOpen] = useState(false);

  /** Build query parameters and synchronize the matching API page state. */
  const runSearch = useCallback(
    async (activeFilters: Filters, activePage: number, signal: AbortSignal) => {
      const params = new URLSearchParams({
        targetBudget: activeFilters.targetBudget.replace(/,/g, ""),
        page: String(activePage),
        pageSize: activeFilters.pageSize,
      });
      const optionalFilters: [keyof Filters, string][] = [
        ["minPrice", activeFilters.minPrice.replace(/,/g, "")],
        ["maxPrice", activeFilters.maxPrice.replace(/,/g, "")],
        ["minBedrooms", activeFilters.minBedrooms],
        ["city", activeFilters.city.trim()],
        ["keyword", activeFilters.keyword.trim()],
      ];
      optionalFilters.forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const featureFilters: ListingFeatureKey[] = [
        "allowSmallDogs",
        "allowLargeDogs",
        "allowCats",
        "elevator",
        "pool",
        "basement",
        "utilitiesIncluded",
        "dishwasher",
        "furnished",
      ];
      featureFilters.forEach((key) => {
        if (activeFilters[key]) params.set(key, "true");
      });

      setLoading(true);
      setErrorDescription(null);
      try {
        const response = await fetchListings(params, signal);
        setData(response);
      } catch (requestError) {
        if (!signal.aborted) {
          setData(null);
          if (requestError instanceof ApiRequestError && requestError.code === "city_not_found") {
            setErrorDescription(null);
            setValidationErrors((current) => ({
              ...current,
              city: "We couldn't find listings in that city. Check the spelling or try another city.",
            }));
          } else if (requestError instanceof ApiRequestError && requestError.code === "no_keyword_matches") {
            setErrorDescription(null);
            setValidationErrors((current) => ({
              ...current,
              keyword: "No listings match this keyword with the current filters. Try another term.",
            }));
          } else {
            setErrorDescription(
              requestError instanceof Error
                ? requestError.message
                : "The listings request failed. Please try again.",
            );
          }
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void runSearch(submitted, page, controller.signal);
    return () => controller.abort();
  }, [submitted, page, runSearch]);

  /** Update one field without discarding the other current filter values. */
  function updateFilter(field: keyof Filters, value: string): void {
    setFilters((current) => ({ ...current, [field]: value }));
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (field === "minPrice" || field === "maxPrice") {
        delete next.minPrice;
        delete next.maxPrice;
      }
      return next;
    });
  }

  /** Accept digits with optional grouping commas for currency fields. */
  function updateAmountFilter(
    field: "targetBudget" | "minPrice" | "maxPrice",
    value: string,
  ): void {
    if (/^[\d,]*$/.test(value)) updateFilter(field, value.replace(/,/g, ""));
  }

  /** Update one property feature without discarding other filter values. */
  function updateFeatureFilter(field: ListingFeatureKey, value: boolean): void {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  /** Clear the property-feature filters shown in the filter dialog. */
  function clearFeatureFilters(): void {
    setFilters((current) => ({
      ...current,
      allowSmallDogs: false,
      allowLargeDogs: false,
      allowCats: false,
      elevator: false,
      pool: false,
      basement: false,
      utilitiesIncluded: false,
      dishwasher: false,
      furnished: false,
    }));
  }

  /** Validate and submit the current filters from the dialog. */
  function applyFeatureFilters(): void {
    const errors = validateFilters(filters);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setIsFilterWindowOpen(false);
      return;
    }
    setPage(1);
    setSubmitted({ ...filters });
    setIsFilterWindowOpen(false);
  }

  /** Validate filters before submitting from the first page. */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const errors = validateFilters(filters);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPage(1);
    setSubmitted({ ...filters });
  }

  /** Move to a page only when the current response confirms it is available. */
  function changePage(nextPage: number): void {
    if (!data || nextPage < 1 || nextPage > data.totalPages || loading) return;
    setPage(nextPage);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="HomeFind home">
          <span className="brand-mark">H</span>
          <span>homefind</span>
        </a>
        <span className="topbar-note">A better way to find your place</span>
      </header>

      <section className="hero">
        <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
        <h1>Find a place<br />to call <em>home.</em></h1>
        <p className="hero-copy">Thoughtful search. The right homes, ranked around your budget.</p>
      </section>

      <section className="search-panel" aria-labelledby="search-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">DISCOVER YOUR OPTIONS</p>
            <h2 id="search-title">Search listings</h2>
          </div>
          <div className="panel-heading-actions">
            <button
              type="button"
              className="button search-button-filter"
              onClick={() => setIsFilterWindowOpen(true)}
            >
              <span aria-hidden="true" className="filter-button-icon">
                <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                  <path d="M2 2.5h12L9.5 8v4.5l-3 1.5V8L2 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              More Filters
            </button>
            <span className="panel-icon" aria-hidden="true">⌕</span>
          </div>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="filter-grid">
            <label className="field field-budget">
              <span>Target budget <b aria-hidden="true">*</b></span>
              <span className={`input-prefix${validationErrors.targetBudget ? " field-invalid" : ""}`}>
                <span>$</span>
                <input
                  aria-label="Target budget"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={Boolean(validationErrors.targetBudget)}
                  aria-describedby={validationErrors.targetBudget ? "targetBudget-error" : undefined}
                  value={filters.targetBudget}
                  onFocus={(event) => updateAmountFilter("targetBudget", event.target.value.replace(/,/g, ""))}
                  onChange={(event) => updateAmountFilter("targetBudget", event.target.value)}
                  onBlur={(event) => updateFilter("targetBudget", formatAmount(event.target.value))}
                />
              </span>
              {validationErrors.targetBudget && (
                <span className="field-error" id="targetBudget-error">{validationErrors.targetBudget}</span>
              )}
            </label>
            <label className="field">
              <span>Minimum price</span>
              <span className={`input-prefix${validationErrors.minPrice ? " field-invalid" : ""}`}>
                <span>$</span>
                <input
                  aria-label="Minimum price"
                  type="text"
                  inputMode="numeric"
                  placeholder="No minimum"
                  aria-invalid={Boolean(validationErrors.minPrice)}
                  aria-describedby={validationErrors.minPrice ? "minPrice-error" : undefined}
                  value={filters.minPrice}
                  onFocus={(event) => updateAmountFilter("minPrice", event.target.value.replace(/,/g, ""))}
                  onChange={(event) => updateAmountFilter("minPrice", event.target.value)}
                  onBlur={(event) => updateFilter("minPrice", formatAmount(event.target.value))}
                />
              </span>
              {validationErrors.minPrice && (
                <span className="field-error" id="minPrice-error">{validationErrors.minPrice}</span>
              )}
            </label>
            <label className="field">
              <span>Maximum price</span>
              <span className={`input-prefix${validationErrors.maxPrice ? " field-invalid" : ""}`}>
                <span>$</span>
                <input
                  aria-label="Maximum price"
                  type="text"
                  inputMode="numeric"
                  placeholder="No maximum"
                  aria-invalid={Boolean(validationErrors.maxPrice)}
                  aria-describedby={validationErrors.maxPrice ? "maxPrice-error" : undefined}
                  value={filters.maxPrice}
                  onFocus={(event) => updateAmountFilter("maxPrice", event.target.value.replace(/,/g, ""))}
                  onChange={(event) => updateAmountFilter("maxPrice", event.target.value)}
                  onBlur={(event) => updateFilter("maxPrice", formatAmount(event.target.value))}
                />
              </span>
              {validationErrors.maxPrice && (
                <span className="field-error" id="maxPrice-error">{validationErrors.maxPrice}</span>
              )}
            </label>
            <label className="field">
              <span>Minimum bedrooms</span>
              <select
                aria-label="Minimum bedrooms"
                value={filters.minBedrooms}
                onChange={(event) => updateFilter("minBedrooms", event.target.value)}
              >
                <option value="">Any bedrooms</option>
                {[1, 2, 3, 4, 5].map((bedrooms) => (
                  <option key={bedrooms} value={bedrooms}>{bedrooms}+</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>City</span>
              <input
                aria-label="City"
                type="text"
                placeholder="Any city"
                maxLength={100}
                aria-invalid={Boolean(validationErrors.city)}
                aria-describedby={validationErrors.city ? "city-error" : undefined}
                value={filters.city}
                onChange={(event) => updateFilter("city", event.target.value)}
              />
              {validationErrors.city && (
                <span className="field-error" id="city-error">{validationErrors.city}</span>
              )}
            </label>
            <label className="field field-keyword">
              <span>Keywords in description</span>
              <input
                aria-label="Keywords in description"
                type="search"
                placeholder="Try “garden”, “metro”, “updated kitchen”"
                maxLength={200}
                aria-invalid={Boolean(validationErrors.keyword)}
                aria-describedby={validationErrors.keyword ? "keyword-error" : undefined}
                value={filters.keyword}
                onChange={(event) => updateFilter("keyword", event.target.value)}
              />
              {validationErrors.keyword && (
                <span className="field-error" id="keyword-error">{validationErrors.keyword}</span>
              )}
            </label>
            <label className="field">
              <span>Results per page</span>
              <select
                aria-label="Results per page"
                value={filters.pageSize}
                onChange={(event) => updateFilter("pageSize", event.target.value)}
              >
                {[5, 10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>{size} listings</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-footer">
            <p><b>*</b> Budget helps us rank homes that fit you best.</p>
            <button
              className="search-button"
              type="submit"
              disabled={loading || Object.keys(validationErrors).length > 0}
            >
              {loading ? "Searching…" : "Search homes"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>

      {isFilterWindowOpen && (
        <FilterDialog
          filters={filters}
          onFeatureChange={updateFeatureFilter}
          onClearFilters={clearFeatureFilters}
          onApply={applyFeatureFilters}
          onClose={() => setIsFilterWindowOpen(false)}
        />
      )}

      <section className="results-section" aria-live="polite">
        <div className="results-heading">
          <div>
            <p className="eyebrow">CURATED FOR YOU</p>
            <h2>{loading ? "Finding your matches…" : "Your matches"}</h2>
          </div>
          {data && !loading && (
            <span className="result-count">
              {data.total} {data.total === 1 ? "home" : "homes"}
            </span>
          )}
        </div>

        {loading && (
          <div className="state-card" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Finding homes that fit your search…</span>
          </div>
        )}
        {!loading && errorDescription && (
          <div className="state-card error-state" role="alert">
            <span className="state-symbol">!</span>
            <div><strong>We couldn’t complete that search.</strong><p>{errorDescription}</p></div>
          </div>
        )}
        {!loading && !errorDescription && data?.results.length === 0 && (
          <div className="state-card empty-state">
            <span className="state-symbol">⌕</span>
            <div><strong>No homes found just yet.</strong><p>Try broadening your filters or choosing another city.</p></div>
          </div>
        )}
        {!loading && !errorDescription && data && data.results.length > 0 && (
          <>
            <div className="listing-grid">
              {data.results.map((result) => (
                <ListingCard key={`${result.listing.source}:${result.listing.id}`} result={result} />
              ))}
            </div>
            <nav className="pagination" aria-label="Listing result pages">
              <button
                className="page-button"
                type="button"
                onClick={() => changePage(page - 1)}
                disabled={!data.hasPrevious || loading}
              >
                <span aria-hidden="true">←</span> Previous
              </button>
              <span className="page-status">
                Page <strong>{data.page}</strong> of <strong>{data.totalPages}</strong>
              </span>
              <button
                className="page-button"
                type="button"
                onClick={() => changePage(page + 1)}
                disabled={!data.hasNext || loading}
              >
                Next <span aria-hidden="true">→</span>
              </button>
            </nav>
          </>
        )}
      </section>
      <footer className="page-footer">HOMEFIND <span>·</span> A little closer to home.</footer>
    </main>
  );
}

/** Display one ranked listing as a compact, accessible result card. */
function ListingCard({ result }: { result: RankedListing }) {
  const { listing } = result;
  return (
    <article className="listing-card">
      <div className="card-art" aria-hidden="true">
        <div className="art-sun" />
        <div className="art-house">
          <div className="art-roof" />
          <div className="art-wall">
            <i /><i /><b />
          </div>
        </div>
        <div className="art-ground" />
        <span className="art-tag">{listing.status}</span>
      </div>
      <div className="card-content">
        <div className="card-price-row">
          <strong className="card-price">{formatPrice(listing.price)}</strong>
          <span className="score-badge"><span aria-hidden="true">✦</span> {result.score.toFixed(1)} match</span>
        </div>
        <h3>{listing.address}</h3>
        <p className="card-location">{listing.city}, {listing.state} {listing.zip} </p>
        <div className="card-details-1">
          <span><b>Listed: {listing.listedDate}</b></span>
        </div>
        <div className="card-details">
          <span><b>{listing.bedrooms}</b> beds</span>
          <span><b>{listing.bathrooms}</b> baths</span>
          <span><b>{listing.sqft.toLocaleString()}</b> sqft</span>
        </div>
        <p className="card-description">{listing.description}</p>
      </div>
    </article>
  );
}

/** Format a numeric USD listing price for display. */
function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}
