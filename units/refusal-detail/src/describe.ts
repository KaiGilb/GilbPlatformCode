// One plain sentence for an error a person reads. Entry "./describe": it imports only ./refusal, so the root entry is unchanged.
import { NoAccessError, VaultBusyError } from "./refusal";

export interface DescribeOptions {
  /** The sentence for a record that changed elsewhere (a 412 or 428, or a `RecordConflictError`). Default: {@link DESCRIBE_WORDS}.conflict */
  conflict?: string;
  /**
   * The host's own mapper for errors this unit cannot know (for example picture errors). It is asked after the refusals, the sign-in and the
   * conflict, and before the network and the fallback. A sentence ends the search; `null` or `undefined` lets it go on.
   */
  more?(err: unknown): string | null | undefined;
  /** The sentence for an error nothing matched. Default: {@link DESCRIBE_WORDS}.fallback */
  fallback?: string;
}

export const DESCRIBE_WORDS = {
  signedOut: "Sign in again.",
  offline: "No connection. Try again.",
  conflict: "This changed elsewhere. Reload and try again.",
  fallback: "Something went wrong. Try again.",
} as const;

const OFFLINE_MESSAGE = /failed to fetch|fetch failed|network ?error|load failed|offline/i;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const field = (e: unknown, key: string): unknown => (e !== null && typeof e === "object" ? (e as Record<string, unknown>)[key] : undefined);
const nameOf = (e: unknown): string | null => text(field(e, "name"));
const statusOf = (e: unknown): number | null => {
  const s = field(e, "status");
  return typeof s === "number" ? s : null;
};

/** The sentence the platform itself sent, from any of the places the units keep it (or a `RefusalDetail` from `readRefusal`). */
function platformSentenceOf(e: unknown): string | null {
  for (const key of ["platformSentence", "platformMessage", "serverSentence", "reason"]) {
    const s = text(field(e, key));
    if (s) return s;
  }
  const detail = field(e, "detail");
  const fromDetail = text(field(detail, "sentence"));
  if (fromDetail) return fromDetail;
  // A RefusalDetail given as it is: { method, path, status, sentence }.
  return typeof field(e, "method") === "string" && typeof field(e, "path") === "string" ? text(field(e, "sentence")) : null;
}

/**
 * One plain sentence for any error a screen shows. In this order:
 * 1. `NoAccessError` and `VaultBusyError`: their own message. A 403 (`RecordForbiddenError`): its message.
 * 2. A sign-in that is gone (`NotSignedInError`, or any error with status 401 and no platform sentence): "Sign in again."
 * 3. A request the platform refused with a sentence (`RequestRefusedError`, a `serverSentence`, `platformSentence`, `reason`, or the `sentence` of a `RefusalDetail`): that sentence.
 * 4. A record changed elsewhere (`RecordConflictError`, status 412 or 428): `o.conflict`.
 * 5. `o.more(err)`.
 * 6. A network failure (a `TypeError`, an offline browser, or a "failed to fetch" message): "No connection. Try again."
 * 7. `o.fallback`. A raw message, a stack or a status is never shown.
 * It matches by class where this unit holds the class and by `name` and `status` for the rest, so it needs no other unit.
 */
export function describeError(err: unknown, o: DescribeOptions = {}): string {
  if (err instanceof NoAccessError || err instanceof VaultBusyError) return err.message;
  const name = nameOf(err);
  const status = statusOf(err);
  if (name === "RecordForbiddenError") return text(field(err, "message")) ?? DESCRIBE_WORDS.fallback;
  if (name === "NotSignedInError") return DESCRIBE_WORDS.signedOut;
  const sentence = platformSentenceOf(err);
  if (sentence) return sentence;
  if (status === 401) return DESCRIBE_WORDS.signedOut;
  if (name === "RecordConflictError" || status === 412 || status === 428) return o.conflict ?? DESCRIBE_WORDS.conflict;
  const more = o.more?.(err);
  if (more) return more;
  const message = text(field(err, "message")) ?? "";
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (err instanceof TypeError || offline || OFFLINE_MESSAGE.test(message)) return DESCRIBE_WORDS.offline;
  return o.fallback ?? DESCRIBE_WORDS.fallback;
}
