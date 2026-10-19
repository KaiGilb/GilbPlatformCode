/**
 * The website theme-switcher unit: a header control for visitor themes, an AA-guarded custom accent, and the
 * head script that stops a flash of the wrong theme.
 */
export { default as ThemeSwitcher } from "./ThemeSwitcher.vue";
export { contrastRatio, nudgeToAA, AA_MIN, hexToRgb, rgbToHex } from "./contrast";
export { themeHeadScript } from "./headScript";
export { themeOptions, applyToRoot, persist, readStored, accentCssValue } from "./theme";
export type { ThemeMode, ThemeOptions, AccentFormat, AccentResult } from "./types";
