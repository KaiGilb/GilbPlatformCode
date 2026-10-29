/**
 * The live-link mark: the chain-link glyph and its words, shared so the header and the list draw one badge from one code.
 *
 * The little chain link is there when the contact is an online linked contact, and goes away when it is a local one.
 */

import { W } from "./tokens";

/** The words of the live-link badge: its hover title and its readable name. */
export const LINK_NOTE = "Live link to their account — not a copy";

/**
 * The chain-link glyph as inline SVG (the mockup's drawing of Font Awesome's `fa-link`), so no icon font is needed.
 *
 * @param size its side in px (default 14; the badge passes its own)
 * @returns the glyph, hidden from assistive technology (its badge carries the name)
 */
export function LinkGlyph({ size = 14 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

/** The badge's props: its side and how far it sits past the picture's lower-left corner (negative: outside), in px. */
export interface LinkBadgeProps {
  /** The badge's side in px (default 28, the contact header's narrow badge). */
  size?: number;
  /** Where its lower-left corner sits from the picture's (default -4, the header's narrow `--gsh-badge-at`). */
  offset?: number;
  testId?: string;
}

/**
 * The live-link badge: the contact header's `.gsh-badge` as a component, so another screen draws the same badge, ⛔ not
 * a copy. A white circle at the lower left of the picture it sits in (the
 * picture's box must be `position: relative`), the chain-link glyph in the live-link colour, and LINK_NOTE as its hover title and
 * readable name. The colours are the header's tokens (`W.sheet`, `W.link`, `W.line`).
 *
 * @returns the badge, drawn over the picture, taking no pointer events
 */
export function LinkBadge({ size = 28, offset = -4, testId }: LinkBadgeProps) {
  const glyph = Math.round(size * 0.5);
  return (
    <span
      title={LINK_NOTE}
      data-testid={testId}
      style={{
        position: "absolute",
        bottom: offset,
        left: offset,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: W.sheet,
        color: W.link,
        outline: `1px solid ${W.line}`,
        boxShadow: "0 1px 2px rgba(0,0,0,.08)",
        pointerEvents: "none",
      }}
    >
      <LinkGlyph size={glyph} />
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{LINK_NOTE}</span>
    </span>
  );
}
