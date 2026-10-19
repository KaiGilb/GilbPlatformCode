// @vitest-environment node
// Spec: the Gilb Websites site's Cycle004 phone-speed requirements as the source file states them
// (3P.V.SitePageExperienceSpeed: the entry must not download during first paint; 3P.V.MeetingRequestPathEfficiency: a
// submit made before the script is ready must not navigate away or lose what was typed), Rule_Code_gwcunit.
// The first tests port the site's 8 tests (server/__tests__/entry-after-paint.test.mjs, b78b1f9) to vitest; the rest
// are new for this unit: drift is loud, escaping, the form helper, the build check.
import { describe, expect, test } from "vitest";
import { runInNewContext } from "node:vm";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTRY_TAG, FALLBACK_MS, TRIGGER_EVENTS, LOADER_MARK, claimGuardedForm, entryStatus, loaderScript, rewriteEntry, rewriteRenderParts,
} from "./entryAfterPaint";

const unit = fileURLToPath(new URL("..", import.meta.url));
const TAG = '<script type="module" src="/_nuxt/Ab_c-1.js" crossorigin></script>';

describe("rewriteEntry (ported)", () => {
  test("replaces the entry module tag with one inline loader for the same URL", () => {
    const out = rewriteEntry(`<link rel="stylesheet" href="/a.css">${TAG}<link rel="icon">`);
    expect(out).not.toContain('type="module"');
    expect(out).toMatch(/^<link rel="stylesheet" href="\/a.css"><script>\/\*entry-after-paint\*\/\(function\(\)\{/);
    expect(out).toContain('"/_nuxt/Ab_c-1.js"');
    expect(out.endsWith('</script><link rel="icon">')).toBe(true);
  });
  test("leaves HTML without that exact tag untouched (safe fallback on a markup change)", () => {
    for (const html of ['<script type="module" src="/_nuxt/a.js"></script>', '<script src="/vendor/lenis/boot.js" defer></script>', "<p>no scripts</p>"]) {
      expect(rewriteEntry(html)).toBe(html);
    }
  });
});

/** Run the loader against a fake browser; returns handles to drive it. */
function fakeBrowser(readyState = "complete") {
  const winL: Record<string, { fn: (e?: unknown) => void }[]> = {}, docL: typeof winL = {};
  const timers: { fn: () => void; ms: number }[] = [];
  const appended: unknown[] = [];
  const on = (store: typeof winL) => (type: string, fn: (e?: unknown) => void) => { (store[type] ||= []).push({ fn }); };
  const document = { readyState, addEventListener: on(docL), createElement: () => ({}), head: { appendChild: (el: unknown) => appended.push(el) } };
  const window = { addEventListener: on(winL) };
  runInNewContext(loaderScript("/_nuxt/entry.js"), { window, document, setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }) });
  const fire = (store: typeof winL, type: string, ev: unknown = {}) => (store[type] || []).forEach((l) => l.fn(ev));
  return { appended, timers, winL, docL, fireWin: (t: string) => fire(winL, t), fireDoc: (t: string, ev?: unknown) => fire(docL, t, ev) };
}

describe("loader (ported)", () => {
  test("adds nothing until load, an interaction or the fallback timer", () => {
    const b = fakeBrowser();
    expect(b.appended).toHaveLength(0);
    expect(Object.keys(b.winL).sort()).toEqual(["load", ...TRIGGER_EVENTS].sort());
    expect(b.timers[0]!.ms).toBe(FALLBACK_MS);
  });
  test("on window load: appends ONE module script, crossorigin, same URL, and only once", () => {
    const b = fakeBrowser();
    b.fireWin("load"); b.fireWin("touchstart"); b.timers[0]!.fn();
    expect(b.appended).toEqual([{ type: "module", crossOrigin: "anonymous", src: "/_nuxt/entry.js" }]);
  });
  test("an interaction while the page is still parsing waits for DOMContentLoaded", () => {
    const b = fakeBrowser("loading");
    b.fireWin("keydown");
    expect(b.appended).toHaveLength(0);
    b.fireDoc("DOMContentLoaded");
    expect(b.appended).toHaveLength(1);
  });
  test("each trigger event, and the fallback timer alone, start the download", () => {
    for (const ev of TRIGGER_EVENTS) { const b = fakeBrowser(); b.fireWin(ev); expect(b.appended, ev).toHaveLength(1); }
    const b = fakeBrowser(); b.timers[0]!.fn(); expect(b.appended).toHaveLength(1);
  });
});

describe("early-submit guard (ported)", () => {
  const form = (attrs: Record<string, string>) => {
    const a = new Map(Object.entries(attrs));
    return { hasAttribute: (n: string) => a.has(n), setAttribute: (n: string, v: string) => void a.set(n, v), attrs: a };
  };
  const submitEvent = (target: unknown) => { const ev = { target, prevented: false, preventDefault() { ev.prevented = true; } }; return ev; };
  test("holds a submit of a guarded form before the script: no navigation, marked pending, entry starts", () => {
    const b = fakeBrowser(); const f = form({ "data-sc-guard": "" }); const ev = submitEvent(f);
    b.fireDoc("submit", ev);
    expect(ev.prevented).toBe(true);
    expect(f.attrs.has("data-sc-pending")).toBe(true);
    expect(f.attrs.get("aria-busy")).toBe("true");
    expect(b.appended).toHaveLength(1);
  });
  test("steps aside once the script owns the form (data-sc-live)", () => {
    const b = fakeBrowser(); const ev = submitEvent(form({ "data-sc-guard": "", "data-sc-live": "" }));
    b.fireDoc("submit", ev);
    expect(ev.prevented).toBe(false);
  });
  test("ignores forms that are not marked data-sc-guard, and events with no usable target", () => {
    const b = fakeBrowser();
    for (const t of [form({}), null, {}]) { const ev = submitEvent(t); b.fireDoc("submit", ev); expect(ev.prevented).toBe(false); }
  });
});

