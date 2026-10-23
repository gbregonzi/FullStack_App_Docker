import type { ApiErrorBody, SearchResponse } from "./types";

/** Carry the structured API error code alongside its user-facing message. */
export class ApiRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

/** Send the current search options to the API and return a typed page. */
export async function fetchListings(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<SearchResponse> {
  const response = await fetch(`/api/listings/search?${params.toString()}`, { signal });
  const body: unknown = await response.json();
  if (!response.ok) {
    const apiError = body as ApiErrorBody;
    throw new ApiRequestError(
      apiError.error?.code ?? "request_failed",
      apiError.error?.message ?? "The listings request failed.",
    );
  }
  return body as SearchResponse;
}
