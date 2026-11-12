import type { StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";

const PNG_URL = /^data:image\/png;base64,/;

/**
 * Splits a sheet for saving to a file: the sheet WITHOUT its logo data URLs (they are too big for a JSON token file), and the primary
 * logo as a PNG data URL when the Studio gave one. Logo entries that are not `data:` URLs (an https address) stay in the sheet. A `logo`
 * left with no entry is removed. The input is not changed.
 *
 * @returns `{ sheet }`, plus `logoPng` only when `logo.primary` is a `data:image/png;base64,` URL
 */
export function splitLogo(sheet: StyleSheet): { sheet: StyleSheet; logoPng?: string } {
  if (!sheet.logo) return { sheet };
  const primary = sheet.logo.primary;
  const { logo, ...rest } = sheet;
  const kept = Object.fromEntries(Object.entries(logo).filter(([, v]) => typeof v === "string" && !v.startsWith("data:")));
  const next = (Object.keys(kept).length ? { ...rest, logo: kept } : rest) as StyleSheet;
  return primary && PNG_URL.test(primary) ? { sheet: next, logoPng: primary } : { sheet: next };
}
