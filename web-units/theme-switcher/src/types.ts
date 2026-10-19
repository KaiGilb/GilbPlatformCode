/** One choosable theme. `id` is the value stored and put on the page's theme attribute. */
export interface ThemeMode {
  id: string;
  label: string;
  /** One line under the label in the panel. */
  blurb?: string;
}

/** How the custom accent is written to the page. `hex` is "#rrggbb"; `channels` is "R G B" (for rgb(var(--x) / a)). */
export type AccentFormat = "hex" | "channels";

/** What the pure functions and the head script need to agree on. All have defaults in `themeOptions`. */
export interface ThemeOptions {
  /** localStorage key for the chosen theme id. */
  storageKey: string;
  /** localStorage key for the custom accent, "#rrggbb". */
  accentKey: string;
  /** The attribute set on <html> with the theme id; the host's CSS selects on it. */
  themeAttr: string;
  /** The CSS variable the custom accent is written to, inline on <html>. */
  accentVar: string;
  accentFormat: AccentFormat;
  /** The id of the mode that uses the visitor's accent. */
  customId: string;
}

export interface AccentResult {
  /** The accent as applied, "#rrggbb". */
  hex: string;
  /** "R G B". */
  channels: string;
  /** True when the visitor's pick had to be changed to clear the contrast minimum. */
  adjusted: boolean;
  /** Contrast of the applied accent against the background. */
  ratio: number;
}
