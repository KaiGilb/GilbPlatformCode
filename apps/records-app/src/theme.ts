// Dark/light mode: the color-scheme unit decides, localStorage keeps the choice (the host's job).
import {
  applyColorScheme,
  readStoredPreference,
  resolveColorScheme,
  writeStoredPreference,
  type ColorSchemePreference,
  type ResolvedColorScheme,
} from "@kaigilb/gilbplatformcode-color-scheme";

export const THEME_KEY = "records-app.theme";

export function systemIsDark(): boolean {
  return systemQuery()?.matches === true;
}

export function loadPreference(): ColorSchemePreference {
  return readStoredPreference(typeof localStorage === "undefined" ? null : localStorage, THEME_KEY);
}

/** Store and apply a choice; answers the scheme now shown. */
export function setPreference(pref: ColorSchemePreference, root: HTMLElement = document.documentElement): ResolvedColorScheme {
  writeStoredPreference(typeof localStorage === "undefined" ? null : localStorage, THEME_KEY, pref);
  const resolved = resolveColorScheme(pref, systemIsDark());
  applyColorScheme(resolved, root);
  return resolved;
}

/** The next choice when the person presses the toggle: light -> dark -> system -> light. */
export function nextPreference(pref: ColorSchemePreference): ColorSchemePreference {
  return pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
}

/** The OS colour-scheme query, or null where the browser has none. */
export function systemQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
}
