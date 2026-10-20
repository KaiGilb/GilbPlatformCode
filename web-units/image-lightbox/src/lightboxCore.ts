/**
 * The pure parts of the image viewer: which pictures open, how a gesture is read, and the zoom and pan
 * arithmetic. No DOM writes and no Vue, so every rule is tested without a browser; the browser script
 * (scripts/check-lightbox-browser.mjs) proves the same rules on real pointers and keys.
 */
import type { LightboxItem, LightboxWords } from "./types";

/** The English words. */
export const defaultWords: LightboxWords = {
  dialog: "Image viewer",
  close: "Close image viewer",
  previous: "Previous picture",
  next: "Next picture",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Fit picture to screen",
  fit: "Fit",
  count: (position, total) => `${position} of ${total}`,
  loading: "Loading picture",
  loadFailed: "The picture could not be loaded",
};

/** The host's words over the English ones. */
export const resolveWords = (words?: Partial<LightboxWords>): LightboxWords => ({ ...defaultWords, ...words });

/** The most the picture can be enlarged, as a multiple of the fit-to-screen size. */
export const MAX_ZOOM = 4;
/** How much one press of +, - or a zoom button changes the scale (multiplied or divided). */
export const ZOOM_STEP = 1.5;
/** The scale a double tap or double click zooms to. */
export const DOUBLE_TAP_ZOOM = 2.5;
/** Pixels a finger must travel sideways to count as a swipe between pictures. */
export const SWIPE_DISTANCE = 50;
/** Pixels a finger must travel down to count as a swipe that closes the viewer. */
export const SWIPE_CLOSE_DISTANCE = 90;
/** The longest a press can last, in ms, and still count as a tap. */
export const TAP_TIME = 300;
/** The furthest a press can move, in px, and still count as a tap. */
export const TAP_SLOP = 10;
/** Two taps this close in time (ms) and place (px) are a double tap. */
export const DOUBLE_TAP_TIME = 350;
export const DOUBLE_TAP_DISTANCE = 30;

/** Holds `n` within `lo` and `hi`. */
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * The index after moving by `dir` in a set of `total`, held at the ends (no wrap-around).
 *
 * @param index where the viewer is now
 * @param total how many pictures are in the set
 * @param dir -1 for previous, 1 for next
 */
export function stepIndex(index: number, total: number, dir: -1 | 1): number {
  return clamp(index + dir, 0, Math.max(0, total - 1));
}

/** What a finished one-finger movement means at fit-to-screen size. */
export type SwipeResult = "previous" | "next" | "close" | null;

/**
 * Reads a one-finger movement. Mostly sideways and long enough: previous or next (moving the finger left
 * shows the next picture). Mostly downward and longer: close. Anything else: nothing.
 *
 * @param dx pixels moved right (negative: left)
 * @param dy pixels moved down (negative: up)
 * @param total how many pictures are in the set; with one, a sideways swipe does nothing
 */
export function readSwipe(dx: number, dy: number, total: number): SwipeResult {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= SWIPE_DISTANCE && ax > ay * 1.2) return total > 1 ? (dx < 0 ? "next" : "previous") : null;
  if (dy >= SWIPE_CLOSE_DISTANCE && ay > ax * 1.2) return "close";
  return null;
}

/** Whether a press was a tap: short, and it hardly moved. */
export const isTap = (duration: number, distance: number): boolean => duration <= TAP_TIME && distance <= TAP_SLOP;

/** Whether a tap at (x, y) at time t finishes a double tap that began with the previous tap. */
export function isDoubleTap(prev: { t: number; x: number; y: number } | null, t: number, x: number, y: number): boolean {
  return !!prev && t - prev.t <= DOUBLE_TAP_TIME && Math.hypot(x - prev.x, y - prev.y) <= DOUBLE_TAP_DISTANCE;
}

/** The pan that keeps a picture of `scale` times its fit size inside the box: none when it still fits. */
export function clampPan(
  scale: number, tx: number, ty: number, imgW: number, imgH: number, boxW: number, boxH: number,
): { tx: number; ty: number } {
  const maxX = Math.max(0, (imgW * scale - boxW) / 2);
  const maxY = Math.max(0, (imgH * scale - boxH) / 2);
  return { tx: clamp(tx, -maxX, maxX), ty: clamp(ty, -maxY, maxY) };
}

/**
 * The pan and scale after zooming to `next` around a point, so the spot under the point stays under it.
 * The picture scales around its own centre, so a point at offset o from the centre moves to
 * o * (next / scale) plus the pan.
 *
 * @param ox the point's x offset from the picture's centre, in px, on screen
 * @param oy the point's y offset from the picture's centre
 */
export function zoomAround(
  scale: number, tx: number, ty: number, next: number, ox: number, oy: number,
): { scale: number; tx: number; ty: number } {
  const k = next / scale;
  return { scale: next, tx: ox - (ox - tx) * k, ty: oy - (oy - ty) * k };
}

/** The scale after a pinch: the starting scale times how much farther apart the two fingers are. */
export const pinchScale = (startScale: number, startDistance: number, distance: number, max = MAX_ZOOM): number =>
  startDistance <= 0 ? startScale : clamp(startScale * (distance / startDistance), 1, max);

/** Why a picture does not open, or null when it does. */
export type Skip = "no-alt" | "opt-out" | "in-link" | "not-image" | "too-small";

/** The smallest side, in CSS px, of a picture that opens: a button must be at least this big (WCAG 2.2, 2.5.8). */
export const MIN_TARGET = 24;

/**
 * Whether a picture is drawn smaller than the smallest touch target. A picture with no layout (not yet drawn,
 * hidden, or a page with no layout engine) measures 0 by 0 and is not counted as small: it is checked again
 * when it loads or changes size.
 */
export function isTooSmall(img: Element): boolean {
  const r = img.getBoundingClientRect?.();
  return !!r && r.width > 0 && r.height > 0 && (r.width < MIN_TARGET || r.height < MIN_TARGET);
}

/**
 * Whether a picture in an article opens full screen: it needs alt text (a picture with none is decoration),
 * must not carry `data-no-lightbox`, must not sit inside a link (the link keeps its job), and must be drawn at
 * least 24 px on each side (a smaller picture would be a button too small to hit).
 */
export function whySkipped(img: Element | null): Skip | null {
  if (!img || img.tagName !== "IMG") return "not-image";
  if (!(img.getAttribute("alt") ?? "").trim()) return "no-alt";
  if (img.closest("[data-no-lightbox]")) return "opt-out";
  if (img.closest("a")) return "in-link";
  if (isTooSmall(img)) return "too-small";
  return null;
}

/** The picture as the viewer needs it: the original file if `data-full` names one, else the shown file. */
export function itemFromImg(img: HTMLImageElement): LightboxItem {
  const alt = (img.getAttribute("alt") ?? "").trim();
  const fig = img.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
  const own = img.currentSrc || img.src;
  const full = img.getAttribute("data-full") || "";
  return {
    src: full || own,
    fallback: full && own && full !== own ? own : undefined,
    alt,
    caption: fig || alt,
    el: img,
  };
}

/** Every picture under `root` that opens, in page order, and the index of `clicked` among them. */
export function collectSet(root: ParentNode, clicked: Element): { items: LightboxItem[]; index: number } {
  const imgs = [...root.querySelectorAll("img")].filter((i) => whySkipped(i) === null) as HTMLImageElement[];
  return { items: imgs.map(itemFromImg), index: Math.max(0, imgs.indexOf(clicked as HTMLImageElement)) };
}
