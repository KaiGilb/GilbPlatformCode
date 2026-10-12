// The rectangle, and the wire form every app sends.
//
// SHARED ON PURPOSE. When each app held its own picker and its own photo-ref parsing, they
// drifted. Every line of geometry and wire format below is written ONCE here, so that two apps
// cannot disagree about what a marked area means.
//
// ⚠ This module is PURE — no fetch, no React, no DOM. Apps carry different credentials, and that
// difference is real, so the transport stays in each app and the CONTRACT lives here.

/**
 * A rectangle a holder marked on their own picture, in NORMALIZED coordinates: fractions of
 * the picture's displayed width and height, with EXIF orientation already applied.
 *
 * Fractions rather than pixels because the app shows a scaled preview and does not know (and
 * should not have to decode the whole camera original to learn) the true pixel dimensions.
 * The server multiplies these back out against the real decoded size.
 */
export interface FaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The `?face=` value meaning "the holder marked nothing — use the whole picture".
 *
 * 🔴 This is a REQUEST, not an absence. A person who does not crop uses the whole picture, but a
 * 10 MB upload must still be served as a small picture in the profile thumbnail, not loaded in
 * full for one face.
 * ⛔ Never omit `?face=` on a profile-photo upload to mean "they skipped the crop" — omitting
 * it means "this is an ordinary file, do not make a face", which is what a document upload
 * says. Skipping the crop and skipping the fast picture are different things.
 */
export const FACE_WHOLE = "whole" as const;

const isFiniteRect = (r: FaceRect): boolean =>
  [r.x, r.y, r.width, r.height].every((n) => typeof n === "number" && Number.isFinite(n));

/** Clamps a rectangle into the unit square, keeping as much of the marked area as fits.
 *  A rectangle with a non-finite member (NaN, Infinity) marks nothing: it becomes the whole picture. */
export function clampFaceRect(rect: FaceRect): FaceRect {
  if (!isFiniteRect(rect)) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(Math.max(rect.x, 0), 1);
  const y = Math.min(Math.max(rect.y, 0), 1);
  const width = Math.min(Math.max(rect.width, 0), 1 - x);
  const height = Math.min(Math.max(rect.height, 0), 1 - y);
  if (width <= 0 || height <= 0) return { x: 0, y: 0, width: 1, height: 1 };
  return { x, y, width, height };
}

/**
 * The `?face=` query value for a marked rectangle, or for no rectangle at all.
 *
 * @param rect the holder's rectangle, or null when they marked nothing (a non-finite rectangle
 *   marks nothing too)
 * @returns `"whole"`, or `"x,y,w,h"` rounded to 6 decimals (about 1/40th of a pixel on a
 *   6240 px original — far finer than anyone can drag, and short enough to keep the URL small)
 */
export function faceQueryValue(rect: FaceRect | null): string {
  if (rect === null || !isFiniteRect(rect)) return FACE_WHOLE;
  const c = clampFaceRect(rect);
  const r = (n: number): string => String(Number(n.toFixed(6)));
  return `${r(c.x)},${r(c.y)},${r(c.width)},${r(c.height)}`;
}

/**
 * Converts a selection expressed in DISPLAYED pixels into the normalized rectangle the server
 * takes.
 *
 * The picker works in the coordinate space the person can actually see and touch; this is the
 * one place that space is converted, so a rounding convention cannot differ between the apps.
 *
 * @param box the selection in displayed pixels, relative to the displayed image's top-left
 * @param displayed the displayed image's own width/height in the same pixels
 */
export function rectFromDisplayedBox(
  box: { left: number; top: number; size: number },
  displayed: { width: number; height: number },
): FaceRect {
  if (displayed.width <= 0 || displayed.height <= 0) return { x: 0, y: 0, width: 1, height: 1 };
  return clampFaceRect({
    x: box.left / displayed.width,
    y: box.top / displayed.height,
    // A box that is SQUARE on screen is square in the picture's pixels too, because the preview
    // preserves aspect ratio. It is NOT square in normalized coordinates unless the picture is
    // square — which is exactly why the two fractions are computed against different divisors
    // and why a "square rect" must never be faked by copying width into height.
    width: box.size / displayed.width,
    height: box.size / displayed.height,
  });
}

/**
 * The selection a picker should open with: the largest centred square that fits, at `fraction`
 * of the shorter edge.
 *
 * ⚠ This is a STARTING POSITION for a control the person then moves — ⛔ it is never submitted
 * on their behalf. A picker that sent this without the person touching it would be the app
 * choosing their framing; the person chooses it. Not marking anything sends {@link FACE_WHOLE} instead.
 */
export function initialSquare(
  displayed: { width: number; height: number },
  fraction = 0.8,
): { left: number; top: number; size: number } {
  const size = Math.min(displayed.width, displayed.height) * fraction;
  return {
    left: (displayed.width - size) / 2,
    top: (displayed.height - size) / 2,
    size,
  };
}