/** A page as Nuxt 3.21 renders it: the entry tag in <head>, a prefetch link, an inline config script. */
const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/_nuxt/entry.css">${TAG}<link rel="modulepreload" as="script" crossorigin href="/_nuxt/Ab_c-1.js"></head><body><div id="__nuxt"></div><script>window.__NUXT__={}</script></body></html>`;

describe("drift is loud, not silent", () => {
  test("a page as Nuxt 3.21 renders it is rewritten and read back as moved", () => {
    expect(entryStatus(PAGE)).toBe("unmoved");
    const out = rewriteEntry(PAGE);
    expect(entryStatus(out)).toBe("moved");
    expect(out).toContain("modulepreload");
  });
  test.each([
    ["crossorigin written with a value", '<script type="module" src="/_nuxt/a.js" crossorigin="">'],
    ["attributes in another order", '<script src="/_nuxt/a.js" type="module" crossorigin>'],
    ["a nonce added", '<script type="module" src="/_nuxt/a.js" crossorigin nonce="x">'],
    ["an async attribute added", '<script type="module" src="/_nuxt/a.js" async crossorigin>'],
    ["single quotes", "<script type='module' src='/_nuxt/a.js' crossorigin>"],
  ])("when Nuxt writes %s the tag is NOT rewritten and entryStatus says so", (_n, tag) => {
    const html = `<head>${tag}</script></head>`;
    expect(rewriteEntry(html)).toBe(html);
    expect(entryStatus(html)).toBe("unmoved");
  });
  test("a page with no script and one with the loader but no entry are not 'unmoved'", () => {
    expect(entryStatus("<p>x</p>")).toBe("none");
    expect(entryStatus(rewriteEntry(PAGE))).toBe("moved");
  });
  test("the build check fails on a build whose pages were not rewritten, and passes on one that was", () => {
    const dir = mkdtempSync(join(tmpdir(), "eap-"));
    try {
      mkdirSync(join(dir, "good")); mkdirSync(join(dir, "bad"));
      const run = (d: string) => spawnSync(process.execPath, [join(unit, "scripts", "check-rendered-entry.mjs"), d], { encoding: "utf8" });
      writeFileSync(join(dir, "good", "index.html"), rewriteEntry(PAGE));
      expect(run(join(dir, "good")).status).toBe(0);
      writeFileSync(join(dir, "bad", "index.html"), PAGE.replace(" crossorigin>", ' crossorigin="">'));
      const r = run(join(dir, "bad"));
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/FAIL/);
      writeFileSync(join(dir, "bad", "index.html"), "<p>no scripts at all</p>");
      expect(run(join(dir, "bad")).status).toBe(1);
      expect(run(join(dir, "nope")).status).toBe(2);
      expect(spawnSync(process.execPath, [join(unit, "scripts", "check-rendered-entry.mjs")], { encoding: "utf8" }).status).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("the build check is in the packed unit", () => {
    const pkg = JSON.parse(readFileSync(join(unit, "package.json"), "utf8"));
    expect(pkg.files).toContain("scripts/check-rendered-entry.mjs");
  });
});

describe("the loader text and the render hook", () => {
  test("starts with the mark, is ES5-safe text, and cannot close its own script element", () => {
    const s = loaderScript('/_nuxt/</script><script>x.js');
    expect(s.startsWith(LOADER_MARK)).toBe(true);
    expect(s).not.toContain("</script>");
    expect(s).not.toMatch(/=>|\blet\b|\bconst\b|`/);
  });
  test("the loader is valid JavaScript", () => {
    expect(() => new Function(loaderScript("/_nuxt/a.js"))).not.toThrow();
  });
  test("rewriteRenderParts rewrites the head and the end of the body in place", () => {
    const parts = { head: ["<meta>", TAG], bodyAppend: [TAG, "<p></p>"] };
    rewriteRenderParts(parts);
    expect(parts.head[0]).toBe("<meta>");
    expect([parts.head[1], parts.bodyAppend[0]].every((c) => c!.startsWith("<script>"))).toBe(true);
    expect(parts.bodyAppend[1]).toBe("<p></p>");
  });
  test("ENTRY_TAG matches the site's entry tag and captures the URL", () => {
    expect(ENTRY_TAG.exec(TAG)![1]).toBe("/_nuxt/Ab_c-1.js");
  });
});

describe("claimGuardedForm", () => {
  const form = (attrs: string[]) => {
    const a = new Set(attrs);
    return { setAttribute: (n: string) => void a.add(n), removeAttribute: (n: string) => void a.delete(n), hasAttribute: (n: string) => a.has(n), a };
  };
  test("marks the form live, clears busy, and says nothing to replay when nothing was held", () => {
    const f = form(["data-sc-guard", "aria-busy"]);
    expect(claimGuardedForm(f)).toBe(false);
    expect([...f.a].sort()).toEqual(["data-sc-guard", "data-sc-live"]);
  });
  test("a held submit is reported once and the marker cleared", () => {
    const f = form(["data-sc-guard", "data-sc-pending", "aria-busy"]);
    expect(claimGuardedForm(f)).toBe(true);
    expect(f.a.has("data-sc-pending")).toBe(false);
    expect(claimGuardedForm(f)).toBe(false);
  });
});
