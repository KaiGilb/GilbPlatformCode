/**
 * Turn a refused response into the sentence the server sent.
 *
 * Do not pick a field by name. One route puts the sentence in `message` and a
 * machine token such as `BadRequest` in `error`. Another route puts the sentence
 * in `error` and sends no `message`. Choose the field that contains a sentence.
 *
 * A sentence is a string that still contains whitespace after trimming. A single
 * token, including a bare address, is not a sentence.
 */

export interface ServerErrorBody {
  error?: unknown;
  message?: unknown;
}

/** Appended when the body carried no sentence. It does not guess a cause. */
export const NO_REASON_TAIL = "no reason was sent — copy this line if you report it";

/** True when `value` is a non-empty string that still has whitespace after trim. */
export function carriesReason(value: unknown): value is string {
  return typeof value === "string" && /\S/.test(value) && /\s/.test(value.trim());
}

function token(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * JSON when the text is JSON. Otherwise the raw text becomes `message`.
 * Never throws. An empty string yields `{}`.
 * A JSON array or scalar is stringified into `message` (an array becomes the
 * joined text, so `[1,2]` becomes `"1,2"`).
 */
export function parseServerErrorBody(text: string | null | undefined): ServerErrorBody {
  const raw = (text ?? "").trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ServerErrorBody;
    }
    return { message: String(parsed) };
  } catch {
    return { message: raw };
  }
}

function asBody(source: unknown): ServerErrorBody {
  if (typeof source === "string") return parseServerErrorBody(source);
  if (source && typeof source === "object" && !Array.isArray(source)) {
    return source as ServerErrorBody;
  }
  return {};
}

/**
 * The line to show for a refused request.
 *
 * 1. `message` when it is a sentence.
 * 2. `error` when it is a sentence.
 * 3. Otherwise the token that was present, the status, and {@link NO_REASON_TAIL}.
 * 4. If there was no token, `fallbackLabel` fills that place. Default: `Request failed`.
 *
 * Only strings count. A numeric `message` is ignored, not turned into text.
 * This function does not decide whether the status itself is a failure.
 */
export function serverErrorText(
  status: number,
  source: unknown,
  fallbackLabel = "Request failed",
): string {
  const body = asBody(source);
  if (carriesReason(body.message)) return body.message.trim();
  if (carriesReason(body.error)) return body.error.trim();
  const machineName = token(body.error) ?? token(body.message);
  const head = machineName ?? fallbackLabel;
  return `${head} (HTTP ${status}) — ${NO_REASON_TAIL}`;
}

/**
 * The server's sentence, or null when the body had none.
 * A token is null, not appended. Use this when the host already has its own sentence.
 */
export function serverReasonOrNull(source: unknown): string | null {
  const body = asBody(source);
  if (carriesReason(body.message)) return body.message.trim();
  if (carriesReason(body.error)) return body.error.trim();
  return null;
}
