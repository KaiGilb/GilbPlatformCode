/**
 * The record view's header band is ONE row: picture, name, then Edit / Done and "+" at the right (on the same line as the picture and the name,
 * never a row of their own, always visible). In a narrow header (a phone's detail drawer is 275 px wide on a 320 px phone, 335 px on a 390 px one;
 * a right pane 376 px) a 128 px picture and the words left the name 0 px. The row adapts to the header's own width: a smaller picture, tighter
 * gaps and icon buttons, so the name keeps a readable column and nothing passes the right edge. ⚠ The arithmetic is here, as numbers, so a test can
 * hold it (jsdom has no layout).
 *
 * Widths are the header's own border-box width (inside a drawer the header sits in a padded column, so it is 32 px narrower than the drawer: 243
 * px in a 320 px phone's drawer, 278 / 303 / 338 px in a 360 / 390 / 430 px phone's). Tiers: `s` under 270 px, `m` 270 to under 440 px (the other
 * phones' drawers, a right pane, a card view on a phone), `l` from 440 px (a card view and wide panes). An unknown width (not measured yet, or no
 * layout) is the regular header.
 */
import { useLayoutEffect, useState, type RefObject } from "react";

export type HeaderTier = "s" | "m" | "l";
export interface HeaderLayout {
  tier: HeaderTier;
  /** The picture's circle, px. */
  avatar: number;
  /** Icon buttons (a pencil or a tick, and "+") instead of the words. */
  compact: boolean;
  /** The row's gap, px (`gap-2` / `gap-3`). */
  gap: number;
  /** The width the Edit/Done and "+" buttons take together, px (40 + 40 compact; "Done" + 4 + 40 as words). */
  actionsWidth: number;
  /** The header's left and right padding together, px (`px-2` narrow, `px-4` regular). */
  padX: number;
}
/** What the picture's "⋯" menu button adds beside a picture a person may change (4 gap + 28). */
export const AVATAR_MENU = 32;

export function headerLayout(width: number | null, placement: "full" | "content" | "actions"): HeaderLayout {
  const regular: HeaderLayout = { tier: "l", avatar: placement === "content" ? 96 : 128, compact: false, gap: 12, actionsWidth: 98, padX: 32 };
  if (!width || width <= 0 || width >= 440) return regular;
  if (width < 270) return { tier: "s", avatar: 40, compact: true, gap: 6, actionsWidth: 80, padX: 16 };
  return { tier: "m", avatar: 48, compact: true, gap: 8, actionsWidth: 84, padX: 16 };
}

/** The name column's width, px: what is left of the header after the padding, the picture (with its menu button when it has one), the two gaps
 *  and the buttons. */
export function nameBudget(width: number, pictureMenu: boolean, placement: "full" | "content" | "actions"): number {
  const l = headerLayout(width, placement);
  return width - l.padX - (l.avatar + (pictureMenu ? AVATAR_MENU : 0)) - 2 * l.gap - l.actionsWidth;
}

/** The element's border-box width, kept current while it is resized; null until it is measured (and where there is no layout). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width || null);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
