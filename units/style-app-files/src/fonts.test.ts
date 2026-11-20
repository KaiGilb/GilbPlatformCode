// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportFonts, fontsourceSlug, MANIFEST, MARKER, rewriteFontCss } from "./index.mjs";
import { REAL_CSS, cleanup, installFont, makeApp, makeSandbox, sheetWith } from "./fixtures";

afterEach(cleanup);

// Every path under a folder, relative, sorted.
function tree(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))])).sort();
}

describe("fontsourceSlug (run-7's cases)", () => {
  it("maps families to @fontsource slugs", () => {
    expect(fontsourceSlug("Shadows Into Light")).toBe("shadows-into-light");
    expect(fontsourceSlug("Source Sans 3")).toBe("source-sans-3");
    expect(fontsourceSlug("IBM Plex Mono")).toBe("ibm-plex-mono");
    expect(fontsourceSlug("Foo (Bar)!")).toBe("foo-bar");
  });
});

describe("rewriteFontCss", () => {
  it("rewrites urls to woff2 under /fonts/<slug>/ and drops the woff fallback (run-7's case)", () => {
    const css = "@font-face { src: url(./files/a-latin-400-normal.woff2) format('woff2'), url(./files/a-latin-400-normal.woff) format('woff'); }";
    const r = rewriteFontCss(css, "a");
    expect(r.files).toEqual(["a-latin-400-normal.woff2"]);
    expect(r.css).toContain("url(/fonts/a/a-latin-400-normal.woff2) format('woff2')");
    expect(r.css).not.toContain(".woff)");
  });
  it("uses the given urlBase, with or without a trailing slash", () => {
    expect(rewriteFontCss(REAL_CSS[400]!, "inter", "/assets/f/").css).toContain("url(/assets/f/inter/inter-latin-400-normal.woff2)");
  });
  it("the real latin-400.css has both formats before, and woff2 only after", () => {
    expect(REAL_CSS[400]).toMatch(/\.woff\)/);
    const r = rewriteFontCss(REAL_CSS[400]!, "inter");
    expect(r.css).not.toMatch(/\.woff\)/);
    expect(r.css).toContain("font-family: 'Inter'");
  });
});

