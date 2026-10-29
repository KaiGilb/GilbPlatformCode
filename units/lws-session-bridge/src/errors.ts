// The two errors the platform client throws when it cannot sign a request. Copied from the app they came from, sentences
// included: the app's own code and tests test `instanceof` against them, so they are these classes and not the sign-in unit's.

/** Thrown when the bridge answers 401 — no/expired GilbPlatform session. The UI routes the
 * user through the GilbPlatform sign-in flow and retries.
 *
 * ⚠ THE MESSAGE IS USER-FACING COPY, not a log line — it is rendered under the avatar and
 * elsewhere. Two faults were measured in the previous wording (2026-09-17) and both are
 * fixed here:
 *   1. 🔴 It said "the Base flow". `Base` is a RETIRED PRODUCT NAME (renamed to Gilb /
 *      GilbPlatform / GilbApp). A user, verbatim: "it says Base, Base is no more". A dead product
 *      name in front of a person is a real defect, not cosmetic.
 *   2. It said "Not signed in" to someone who had just signed in seconds earlier, which reads
 *      as the app being wrong about them. What actually happened is that the SESSION could not
 *      be exchanged for a token, so the copy now says that and names the one action that helps.
 * ⛔ Do not shorten this back to a bare class-name-ish phrase; it is the sentence a person reads. */
export class NotSignedInError extends Error {
  constructor() {
    super("Your sign-in needs refreshing — sign in again, then try once more");
    this.name = "NotSignedInError";
  }
}

/** Thrown on 403 — CSRF header missing or this SPA origin is not allow-listed in the
 * GilbPlatform server's FIRST_PARTY_ORIGINS. A deployment problem, not a user problem.
 * ⚠ The `X-Base-Csrf` header name is a WIRE CONTRACT the server matches on and is deliberately
 * NOT renamed here — renaming it would 403 every write. Product naming and wire naming are two
 * different things and only one of them is a person's to read. */
export class OriginNotAllowedError extends Error {
  constructor(detail: string) {
    // ⚠ `Base` -> `GilbPlatform`. This sentence renders in the SAME red
    // panel as AdminGate.tsx's "the GilbPlatform server", three lines apart: one box, two
    // products, and the person cannot tell whether they are one thing. `FIRST_PARTY_ORIGINS`
    // is an env-var NAME and stays verbatim (ValPlan §7c leave-list) — product naming and
    // configuration naming are two different things and only one of them a person reads.
    super(
      `Token bridge refused this origin (add this app's origin to GilbPlatform's FIRST_PARTY_ORIGINS?): ${detail}`,
    );
    this.name = "OriginNotAllowedError";
  }
}
