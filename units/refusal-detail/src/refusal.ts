// A refused request as one readable line, and the typed errors that carry it.
import { parseServerErrorBody, serverErrorText } from "@kaigilb/gilbplatformcode-server-error";

/** What the server answered to a refused request: method, URL path (no query, no headers, no tokens), status, its own sentence. */
export type RefusalDetail = { method: string; path: string; status: number; sentence: string | null };

/** One plain line for the Details block and the console. */
export const refusalLine = (d: RefusalDetail): string => `${d.method} ${d.path} -> HTTP ${d.status}${d.sentence ? ` - ${d.sentence}` : " - no sentence was sent"}`;

/** The person may read but not write here. `serverSentence` is the server's own words, when it sent any. The UI says its own sentence. */
export class NoAccessError extends Error {
  readonly serverSentence: string | null;
  readonly detail: RefusalDetail | null;
  constructor(serverSentence: string | null = null, detail: RefusalDetail | null = null, message = "You have no write access here yet. Ask the owner.") {
    super(message);
    this.name = "NoAccessError";
    this.serverSentence = serverSentence;
    this.detail = detail;
  }
}

/** The vault (or the edge in front of it) answered 502, 503 or 504: busy or unreachable for now. Retried like a network failure. */
export class VaultBusyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VaultBusyError";
    this.status = status;
  }
}

/** The refusal a response carries, as a RefusalDetail. Call it only for a response you already treat as refused. Source: plants.ts readRefused. The path keeps percent-encoding (an encoded slash stays %2F) and drops the query. */
export async function readRefusal(method: string, url: string, res: Response): Promise<RefusalDetail> {
  const text = await res.text().catch(() => "");
  const body = parseServerErrorBody(text);
  const sentence = serverErrorText(res.status, body, "Refused");
  return { method, path: new URL(url).pathname.replace(/%2F/gi, "%2F"), status: res.status, sentence };
}

/**
 * True when the platform refused this request as forbidden (403): a `NoAccessError`, or any error that carries `status` 403
 * (a `PlatformError` or `RecordListError` from record-sync, a `RecordForbiddenError` from lws-records, a `RefusalDetail`), or whose
 * `name` is `NoAccessError` or `RecordForbiddenError` (an error from another copy of those classes). It matches by `status` and `name`,
 * not by importing those units. A 401, 404, 412 or 5xx is not forbidden, and neither is anything that is not an object.
 */
export function isForbidden(err: unknown): boolean {
  if (err instanceof NoAccessError) return true;
  if (typeof err !== "object" || err === null) return false;
  const { name, status } = err as { name?: unknown; status?: unknown };
  return status === 403 || name === "NoAccessError" || name === "RecordForbiddenError";
}