describe("exportFonts", () => {
  it("copies the woff2 files for 400 and 600 and writes fonts.css with only woff2 urls under urlBase", async () => {
    const app = makeApp();
    installFont(app, "inter");
    const r = await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" } }), { appRoot: app });
    expect(r).toEqual({ families: ["Inter"], warnings: [] });
    const dir = path.join(app, "public/fonts/inter");
    expect(readdirSync(dir).sort()).toEqual(["inter-latin-400-normal.woff2", "inter-latin-600-normal.woff2"]);
    expect(readFileSync(path.join(dir, "inter-latin-400-normal.woff2"), "utf8")).toBe("placeholder inter-latin-400-normal.woff2");
    const css = readFileSync(path.join(app, "public/fonts.css"), "utf8");
    expect(css).not.toContain(".woff)");
    expect(css).not.toMatch(/format\('woff'\)/);
    const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
    expect(urls).toEqual(["/fonts/inter/inter-latin-400-normal.woff2", "/fonts/inter/inter-latin-600-normal.woff2"]);
    expect(css.match(/@font-face/g)).toHaveLength(2);
  });
  it("honours weights, urlBase, publicDir and cssFile", async () => {
    const app = makeApp();
    installFont(app, "inter");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" } }), { appRoot: app, publicDir: "static", urlBase: "/f", cssFile: "type.css", weights: [400] });
    expect(readdirSync(path.join(app, "static/fonts/inter")).sort()).toEqual(["inter-latin-400-normal.woff2"]);
    expect(readFileSync(path.join(app, "static/type.css"), "utf8")).toContain("url(/f/inter/inter-latin-400-normal.woff2)");
    expect(existsSync(path.join(app, "public/fonts.css"))).toBe(false);
  });
  it("writes nothing for system fonts, and an empty fonts.css so the link never 404s", async () => {
    const app = makeApp();
    const r = await exportFonts(sheetWith({ sans: { family: "Arial", source: "system" } }), { appRoot: app });
    expect(r).toEqual({ families: [], warnings: [] });
    expect(tree(path.join(app, "public"))).toEqual(["fonts.css"]);
  });
  it("removes a stale folder this tool made, and leaves an UNMARKED folder alone", async () => {
    const app = makeApp();
    installFont(app, "inter");
    installFont(app, "lora");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" }, serif: { family: "Lora", source: "bundled" } }), { appRoot: app });
    expect(existsSync(path.join(app, "public/fonts/lora/inter-latin-400-normal.woff2"))).toBe(true);
    const mine = path.join(app, "public/fonts/my-own-fonts");
    mkdirSync(mine, { recursive: true });
    writeFileSync(path.join(mine, "brand.woff2"), "keep me");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" } }), { appRoot: app });
    expect(existsSync(path.join(app, "public/fonts/lora"))).toBe(false);
    expect(readFileSync(path.join(mine, "brand.woff2"), "utf8")).toBe("keep me");
    expect(existsSync(path.join(app, "public/fonts/inter"))).toBe(true);
  });
  it("a marked folder that also holds a file of the app's own loses only the files this tool wrote", async () => {
    const app = makeApp();
    installFont(app, "inter");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" } }), { appRoot: app });
    writeFileSync(path.join(app, "public/fonts/inter/extra.txt"), "mine");
    await exportFonts(sheetWith({ sans: { family: "Arial", source: "system" } }), { appRoot: app });
    expect(tree(path.join(app, "public/fonts"))).toEqual(["inter/extra.txt"]);
  });
  it("never removes what a marker names outside its folder, only plain file names inside it", async () => {
    const { app } = makeSandbox();
    installFont(app, "inter");
    const stale = path.join(app, "public/fonts/old");
    mkdirSync(stale, { recursive: true });
    writeFileSync(path.join(stale, "a.woff2"), "ours");
    writeFileSync(path.join(stale, "mine.txt"), "not listed");
    // from public/fonts/old: ../keep.woff2 is public/fonts/keep.woff2, ../../outside.txt is public/outside.txt, ../../../outside.txt is app/outside.txt
    const targets = [path.join(app, "public/fonts/keep.woff2"), path.join(app, "public/outside.txt"), path.join(app, "outside.txt")];
    for (const t of targets) writeFileSync(t, "keep");
    writeFileSync(path.join(stale, MARKER), JSON.stringify({ files: ["../../outside.txt", "../keep.woff2", "../../../outside.txt", "sub/x.woff2", "/etc/hosts", "a.woff2"] }));
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" } }), { appRoot: app });
    for (const t of targets) expect(readFileSync(t, "utf8"), t).toBe("keep");
    expect(existsSync(path.join(stale, "a.woff2"))).toBe(false); // the one plain name listed
    expect(existsSync(path.join(stale, MARKER))).toBe(false); // migrated, then gone
    expect(readFileSync(path.join(stale, "mine.txt"), "utf8")).toBe("not listed"); // so the folder stays
  });
  it("a marker that is not valid JSON leaves the folder untouched, as if unmarked", async () => {
    const app = makeApp();
    installFont(app, "inter");
    const stale = path.join(app, "public/fonts/old");
    mkdirSync(stale, { recursive: true });
    writeFileSync(path.join(stale, "a.woff2"), "x");
    writeFileSync(path.join(stale, MARKER), "{not json");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" } }), { appRoot: app });
    expect(readdirSync(stale).sort()).toEqual([MARKER, "a.woff2"]);
  });
  it("drops a weight file when the weights shrink", async () => {
    const app = makeApp();
    installFont(app, "inter");
    const sheet = sheetWith({ sans: { family: "Inter", source: "bundled" } });
    await exportFonts(sheet, { appRoot: app });
    await exportFonts(sheet, { appRoot: app, weights: [400] });
    expect(readdirSync(path.join(app, "public/fonts/inter")).sort()).toEqual(["inter-latin-400-normal.woff2"]);
  });
  it("a missing package is a warning; the others are still exported", async () => {
    const app = makeApp();
    installFont(app, "inter");
    const r = await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" }, serif: { family: "Fraunces", source: "bundled" } }), { appRoot: app });
    expect(r.families).toEqual(["Inter"]);
    expect(r.warnings).toEqual(["Font package @fontsource/fraunces is not installed; skipped."]);
    expect(existsSync(path.join(app, "public/fonts/inter/inter-latin-400-normal.woff2"))).toBe(true);
    expect(existsSync(path.join(app, "public/fonts/fraunces"))).toBe(false);
    expect(readFileSync(path.join(app, "public/fonts.css"), "utf8")).toContain("'Inter'");
  });
  it("a family name that climbs out of the folder is refused with a warning and writes nothing outside publicDir", async () => {
    const { root, app } = makeSandbox();
    installFont(app, "inter");
    installFont(app, "evil"); // what a sanitised "../../evil" would reach
    const before = tree(root);
    for (const family of ["../../evil", "..\\evil", "a/b", "Foo\0Bar", "...", "!!!"]) {
      const r = await exportFonts(sheetWith({ sans: { family, source: "bundled" } }), { appRoot: app });
      expect(r.families, family).toEqual([]);
      expect(r.warnings, family).toHaveLength(1);
      expect(r.warnings[0], family).toContain("not a usable font package name");
    }
    // only app/public/fonts.css was added; nothing at all outside app/public
    expect(tree(root).filter((f) => !before.includes(f))).toEqual(["app/public/fonts.css"]);
    expect(existsSync(path.join(app, "public/fonts"))).toBe(false);
  });
  it("refuses a cssFile that is not a plain name", async () => {
    const app = makeApp();
    await expect(exportFonts(sheetWith({}), { appRoot: app, cssFile: "../x.css" })).rejects.toThrow(/plain file name/);
  });
});

