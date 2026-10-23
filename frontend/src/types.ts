/** Match the listing shape returned by the FastAPI search endpoint. */
export interface ListingFeatures {
  allowSmallDogs: boolean;
  allowLargeDogs: boolean;
  allowCats: boolean;
  elevator: boolean;
  pool: boolean;
  basement: boolean;
  utilitiesIncluded: boolean;
  dishwasher: boolean;
  furnished: boolean;
}

export type ListingFeatureKey = keyof ListingFeatures;

export interface Listing extends ListingFeatures {
  id: string;
  source: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  latitude: number;
  longitude: number;
  listedDate: string;
  status: string;
  description: string;
}

/** Represent one listing with its API-computed relevance score. */
export interface RankedListing {
  listing: Listing;
  score: number;
}

/** Match search results and page navigation metadata from the API. */
export interface SearchResponse {
  results: RankedListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/** Describe the structured error envelope returned by the API. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: { field: string; message: string }[];
  };
}
