// Writes the files the Style Studio's save sends: public/style.tokens.json, public/brand-logo.png, then the fonts.
import path from "node:path";
import { writeAtomic } from "./atomic.mjs";
import { exportFonts } from "./fonts.mjs";

const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** The PNG bytes of a `data:image/png;base64,` URL, or null when it is not one or the bytes do not start with the PNG signature. */
function pngBytes(value) {
  if (typeof value !== "string" || !value.startsWith(PNG_PREFIX)) return null;
  const b64 = value.slice(PNG_PREFIX.length);
  if (!BASE64.test(b64)) return null;
  const bytes = Buffer.from(b64, "base64");
  return bytes.length >= PNG_MAGIC.length && bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) ? bytes : null;
}

/**
 * Saves what the Studio sent. Checks everything first and writes nothing when anything is wrong (status 400). Then it writes
 * public/style.tokens.json (pretty JSON), public/brand-logo.png when `logoPng` is a real PNG, and exports the fonts.
 * A font problem is a `fontsWarning` and the status stays 200. The message never holds a path of this machine.
 * It checks that `sheet` is an object only; the app's runtime validates the sheet when it loads it.
 */
export async function writeStyleFiles(body, o) {
  if (!isObject(body) || !isObject(body.sheet)) return { status: 400, message: "The body needs a sheet object." };
  let logo = null;
  if (body.logoPng !== undefined) {
    logo = pngBytes(body.logoPng);
    if (logo === null) return { status: 400, message: "The logo must be a PNG image sent as a data:image/png;base64 URL." };
  }
  const publicDir = path.join(o.appRoot, "public");
  try {
    await writeAtomic(path.join(publicDir, "style.tokens.json"), JSON.stringify(body.sheet, null, 2) + "\n");
    if (logo !== null) await writeAtomic(path.join(publicDir, "brand-logo.png"), logo);
  } catch {
    return { status: 500, message: "The style files could not be written." };
  }
  let fontsWarning;
  try {
    const r = await exportFonts(body.sheet, { appRoot: o.appRoot });
    if (r.warnings.length) fontsWarning = r.warnings.join(" ");
  } catch {
    fontsWarning = "The fonts could not be exported.";
  }
  return { status: 200, message: logo !== null ? "Saved style and logo." : "Saved style.", ...(fontsWarning ? { fontsWarning } : {}) };
}
