// Light/dark switching for apps, without React. The choice is stored under "gilb-style:theme" and lives on <html data-theme>.
export const THEME_KEY = "gilb-style:theme";
export type Theme = "light" | "dark";

type Store = Pick<Storage, "getItem" | "setItem">;
const asTheme = (v: unknown): Theme | null => (v === "light" || v === "dark" ? v : null);

function stored(storage: Store | undefined): Theme | null {
  try {
    return asTheme(storage?.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

function systemTheme(doc: Document): Theme {
  const mm = doc.defaultView?.matchMedia;
  return typeof mm === "function" && doc.defaultView!.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The mode of the injected sheet ("light" | "dark" | "system"), read from the --gs-mode marker toCssText writes. */
function sheetMode(doc: Document): "light" | "dark" | "system" {
  const css = doc.getElementById("gilb-style")?.textContent ?? "";
  const m = /--gs-mode:\s*(light|dark|system)/.exec(css);
  return (m?.[1] as "light" | "dark" | "system" | undefined) ?? "system";
}

/** What the page looks like right now: the data-theme attribute, else the sheet's mode (system means the OS setting). */
export function currentTheme(doc: Document = document): Theme {
  const attr = asTheme(doc.documentElement.getAttribute("data-theme"));
  if (attr) return attr;
  const m = sheetMode(doc);
  return m === "system" ? systemTheme(doc) : m;
}

function defaultStorage(): Store | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Flip light <-> dark, remember the choice, return the new theme. Storage failures are ignored. */
export function toggleTheme(doc: Document = document, storage: Store | undefined = defaultStorage()): Theme {
  const next: Theme = currentTheme(doc) === "dark" ? "light" : "dark";
  doc.documentElement.setAttribute("data-theme", next);
  try {
    storage?.setItem(THEME_KEY, next);
  } catch {
    /* private mode: the page still flips */
  }
  return next;
}

/** At app start: apply the stored choice, else the sheet's mode (system follows prefers-color-scheme live). Returns what is showing. */
export function initTheme(doc: Document = document, storage: Store | undefined = defaultStorage()): Theme {
  const choice = stored(storage);
  if (choice) {
    doc.documentElement.setAttribute("data-theme", choice);
    return choice;
  }
  const m = sheetMode(doc);
  if (m === "system") return systemTheme(doc); // no attribute: the sheet's media rule follows the OS
  doc.documentElement.setAttribute("data-theme", m);
  return m;
}
