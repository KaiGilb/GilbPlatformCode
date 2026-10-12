// The injectable transport.
//
// Every HTTP call the kit makes goes through a `Transport`. The default wraps `fetch`. A host
// that cannot or should not use the page's `fetch` (a Capacitor app on CapacitorHttp, a native
// bridge, a test, a server-side runtime) passes its own, and uses the kit's functions instead of
// re-implementing them.
//
// ⚠ Using a native bridge that sends no `Origin` header is NOT evidence that the platform admits
// your app. Such a request is outside the browser perimeter altogether. Admission is measured
// from a browser origin.

/** What the kit asks the transport to send. */
export interface TransportRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  /** Already-serialised body, or undefined. */
  body?: string;
  /** Browser cookie hint; a transport that holds no cookies may ignore it. */
  credentials?: "include" | "omit";
  /** Give up after this many milliseconds. */
  timeoutMs: number;
}

/** The part of a response the kit reads. A `fetch` `Response` satisfies it. */
export interface TransportResponse {
  status: number;
  json(): Promise<unknown>;
}

/**
 * Sends one request. Rejects (throws) when the server could not be reached; resolves with any
 * HTTP status, including errors.
 */
export type Transport = (url: string, req: TransportRequest) => Promise<TransportResponse>;

/**
 * The default transport: the global `fetch`, looked up when a request is made (not at import),
 * so importing the kit in a runtime without `fetch` is safe as long as another transport is passed.
 */
export const fetchTransport: Transport = (url, req) =>
  fetch(url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    credentials: req.credentials,
    signal: AbortSignal.timeout(req.timeoutMs),
  });

/** Per-call options shared by the kit's HTTP helpers. */
export interface HttpOptions {
  /** Defaults to {@link fetchTransport}. */
  transport?: Transport;
}
