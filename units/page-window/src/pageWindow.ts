/**
 * One page of a list, and whether to ask for another.
 *
 * The stop is `offset + returned >= total`. A `complete` flag is not an input.
 * A tail page can say it is not complete and still have nothing left. Stopping
 * on that flag fetches forever. Ignoring a short page (using the limit you
 * asked for instead of how many came back) stops too soon and drops the tail.
 */

export interface PageWindow {
  /** Zero-based index of the first item asked for. This function does not clamp it. */
  offset: number;
  /** How many items were asked for. This function does not clamp it. */
  limit: number;
}

/**
 * Safety cap on how many pages one walk may ask for.
 * Hitting it means the walk stopped unfinished. It is not proof the list ended.
 * The app calls this FAMILY_PAGE_WALK_MAX_PAGES.
 */
export const PAGE_WALK_MAX_PAGES = 50;

/** True when this window already holds everything `total` says exists. */
export function windowExhausted(offset: number, returned: number, total: number): boolean {
  return offset + returned >= total;
}

/**
 * `offset` and `limit` as a query string.
 * `includeOffset` defaults to true, which is the app's shipped walk.
 * Pass false and the offset key is omitted. The limit key is always written,
 * including `limit=0`. A zero limit is not dropped. The host should not ask
 * for one. Negative numbers are written as-is. This function does not validate.
 */
export function pageWindowParams(window: PageWindow, includeOffset = true): string {
  const params = new URLSearchParams();
  if (includeOffset) params.set("offset", String(window.offset));
  params.set("limit", String(window.limit));
  return params.toString();
}

/** Append the window to a URL. `?` if the URL has no query yet, otherwise `&`. */
export function withPageWindow(url: string, window: PageWindow, includeOffset = true): string {
  const params = pageWindowParams(window, includeOffset);
  if (params === "") return url;
  return `${url}${url.includes("?") ? "&" : "?"}${params}`;
}
