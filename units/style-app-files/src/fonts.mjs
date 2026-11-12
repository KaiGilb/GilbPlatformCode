// Copies the sheet's bundled @fontsource fonts into the app's public folder and writes the @font-face stylesheet.
import { readFile, readdir, rm, rmdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { copyAtomic, writeAtomic } from "./atomic.mjs";

const HEADER = "/* Generated from style.tokens.json by style-app-files: do not edit */\n";
/** The file this tool leaves in every font folder it makes; it lists the files it wrote there. */
export const MARKER = ".style-app-files";
const SLUG = /^[a-z0-9-]+$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.woff2$/;
const SLOTS = ["sans", "serif", "mono"];

/** The @fontsource package name of a family: lower case, spaces to hyphens, anything else but letters, digits and hyphens dropped ("Source Sans 3" is "source-sans-3"). */
export function fontsourceSlug(family) {
  return String(family).toLowerCase().replace(/ /g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Rewrites one @fontsource stylesheet: keeps only the woff2 source and points it at `<urlBase>/<slug>/`.
 * Returns the css and the woff2 file names it needs. Other formats (woff, ttf) are dropped.
 */
export function rewriteFontCss(css, slug, urlBase = "/fonts") {
  const base = String(urlBase).replace(/\/+$/, "");
  const files = [];
  const out = String(css).replace(
    /url\(\s*\.\/files\/([^)\s]+?\.woff2)\s*\)\s*format\(\s*['"]woff2['"]\s*\)(?:\s*,\s*url\([^)]*\)\s*format\([^)]*\))*/g,
    (_m, file) => {
      files.push(file);
      return `url(${base}/${slug}/${file}) format('woff2')`;
    },
  );
  return { css: out, files };
}

/** True when the family name could climb out of a folder (a separator, "..", a NUL) or gives no slug. */
function unsafeFamily(family) {
  return typeof family !== "string" || family === "" || /[\\/\0]|\.\./.test(family);
}

async function locatePackage(require, slug) {
  for (const dir of require.resolve.paths(`@fontsource/${slug}`) ?? []) {
    const candidate = path.join(dir, "@fontsource", slug);
    const s = await stat(candidate).catch(() => null);
    if (s?.isDirectory()) return candidate;
  }
  return null;
}

async function readMarker(dir) {
  try {
    const m = JSON.parse(await readFile(path.join(dir, MARKER), "utf8"));
    return Array.isArray(m?.files) ? m.files.filter((f) => typeof f === "string" && FILE.test(f)) : [];
  } catch {
    return null; // no marker, or one that does not parse: not ours
  }
}

/**
 * Exports the fonts a sheet uses. For every slot (sans, serif, mono) whose font has `source: "bundled"`:
 * copies the latin woff2 files of `weights` to `<publicDir>/fonts/<slug>/`, and writes `<publicDir>/<cssFile>` with @font-face rules
 * whose `src` names only those woff2 files under `urlBase`. Families that are not bundled get nothing.
 *
 * Stale folders: a folder under `<publicDir>/fonts` that this tool made earlier (it holds a `.style-app-files` marker) and
 * that this export no longer needs has the files the marker lists removed, then the marker, then the folder if it is empty.
 * A folder without a marker is never touched. A missing @fontsource package, a name that is not a safe folder name, or an
 * unreadable file is a warning; the other families are still exported.
 */
export async function exportFonts(sheet, o) {
  const appRoot = o.appRoot;
  const publicDir = path.resolve(appRoot, o.publicDir ?? "public");
  const urlBase = o.urlBase ?? "/fonts";
  const cssFile = o.cssFile ?? "fonts.css";
  const weights = o.weights ?? [400, 600];
  if (!weights.every((w) => Number.isInteger(w) && w > 0 && w < 1000)) throw new Error("weights must be whole numbers such as 400 and 600.");
  if (cssFile.includes("/") || cssFile.includes("\\") || cssFile === "" || cssFile.includes("..")) throw new Error("cssFile must be a plain file name.");
  const fontsDir = path.join(publicDir, "fonts");
  const require = createRequire(path.join(appRoot, "package.json"));
  const warnings = [];

  const wanted = new Map(); // slug -> family
  for (const slot of SLOTS) {
    const f = sheet?.fonts?.[slot];
    if (!f || f.source !== "bundled" || typeof f.family !== "string" || f.family === "") continue;
    const slug = fontsourceSlug(f.family);
    if (unsafeFamily(f.family) || !SLUG.test(slug)) {
      warnings.push(`The font name "${String(f.family).slice(0, 40)}" is not a usable font package name; skipped.`);
      continue;
    }
    if (!wanted.has(slug)) wanted.set(slug, f.family);
  }

  let css = HEADER;
  const exported = []; // [slug, family]
  const wrote = new Map(); // slug -> files written
  for (const [slug, family] of wanted) {
    const pkg = await locatePackage(require, slug);
    if (pkg === null) {
      warnings.push(`Font package @fontsource/${slug} is not installed; skipped.`);
      continue;
    }
    const dest = path.join(fontsDir, slug);
    const files = [];
    let block = "";
    for (const w of weights) {
      let text;
      try {
        text = await readFile(path.join(pkg, `latin-${w}.css`), "utf8");
      } catch {
        continue; // this weight does not exist for the family
      }
      const r = rewriteFontCss(text, slug, urlBase);
      const ok = r.files.filter((f) => FILE.test(f));
      if (ok.length !== r.files.length) warnings.push(`@fontsource/${slug} latin-${w}.css names a file that is not a plain woff2 name; skipped.`);
      if (ok.length === 0) continue;
      let copied = true;
      for (const file of ok) {
        try {
          await copyAtomic(path.join(pkg, "files", file), path.join(dest, file));
          if (!files.includes(file)) files.push(file);
        } catch {
          copied = false;
          warnings.push(`@fontsource/${slug}: the file ${file} could not be copied; weight ${w} skipped.`);
        }
      }
      if (copied) block += "\n" + r.css.trim() + "\n";
    }
    if (files.length === 0) {
      warnings.push(`@fontsource/${slug} has none of the weights ${weights.join(", ")} in the latin subset; skipped.`);
      continue;
    }
    // What an earlier run left in this folder and this run no longer writes.
    const before = (await readMarker(dest)) ?? [];
    for (const f of before) if (!files.includes(f)) await rm(path.join(dest, f), { force: true });
    await writeAtomic(path.join(dest, MARKER), JSON.stringify({ tool: "style-app-files", files }) + "\n");
    wrote.set(slug, files);
    exported.push([slug, family]);
    css += block;
  }

  await writeAtomic(path.join(publicDir, cssFile), css);

  // Stale folders: only ones this tool made (a marker), and only the files the marker lists.
  const entries = await readdir(fontsDir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isDirectory() || wrote.has(e.name)) continue;
    const dir = path.join(fontsDir, e.name);
    const listed = await readMarker(dir);
    if (listed === null) continue;
    for (const f of listed) await rm(path.join(dir, f), { force: true });
    await rm(path.join(dir, MARKER), { force: true });
    await rmdir(dir).catch(() => undefined); // only when nothing else is in it
  }

  return { families: exported.map(([, family]) => family), warnings };
}
