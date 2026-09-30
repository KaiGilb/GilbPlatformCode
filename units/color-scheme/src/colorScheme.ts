export type ColorSchemePreference = "system" | "light" | "dark";
export type ResolvedColorScheme = "light" | "dark";

export interface SchemeStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeRoot {
  dataset: { theme?: string };
  style: { colorScheme: string };
}

export function parseColorSchemePreference(raw: string | null | undefined): ColorSchemePreference {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function readStoredPreference(store: SchemeStore | null, key: string): ColorSchemePreference {
  if (!store || key === "") return "system";
  try {
    return parseColorSchemePreference(store.getItem(key));
  } catch {
    return "system";
  }
}

export function writeStoredPreference(store: SchemeStore | null, key: string, pref: ColorSchemePreference): void {
  if (!store || key === "") return;
  try {
    store.setItem(key, pref);
  } catch {
    /* private mode */
  }
}

export function resolveColorScheme(pref: ColorSchemePreference, systemIsDark: boolean): ResolvedColorScheme {
  if (pref === "light" || pref === "dark") return pref;
  return systemIsDark ? "dark" : "light";
}

export function applyColorScheme(resolved: ResolvedColorScheme, root: ThemeRoot): void {
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}
