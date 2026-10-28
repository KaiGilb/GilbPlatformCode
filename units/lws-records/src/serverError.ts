// The ONE reader for a Base failure body — turns a refused response into the sentence the
// server actually sent, never into the machine name it happened to be filed under.
//
// 🔴 WHY THIS FILE EXISTS. Kai was refused four times on production and shown one word each
// time: `BadRequest`. The server was not at fault. Base's error handler emits BOTH fields —
//
//     {"error":"BadRequest","message":"parentVault is not a known vault entity: https://…/base"}
//
// (`app.setErrorHandler` → `{ error: err.name, message: err.message }`, and
// `BadRequestError.name === "BadRequest"`), and `createVault.ts` read `error` FIRST. It rendered
// the class name and discarded the only sentence in the payload.
//
// ⚠ THE SAME HANDLER RETURNS THE OPPOSITE SHAPE TOO, and that is not a bug to route around.
// `POST /base/vault/create-named`'s own `catch` answers `reply.code(400); return { error: err.message }`
// — the SENTENCE in the `error` field, no `message` at all. Its 404 twin does the same
// (`{ error: "No D1b account found for principal …" }`). So a fix that merely swaps the
// preference order to `message ?? error` fixes one refusal and re-breaks the other.
// ⇒ This reader does not choose by FIELD NAME. It chooses by WHICH FIELD CARRIES A SENTENCE.
//
// ⛔ It never invents a cause. The client does not know why a vault could not be minted; it knows
// what the server said. Where the server said nothing, the reader says exactly that and gives
// the reader of the screen something to carry to whoever can look — it does not guess.

/** The two fields Base ever puts failure text in. Either may hold the sentence; either may hold a token. */
export interface ServerErrorBody {
  error?: unknown;
  message?: unknown;
}

/**
 * The tail appended when NOTHING in the body reads as a reason. Deliberately says what was
 * observed (no reason arrived) and offers an act — ⛔ never a guess at the cause.
 */
export const NO_REASON_TAIL = "no reason was sent — copy this line if you report it";

/**
 * Does this value read as a REASON a person can act on, rather than a machine token?
 *
 * The test is whitespace, and it is chosen because it is the one property that separates the
 * two real shapes without a hardcoded token list that would rot the moment Base adds an error
 * class. `BadRequest` / `Forbidden` / `NotFound` / `InternalServerError` are single tokens;
 * `parentVault is not a known vault entity: …` and `You do not own parent vault … — nest only under
 * vaults you have minted` are sentences.
 *
 * ⚠ A single long token (a bare URI) is NOT promoted to a reason. It names a thing without
 * saying what is wrong with it, so it goes down the degenerate path where it is shown WITH the
 * status and an act, rather than alone.
 */
export function carriesReason(value: unknown): value is string {
  return typeof value === "string" && /\S/.test(value) && /\s/.test(value.trim());
}

/** A non-empty trimmed string — a token when {@link carriesReason} is false. */
function token(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Parse a failure body the way every relay site needs it: JSON when it is JSON, and the raw
 * text as a `message` when it is not (a proxy's HTML 502, a bare string body). Never throws.
 */
export function parseServerErrorBody(text: string | null | undefined): ServerErrorBody {
  const raw = (text ?? "").trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ServerErrorBody;
    // A JSON scalar body (`"boom"`, `42`) is still text the server chose to send.
    return { message: String(parsed) };
  } catch {
    return { message: raw };
  }
}

/**
 * The user-facing text for a refused request.
 *
 * @param status the HTTP status, shown ONLY when no reason arrived (a sentence needs no decoration)
 * @param source the parsed body, or the raw response text (parsed here)
 * @param fallbackLabel what to call the act when the body names nothing at all —
 *        e.g. `"Create vault failed"`. ⛔ Must not assert a cause.
 *
 * Order of preference:
 *  1. `message` when it carries a sentence  — Base's `setErrorHandler` shape
 *  2. `error`   when it carries a sentence  — the route-`catch` shape (message IN the error field)
 *  3. the machine token that IS present, plus the status and an act the user can take
 *  4. `fallbackLabel`, plus the status and an act — the body named nothing
 */
export function serverErrorText(
  status: number,
  source: unknown,
  fallbackLabel = "Request failed",
): string {
  const body: ServerErrorBody =
    typeof source === "string"
      ? parseServerErrorBody(source)
      : source && typeof source === "object"
        ? (source as ServerErrorBody)
        : {};

  if (carriesReason(body.message)) return body.message.trim();
  if (carriesReason(body.error)) return body.error.trim();

  // Degenerate: a token, or nothing. ⛔ NEVER a bare token on its own — that is the whole
  // defect this module exists to stop. The token is kept (it is the only thing the server
  // said) and carried with the status and an act.
  const machineName = token(body.error) ?? token(body.message);
  const head = machineName ?? fallbackLabel;
  return `${head} (HTTP ${status}) — ${NO_REASON_TAIL}`;
}

/**
 * The server's own sentence, or `null` when the body carried none.
 *
 * For the call sites that already own a correct, specific sentence of their own (a typed
 * error like `RecordForbiddenError`) and want to APPEND the server's reason rather than
 * replace it. ⛔ Returns null rather than a token — appending `"BadRequest"` to a sentence
 * adds nothing a reader can act on.
 */
export function serverReasonOrNull(source: unknown): string | null {
  const body: ServerErrorBody =
    typeof source === "string"
      ? parseServerErrorBody(source)
      : source && typeof source === "object"
        ? (source as ServerErrorBody)
        : {};
  if (carriesReason(body.message)) return body.message.trim();
  if (carriesReason(body.error)) return body.error.trim();
  return null;
}