// Spec: friction item 63. The marker must never reach dist/, where publishing refuses a file with no extension.
// Every file under public/ must have an accepted extension and a name that does not start with a dot.
describe("nothing under public/ is a record file (D1, D2, D3)", () => {
  const ACCEPTED = /^[^.][^/]*\.(woff2|css|json|png)$/;
  const badNames = (app: string) => tree(path.join(app, "public")).filter((f) => f.split("/").some((part) => part.startsWith(".")) || !ACCEPTED.test(path.basename(f)));
  const inter = sheetWith({ sans: { family: "Inter", source: "bundled" } });

  it("D1: after a run, no file under public/ has a dot-name or lacks an accepted extension", async () => {
    const app = makeApp();
    installFont(app, "inter");
    installFont(app, "lora");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" }, serif: { family: "Lora", source: "bundled" } }), { appRoot: app });
    expect(tree(path.join(app, "public")).length).toBeGreaterThan(3); // the walk saw the fonts, so a pass is not a blind pass
    expect(badNames(app)).toEqual([]);
    expect(existsSync(path.join(app, MANIFEST))).toBe(true); // the record is kept, at the app root
  });

  it("D2: stale cleanup removes only what the unit made; the owner's folders and files stay", async () => {
    const app = makeApp();
    installFont(app, "inter");
    installFont(app, "lora");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" }, serif: { family: "Lora", source: "bundled" } }), { appRoot: app });
    writeFileSync(path.join(app, "public/fonts/lora/extra.woff2"), "owner's file in a folder we made");
    mkdirSync(path.join(app, "public/fonts/mine"), { recursive: true });
    writeFileSync(path.join(app, "public/fonts/mine/brand.woff2"), "owner's folder");
    writeFileSync(path.join(app, "public/fonts/loose.woff2"), "owner's loose file");
    await exportFonts(inter, { appRoot: app });
    expect(tree(path.join(app, "public/fonts"))).toEqual(["inter/inter-latin-400-normal.woff2", "inter/inter-latin-600-normal.woff2", "loose.woff2", "lora/extra.woff2", "mine/brand.woff2"]);
  });

  it("D2: a manifest key outside public/fonts is never acted on", async () => {
    const app = makeApp();
    installFont(app, "inter");
    writeFileSync(path.join(app, "victim.woff2"), "keep");
    writeFileSync(path.join(app, MANIFEST), JSON.stringify({ tool: "style-app-files", folders: { ".": ["victim.woff2"], "public": ["fonts.css"] } }));
    await exportFonts(inter, { appRoot: app });
    expect(readFileSync(path.join(app, "victim.woff2"), "utf8")).toBe("keep");
    expect(existsSync(path.join(app, "public/fonts.css"))).toBe(true);
  });

  it("D3: an old in-folder marker is moved into the manifest and deleted; a second run changes nothing", async () => {
    const app = makeApp();
    installFont(app, "inter");
    installFont(app, "lora");
    await exportFonts(sheetWith({ sans: { family: "Inter", source: "bundled" }, serif: { family: "Lora", source: "bundled" } }), { appRoot: app });
    // Recreate the old layout: a marker in each font folder, no manifest.
    rmSync(path.join(app, MANIFEST));
    for (const slug of ["inter", "lora"]) {
      const files = readdirSync(path.join(app, "public/fonts", slug));
      writeFileSync(path.join(app, "public/fonts", slug, MARKER), JSON.stringify({ tool: "style-app-files", files }) + "\n");
    }
    await exportFonts(inter, { appRoot: app }); // lora is stale: its listed files go, so the migration was read
    expect(badNames(app)).toEqual([]);
    expect(existsSync(path.join(app, "public/fonts/lora"))).toBe(false);
    expect(existsSync(path.join(app, "public/fonts/inter", MARKER))).toBe(false);
    const after1 = tree(app).map((f) => [f, readFileSync(path.join(app, f), "utf8")]);
    await exportFonts(inter, { appRoot: app });
    expect(tree(app).map((f) => [f, readFileSync(path.join(app, f), "utf8")])).toEqual(after1);
  });

  it("D3: a marker-folder of an old run that is no longer exported is cleaned, even with no new export of it", async () => {
    const app = makeApp();
    installFont(app, "inter");
    const old = path.join(app, "public/fonts/old");
    mkdirSync(old, { recursive: true });
    writeFileSync(path.join(old, "a.woff2"), "x");
    writeFileSync(path.join(old, MARKER), JSON.stringify({ files: ["a.woff2"] }));
    await exportFonts(inter, { appRoot: app });
    expect(existsSync(old)).toBe(false);
  });
});
