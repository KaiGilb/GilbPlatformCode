/**
 * The theme state without a framework: defaults, storage, and what is written to the page. The component and the
 * head script both go through `themeOptions`, so they cannot disagree on a key or an attribute.
 */
import { hexToRgb } from "./contrast";
import type { ThemeOptions } from "./types";

/** The options with every default filled in. Neutral names: a site passes its own keys. */
export function themeOptions(o: Partial<ThemeOptions> = {}): ThemeOptions {
  return {
    storageKey: o.storageKey ?? "site-theme",
    accentKey: o.accentKey ?? "site-accent",
    themeAttr: o.themeAttr ?? "data-theme",
    accentVar: o.accentVar ?? "--site-block-accent",
    accentFormat: o.accentFormat ?? "hex",
    customId: o.customId ?? "custom",
  };
}

/** The accent as the page's variable wants it. */
export function accentCssValue(hex: string, format: ThemeOptions["accentFormat"]): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return format === "channels" ? rgb.join(" ") : "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Put a theme (and, for the custom theme, its accent) on the page's root element. */
export function applyToRoot(root: HTMLElement, id: string, accentHex: string, o: ThemeOptions): void {
  root.setAttribute(o.themeAttr, id);
  if (id === o.customId) root.style.setProperty(o.accentVar, accentCssValue(accentHex, o.accentFormat));
  else root.style.removeProperty(o.accentVar);
}

/** Save the choice. A blocked store (private mode) is not an error: the theme still applies for the visit. */
export function persist(storage: Pick<Storage, "setItem"> | undefined, id: string, accentHex: string, o: ThemeOptions): boolean {
  try {
    storage?.setItem(o.storageKey, id);
    storage?.setItem(o.accentKey, accentHex);
    return !!storage;
  } catch {
    return false;
  }
}

/** The saved choice, if it is a known theme; a saved accent only when it is a colour. */
export function readStored(
  storage: Pick<Storage, "getItem"> | undefined,
  validIds: readonly string[],
  o: ThemeOptions,
): { id: string | null; accent: string | null } {
  try {
    const id = storage?.getItem(o.storageKey) ?? null;
    const accent = storage?.getItem(o.accentKey) ?? null;
    return { id: id && validIds.includes(id) ? id : null, accent: accent && hexToRgb(accent) ? accent : null };
  } catch {
    return { id: null, accent: null };
  }
}
