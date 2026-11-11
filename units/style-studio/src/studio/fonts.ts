// Fonts: system stacks, plus 48 open-licence fonts from @fontsource (latin subset, weights 400 and 600 only).
// A font file is fetched only when a font is chosen or previewed (loadFont); the default sheet uses system fonts and loads nothing.
import type { FontRef } from "@kaigilb/gilbplatformcode-style-runtime";
import { FONT_CATALOGUE, FONT_LOADERS, type CatalogueFont, type FontCategory } from "./fonts.generated";

export { FONT_CATALOGUE, type CatalogueFont, type FontCategory };

/** The three sheet slots. Body = sans, Headings = serif, Code = mono (schema names are unchanged). */
export type FontRole = "sans" | "serif" | "mono";
export interface FontOption {
  family: string;
  source: FontRef["source"];
}

export const FONT_CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "mono", label: "Mono" },
  { id: "handwriting", label: "Handwriting" },
];

export const SYSTEM_FONT: Record<FontRole, string> = { sans: "System Sans", serif: "System Serif", mono: "System Mono" };

/** Fallback generic family used when drawing a sample row before/without the font file. */
export const GENERIC_FOR: Record<FontCategory, string> = { sans: "sans-serif", serif: "serif", display: "sans-serif", mono: "monospace", handwriting: "cursive" };

export interface FontPairing {
  name: string;
  /** Headings (serif slot), Body (sans slot), Code (mono slot). */
  heading: string;
  body: string;
  code: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { name: "Editorial", heading: "Fraunces", body: "Inter", code: "JetBrains Mono" },
  { name: "Modern tech", heading: "Space Grotesk", body: "Inter", code: "Fira Code" },
  { name: "Classic", heading: "Playfair Display", body: "Source Sans 3", code: "Source Code Pro" },
  { name: "Friendly", heading: "Nunito Sans", body: "Nunito Sans", code: "Roboto Mono" },
  { name: "Bold display", heading: "Bricolage Grotesque", body: "DM Sans", code: "IBM Plex Mono" },
  { name: "Literary", heading: "Spectral", body: "Work Sans", code: "Space Mono" },
  { name: "Geometric", heading: "Sora", body: "Manrope", code: "JetBrains Mono" },
  { name: "Handmade", heading: "Caveat", body: "Figtree", code: "Roboto Mono" },
];

const BY_NAME = new Map(FONT_CATALOGUE.map((f) => [f.family.toLowerCase(), f]));
export const findFont = (name: string): CatalogueFont | undefined => BY_NAME.get(name.trim().toLowerCase());

/** Fonts per slot for the old role-based lists: system first, then every catalogue font. */
export const FONT_OPTIONS: Record<FontRole, FontOption[]> = {
  sans: [{ family: SYSTEM_FONT.sans, source: "system" }, ...FONT_CATALOGUE.filter((f) => f.category === "sans").map((f) => ({ family: f.family, source: "bundled" as const }))],
  serif: [{ family: SYSTEM_FONT.serif, source: "system" }, ...FONT_CATALOGUE.filter((f) => f.category === "serif").map((f) => ({ family: f.family, source: "bundled" as const }))],
  mono: [{ family: SYSTEM_FONT.mono, source: "system" }, ...FONT_CATALOGUE.filter((f) => f.category === "mono").map((f) => ({ family: f.family, source: "bundled" as const }))],
};

const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();

/** Whether this family's files have been requested already. */
export const isFontLoaded = (family: string): boolean => loaded.has(family);

/** Load a bundled font once. Unknown families and failures are ignored (the CSS stack falls back). */
export function loadFont(ref: FontRef | undefined): Promise<void> {
  if (!ref || ref.source !== "bundled") return Promise.resolve();
  return loadFontFamily(ref.family);
}

export function loadFontFamily(family: string): Promise<void> {
  const known = inflight.get(family);
  if (known) return known;
  const load = FONT_LOADERS[family];
  if (!load) return Promise.resolve();
  const p = load().then(
    () => {
      loaded.add(family);
    },
    () => {
      inflight.delete(family);
    },
  );
  inflight.set(family, p);
  return p;
}

/** Guess a font's category from its name only. Order matters: "Source Code Pro" is mono, "Noto Sans Serif" is sans. */
export function classifyFont(name: string): FontRole {
  if (/mono|code/i.test(name)) return "mono";
  if (/\bsans\b/i.test(name)) return "sans";
  if (/serif|garamond|lora|fraunces|times/i.test(name)) return "serif";
  return "sans";
}

/** The slot a catalogue font naturally goes to: display and handwriting fonts are for headings. */
export const roleOfCategory = (c: FontCategory): FontRole => (c === "sans" ? "sans" : c === "mono" ? "mono" : "serif");

/** The bundled font with this name (case-insensitive), and the slot it belongs to. */
export function matchBundled(name: string): { family: string; role: FontRole } | null {
  const f = findFont(name);
  return f ? { family: f.family, role: roleOfCategory(f.category) } : null;
}

/** The first bundled font of the same category as this (unbundled) name. */
export function closestBundled(name: string): string {
  const role = classifyFont(name);
  return FONT_OPTIONS[role].find((o) => o.source === "bundled")!.family;
}
