/**
 * The colour tokens and the name face every stakeholder screen draws with, shared so that the contact header and the list draw
 * with the same values, not a copy.
 *
 * Each token is a CSS variable chain: the host app's token first, a second app's token second, a plain value last. An app's theme (light, dark, cvd) changes the screens by changing its own variables; ⛔ no raw colour
 * is chosen per screen.
 */

/** Colour tokens. */
export const W = {
  base: "var(--paper,var(--color-base,#f4f1ea))",
  ink: "var(--ink,var(--color-ink,#2a2622))",
  muted: "var(--ink-faint,var(--color-ink-muted,#6f6a63))",
  brand: "var(--accent,var(--color-brand,#a85c3b))",
  brandLighter: "color-mix(in srgb,var(--accent,var(--color-brand,#a85c3b)) 9%,var(--paper,var(--color-base,#f4f1ea)))",
  line: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 20%,transparent)",
  lineSubtle: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 9%,transparent)",
  sheet: "var(--surface,var(--color-sheet,#ffffff))",
  // The relation chip: the mockup's neutral chip (surface 90% + ink; border ink 28%).
  relBg: "color-mix(in srgb,var(--surface,var(--color-sheet,#ffffff)) 90%,var(--ink,var(--color-ink,#2a2622)))",
  relBorder: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 28%,transparent)",
  // WCAG AA 4.5:1: the own label's and "+ Relation"'s text, darkened minimally toward the ink. Measured on a light theme:
  // own #85817c 3.43:1 -> ink 66% over paper 4.6:1; "+ Relation" #a85c3b 4.37:1 -> accent 95% with ink 4.6:1. Dark rises with the ink.
  ownText: "color-mix(in srgb,var(--ink,var(--color-ink,#2a2622)) 66%,var(--paper,var(--color-base,#f4f1ea)))",
  addText: "color-mix(in srgb,var(--accent,var(--color-brand,#a85c3b)) 95%,var(--ink,var(--color-ink,#2a2622)))",
  // The live-link mark: an app's `--live-link` first; else a violet (`#7B3FE4`) mixed 75% with the ink, so it moves
  // with the theme. WCAG 2.1 1.4.11 (non-text, at least 3:1): the bare literal measured 2.76:1 on the dark badge
  // sheet. Mixed, computed on the app's light, dark and cvd anchors: light 6.8:1, dark 4.1:1, cvd 6.9:1 (on the sheet).
  link: "var(--live-link,color-mix(in srgb,#7B3FE4 75%,var(--ink,var(--color-ink,#2a2622))))",
} as const;

/** The name face (`font-name`), with its own fallbacks for an app that has no such token. */
export const NAME_FONT = 'var(--font-name,"Arial Narrow","Helvetica Neue","Roboto Condensed",Arial,sans-serif)';
