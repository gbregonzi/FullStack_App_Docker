import type { ListingFeatureKey, ListingFeatures } from "./types";

interface FilterDialogProps {
  filters: ListingFeatures;
  onFeatureChange: (field: ListingFeatureKey, value: boolean) => void;
  onClearFilters: () => void;
  onApply: () => void;
  onClose: () => void;
}

const featureOptions: { field: ListingFeatureKey; label: string }[] = [
  { field: "allowSmallDogs", label: "Allow small dogs" },
  { field: "allowLargeDogs", label: "Allow large dogs" },
  { field: "allowCats", label: "Allow cats" },
  { field: "elevator", label: "Elevator" },
  { field: "pool", label: "Pool" },
  { field: "basement", label: "Basement" },
  { field: "utilitiesIncluded", label: "Utilities included" },
  { field: "dishwasher", label: "Dishwasher" },
  { field: "furnished", label: "Furnished" },
];

export default function FilterDialog({
  filters,
  onFeatureChange,
  onClearFilters,
  onApply,
  onClose,
}: FilterDialogProps) {
  return (
    <div className="filter-window-backdrop" onClick={onClose}>
      <div
        className="filter-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-window-title"
        onClick={(event) => event.stopPropagation()}
      >
        <form
          className="filter-window-form"
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <div className="filter-window-header">
            <div>
              <p className="eyebrow">REFINE YOUR SEARCH</p>
              <h3 id="filter-window-title">More filters</h3>
            </div>
            <button
              type="button"
              className="filter-window-close"
              onClick={onClose}
              aria-label="Close filters dialog"
            >
              ×
            </button>
          </div>
          <fieldset className="filter-window-features">
            <legend>Property features</legend>
            <div className="filter-window-feature-grid">
              {featureOptions.map(({ field, label }) => (
                <label className="filter-window-feature" key={field}>
                  <input
                    type="checkbox"
                    checked={filters[field]}
                    onChange={(event) => onFeatureChange(field, event.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="filter-window-footer">
            <button type="button" className="search-button" onClick={onClearFilters}>
              Clear filters
            </button>
            <button type="button" className="filter-window-secondary" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="search-button">
              Apply filters
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
