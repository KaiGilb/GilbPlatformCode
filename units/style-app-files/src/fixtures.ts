// Test support, not shipped: a temp app folder with @fontsource packages made from the REAL latin-400.css and latin-600.css of the
// installed @fontsource/inter (a dev dependency, 5.3.0 when written). The css is copied byte for byte; the .woff2 and .woff files are tiny placeholders.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const interDir = path.dirname(require.resolve("@fontsource/inter/package.json"));
export const REAL_CSS: Record<number, string> = {
  400: readFileSync(path.join(interDir, "latin-400.css"), "utf8"),
  600: readFileSync(path.join(interDir, "latin-600.css"), "utf8"),
};

const dirs: string[] = [];
export function makeApp(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "style-app-files-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "package.json"), "{}\n");
  mkdirSync(path.join(dir, "public"), { recursive: true });
  return dir;
}
/** An app folder one level down in its own temp folder, so a test can see that nothing was written next to it. Returns both. */
export function makeSandbox(): { root: string; app: string } {
  const root = mkdtempSync(path.join(tmpdir(), "style-app-files-"));
  dirs.push(root);
  const app = path.join(root, "app");
  mkdirSync(path.join(app, "public"), { recursive: true });
  writeFileSync(path.join(app, "package.json"), "{}\n");
  return { root, app };
}
export function cleanup(): void {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

/** Installs a fake `@fontsource/<slug>` in the app: the real css verbatim, placeholder font files named as the css names them. */
export function installFont(appRoot: string, slug: string, weights: number[] = [400, 600]): string {
  const pkg = path.join(appRoot, "node_modules", "@fontsource", slug);
  mkdirSync(path.join(pkg, "files"), { recursive: true });
  for (const w of weights) {
    const css = REAL_CSS[w]!;
    writeFileSync(path.join(pkg, `latin-${w}.css`), css);
    for (const m of css.matchAll(/url\(\.\/files\/([^)]+)\)/g)) writeFileSync(path.join(pkg, "files", m[1]!), `placeholder ${m[1]}`);
  }
  return pkg;
}

export const sheetWith = (fonts: Record<string, { family: string; source: "bundled" | "system" }>) => ({
  version: 1,
  mode: "light",
  fonts: { baseSizePx: 16, scaleRatio: 1.2, ...fonts },
});

/** A real PNG signature plus a few bytes, as a data URL. */
export const PNG_URL = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]).toString("base64");
