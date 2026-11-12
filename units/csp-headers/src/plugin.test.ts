import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cspHeaders, type CspHeadersOptions } from "./index";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "csp-headers-"));
  mkdirSync(join(root, "security"));
  writeFileSync(join(root, "security", "csp.txt"), "# policy\ndefault-src 'self'\nconnect-src 'self' https://api.example.test\nframe-ancestors 'none'\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const POLICY = "default-src 'self'; connect-src 'self' https://api.example.test; frame-ancestors 'none'";
const META = "default-src 'self'; connect-src 'self' https://api.example.test";
const page = "<!doctype html><html><head><title>t</title></head><body></body></html>";
const count = (s: string) => (s.match(/http-equiv="Content-Security-Policy"/g) ?? []).length;

function make(command: "serve" | "build", options?: CspHeadersOptions) {
  const p = cspHeaders(options);
  p.configResolved({ command, root, build: { outDir: "dist" } });
  return p;
}
function serve(p: ReturnType<typeof cspHeaders>, kind: "dev" | "preview", url: string) {
  let fn: ((req: { url?: string }, res: { setHeader(n: string, v: string): void }, next: () => void) => void) | undefined;
  const server = { middlewares: { use: (f: NonNullable<typeof fn>) => void (fn = f) } };
  if (kind === "dev") p.configureServer(server);
  else p.configurePreviewServer(server);
  const headers: Record<string, string> = {};
  let nexted = 0;
  fn!({ url }, { setHeader: (n, v) => void (headers[n] = v) }, () => nexted++);
  return { headers, nexted };
}

describe("transformIndexHtml", () => {
  it("adds exactly one meta without frame-ancestors, in dev and in build", () => {
    for (const command of ["serve", "build"] as const) {
      const out = make(command).transformIndexHtml(page, { path: "/index.html" });
      expect(count(out)).toBe(1);
      expect(out).toContain(`content="${META}"`);
      expect(out).not.toContain("frame-ancestors");
    }
  });
  it("replaces an existing meta and never adds a second, even when called twice", () => {
    const p = make("build");
    const once = p.transformIndexHtml(`<head><meta http-equiv="Content-Security-Policy" content="__CSP__"></head>`, { path: "/index.html" });
    expect(count(once)).toBe(1);
    expect(count(p.transformIndexHtml(once, { path: "/index.html" }))).toBe(1);
  });
  it("leaves an excluded page alone", () => {
    const p = make("serve", { exclude: (path) => path.startsWith("/studio") });
    expect(p.transformIndexHtml(page, { path: "/studio.html" })).toBe(page);
    expect(count(p.transformIndexHtml(page, { path: "/index.html" }))).toBe(1);
  });
  it("passes the mode to transformPolicy: dev for serve, build for build", () => {
    const seen: string[] = [];
    const t: CspHeadersOptions["transformPolicy"] = (policy, mode) => (seen.push(mode), policy.replace("connect-src ", `connect-src ws://dev.example.test `));
    expect(make("serve", { transformPolicy: t }).transformIndexHtml(page, { path: "/index.html" })).toContain("connect-src ws://dev.example.test 'self'");
    expect(make("build", { transformPolicy: t }).transformIndexHtml(page, { path: "/index.html" })).toContain("ws://dev.example.test");
    expect(seen).toEqual(["dev", "build"]);
  });
  it("an inline `policy` replaces the file, and a missing file says where it looked", () => {
    expect(make("build", { policy: "img-src 'self'" }).transformIndexHtml(page, { path: "/index.html" })).toContain('content="img-src \'self\'"');
    expect(() => make("build", { policyFile: "nope/csp.txt" }).transformIndexHtml(page, { path: "/index.html" })).toThrow("nope/csp.txt was not found");
  });
});

describe("dev and preview middleware", () => {
  it("sets the full policy (frame-ancestors kept) on a dev response and calls next", () => {
    const r = serve(make("serve"), "dev", "/index.html?x=1");
    expect(r.headers["Content-Security-Policy"]).toBe(POLICY);
    expect(r.nexted).toBe(1);
  });
  it("sets the extra headers too, but never a second policy from them", () => {
    const r = serve(make("serve", { extraHeaders: { "X-Content-Type-Options": "nosniff", "content-security-policy": "x" } }), "preview", "/");
    expect(r.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toBeUndefined();
  });
  it("skips an excluded path and still calls next", () => {
    const r = serve(make("serve", { exclude: (path) => path.startsWith("/__studio/") }), "dev", "/__studio/save?a=1");
    expect(r.headers).toEqual({});
    expect(r.nexted).toBe(1);
  });
  it("preview uses mode build, dev uses mode dev", () => {
    const t: CspHeadersOptions["transformPolicy"] = (policy, mode) => `${policy}; x-mode-${mode} y`;
    expect(serve(make("serve", { transformPolicy: t }), "dev", "/").headers["Content-Security-Policy"]).toContain("x-mode-dev");
    expect(serve(make("serve", { transformPolicy: t }), "preview", "/").headers["Content-Security-Policy"]).toContain("x-mode-build");
  });
  it("reads the file on each request, so an edit shows at once", () => {
    const p = make("serve");
    serve(p, "dev", "/");
    writeFileSync(join(root, "security", "csp.txt"), "default-src 'none'\n");
    expect(serve(p, "dev", "/").headers["Content-Security-Policy"]).toBe("default-src 'none'");
  });
});

describe("writeBundle", () => {
  const out = () => join(root, "dist", "_headers");
  it("writes dist/_headers with the full policy and the extra headers", () => {
    make("build", { extraHeaders: { "Referrer-Policy": "no-referrer" } }).writeBundle();
    expect(readFileSync(out(), "utf8")).toBe(`/*\n  Content-Security-Policy: ${POLICY}\n  Referrer-Policy: no-referrer\n`);
  });
  it("merges with an existing _headers (the app's public/ copy) without a second CSP line", () => {
    mkdirSync(join(root, "dist"));
    writeFileSync(out(), "/*\n  Content-Security-Policy: stale\n  X-Frame-Options: DENY\n\n/assets/*\n  Cache-Control: max-age=1\n");
    const p = make("build");
    p.writeBundle();
    p.writeBundle();
    const text = readFileSync(out(), "utf8");
    expect(text.match(/Content-Security-Policy/g)).toHaveLength(1);
    expect(text).toContain(`Content-Security-Policy: ${POLICY}`);
    expect(text).toContain("X-Frame-Options: DENY");
    expect(text).toContain("/assets/*\n  Cache-Control: max-age=1");
    expect(text).not.toContain("stale");
  });
  it("headersFile: false writes none; a named file is written under that name", () => {
    make("build", { headersFile: false }).writeBundle();
    expect(existsSync(join(root, "dist"))).toBe(false);
    make("build", { headersFile: "custom_headers" }).writeBundle();
    expect(existsSync(join(root, "dist", "custom_headers"))).toBe(true);
  });
  it("writes nothing when serving", () => {
    make("serve").writeBundle();
    expect(existsSync(join(root, "dist"))).toBe(false);
  });
  it("applies transformPolicy with mode build", () => {
    make("build", { transformPolicy: (p, mode) => `${p}; x-${mode} y` }).writeBundle();
    expect(readFileSync(out(), "utf8")).toContain("x-build y");
  });
});

describe("the plugin is a Vite plugin", () => {
  it("is assignable to Vite's Plugin type", () => {
    const p: Plugin = cspHeaders();
    expect(p.name).toBe("csp-headers");
  });
});
