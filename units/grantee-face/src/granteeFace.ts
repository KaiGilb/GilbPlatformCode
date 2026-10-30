/**
 * Faces for the people who hold access: the picture beside a name on a vault's access list.
 *
 * WHY A SECOND REQUEST AT ALL. The name is already in the access-list response, so this module
 * never re-fetches it. A face is bytes, and bytes are never a field, so one authenticated GET per
 * holder is the floor, not a waterfall. What the platform could still add is a `hasPhoto` (or
 * `photoUrl`) flag on the access row: without it this module must ASK to discover that a holder
 * has no photo, and that 404 is a request a complete first response would have made unnecessary.
 * Do not "fix" it here by guessing from the key shape (see below).
 *
 * NO SHAPE TEST DECIDES WHO GETS ASKED. On this deployment a person principal and a vault id are
 * the SAME STRING SHAPE, so "only ask for the ones that look like people" cannot be written
 * correctly. Every holder is asked; a holder with no visible photo answers 404 and that answer is
 * remembered.
 *
 * The three round-trip duties, all discharged here rather than at the call site:
 *   - BOUNDED: {@link MAX_GRANTEE_FACES} is a literal cap in code. A list longer than the cap
 *     renders initials past it. A catalogue answer never decides how many requests we issue.
 *   - CONCURRENT: callers fire independently and the loads overlap; there is no `for ... await`
 *     over holders.
 *   - VIEWER-KEYED REUSE: the body is `private, no-store` and viewer-dependent, so it may never be
 *     HTTP-cached, but the PROCESS must not ask twice. Results are memoised per viewer principal,
 *     and simultaneous callers for one holder share a single in-flight promise.
 *
 * Errors are NOT remembered, only a definite 404 ("this viewer sees no photo here") is. A
 * network failure that is cached becomes a permanent blank face for the rest of the session.
 *
 * Display is an authenticated fetch to an object URL, never a bare `<img src>`: the browser
 * attaches no Bearer/DPoP to an image tag, so a bare tag silently downgrades an entitled read to
 * the anonymous rung and renders "no photo" for a photo the viewer is entitled to see.
 */

import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";

/**
 * The literal cap on how many faces one render may fetch. Chosen to cover an ordinary vault's
 * holder list whole while refusing to let a long list turn one pane into a request storm; past
 * it, rows render their initial, which is a complete row, not a broken one.
 */
export const MAX_GRANTEE_FACES = 24;

/** The platform's mediated, rung-gated photo route. Never a raw `/files/<id>`: that is a file id in a card body. */
const photoUrlFor = (principal: string): string =>
  `${baseOrigin()}/base/connect/profile-photo?principal=${encodeURIComponent(principal)}`;

/** `null` = asked, and this viewer sees no photo for that holder. Absent = never asked. */
type FaceCache = Map<string, string | null>;

/** Which viewer the memo below belongs to. A change wipes it: one viewer's entitled bytes are never another's. */
let cachedViewer: string | null | undefined;
let faces: FaceCache = new Map();
const inFlight = new Map<string, Promise<string | null>>();

/** Drops every memoised face and revokes the object URLs it owns. */
function wipe(): void {
  for (const url of faces.values()) if (url) URL.revokeObjectURL(url);
  faces = new Map();
  inFlight.clear();
}

/**
 * Resets the face memo. Call it on sign-out and between tests: without it a second sign-in
 * paints the previous viewer's faces.
 */
export function resetGranteeFaces(): void {
  wipe();
  cachedViewer = undefined;
}

/** Re-keys the memo when the signed-in identity changes. */
function ensureViewer(viewer: string | null): void {
  if (cachedViewer === viewer) return;
  wipe();
  cachedViewer = viewer;
}

/**
 * Reads an already-decided face without asking the platform, so a re-render paints instantly and a
 * caller can tell "no photo" (`null`) from "not asked yet" (`undefined`).
 *
 * @param principal the holder's authorization key, verbatim
 * @param viewer the signed-in principal this answer belongs to
 * @returns the object URL, `null` when this viewer sees no photo, `undefined` when unasked
 */
export function peekGranteeFace(
  principal: string,
  viewer: string | null,
): string | null | undefined {
  ensureViewer(viewer);
  return faces.get(principal);
}

/**
 * Loads one holder's face as an object URL, at most once per viewer.
 *
 * @param principal the holder's authorization key, verbatim (never re-derived from a display string)
 * @param viewer the signed-in principal, the memo key, because the route answers per viewer
 * @returns the object URL, or `null` when this viewer sees no photo for that holder
 */
export async function loadGranteeFace(
  principal: string,
  viewer: string | null,
): Promise<string | null> {
  ensureViewer(viewer);
  const known = faces.get(principal);
  if (known !== undefined) return known;
  const running = inFlight.get(principal);
  if (running) return running;

  const run = (async (): Promise<string | null> => {
    const url = photoUrlFor(principal);
    const res = await fetch(url, {
      method: "GET",
      headers: { ...(await dpopReadAuth("GET", url)) },
    });
    if (res.status === 404) {
      // A definite answer about this viewer and this holder: remember it, so the 404 is paid once.
      faces.set(principal, null);
      return null;
    }
    if (!res.ok) {
      // Not remembered. A 401/5xx says nothing about whether a photo exists, and storing it
      // would turn one bad moment into a blank face for the whole session.
      throw new Error(`profile-photo ${res.status}`);
    }
    const objectUrl = URL.createObjectURL(await res.blob());
    faces.set(principal, objectUrl);
    return objectUrl;
  })();

  inFlight.set(principal, run);
  try {
    return await run;
  } finally {
    inFlight.delete(principal);
  }
}
