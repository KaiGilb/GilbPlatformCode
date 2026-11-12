import { describe, expect, it } from "vitest";
import { headersFileText, mergeHeadersFile, metaPolicy, readPolicy, withMetaPolicy } from "./index";

describe("readPolicy", () => {
  it("drops comments and blank lines and joins the directives with '; '", () => {
    const text = "# the policy\n\ndefault-src 'self'\nimg-src 'self' data:  # inline comment\n\n  connect-src 'self' https://api.example.test\n";
    expect(readPolicy(text)).toBe("default-src 'self'; img-src 'self' data:; connect-src 'self' https://api.example.test");
  });
  it("accepts a trailing ; on a line and a one-line policy", () => {
    expect(readPolicy("default-src 'self';\nimg-src 'self';")).toBe("default-src 'self'; img-src 'self'");
    expect(readPolicy("default-src 'self'; img-src 'self'")).toBe("default-src 'self'; img-src 'self'");
  });
  it("handles CRLF", () => {
    expect(readPolicy("a 'self'\r\nb 'self'\r\n")).toBe("a 'self'; b 'self'");
  });
  it("refuses an empty result", () => {
    expect(() => readPolicy("")).toThrow("is empty");
    expect(() => readPolicy("# only a comment\n\n  \n;\n")).toThrow("is empty");
  });
});

describe("metaPolicy", () => {
  it("drops frame-ancestors, report-uri, report-to and sandbox, and keeps the rest in order", () => {
    const p = "default-src 'self'; frame-ancestors 'none'; img-src 'self'; report-uri /r; report-to g; sandbox allow-scripts; connect-src 'self'";
    expect(metaPolicy(p)).toBe("default-src 'self'; img-src 'self'; connect-src 'self'");
  });
  it("is case-insensitive on the directive name and leaves a policy without them unchanged", () => {
    expect(metaPolicy("Frame-Ancestors 'none'; default-src 'self'")).toBe("default-src 'self'");
    expect(metaPolicy("default-src 'self'; img-src data:")).toBe("default-src 'self'; img-src data:");
  });
});

describe("headersFileText", () => {
  it("is a /* block with the policy then the extra headers", () => {
    expect(headersFileText("default-src 'self'", { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" })).toBe(
      "/*\n  Content-Security-Policy: default-src 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n",
    );
  });
  it("with no extra headers is the policy alone, and never repeats the policy from extra", () => {
    expect(headersFileText("a 'self'")).toBe("/*\n  Content-Security-Policy: a 'self'\n");
    expect(headersFileText("a 'self'", { "content-security-policy": "other" })).toBe("/*\n  Content-Security-Policy: a 'self'\n");
  });
});

describe("mergeHeadersFile", () => {
  it("adds a /* block to a file that has none, keeping the other blocks", () => {
    const out = mergeHeadersFile("/assets/*\n  Cache-Control: max-age=1\n", "a 'self'");
    expect(out).toBe("/assets/*\n  Cache-Control: max-age=1\n\n/*\n  Content-Security-Policy: a 'self'\n");
  });
  it("replaces an existing CSP line in the /* block instead of adding a second", () => {
    const out = mergeHeadersFile("/*\n  content-security-policy: old\n  X-Frame-Options: DENY\n", "new 'self'", { "Referrer-Policy": "no-referrer" });
    expect(out.match(/content-security-policy/gi)).toHaveLength(1);
    expect(out).toContain("  Content-Security-Policy: new 'self'");
    expect(out).toContain("  X-Frame-Options: DENY");
    expect(out).toContain("  Referrer-Policy: no-referrer");
    expect(out).not.toContain("old");
  });
  it("is stable: merging twice gives the same text", () => {
    const once = mergeHeadersFile("/*\n  X-Frame-Options: DENY\n\n/a\n  X: y\n", "p 'self'");
    expect(mergeHeadersFile(once, "p 'self'")).toBe(once);
    expect(once).toContain("/a\n  X: y");
  });
  it("an empty file is the plain text", () => {
    expect(mergeHeadersFile("", "p 'self'")).toBe(headersFileText("p 'self'"));
  });
});

describe("withMetaPolicy", () => {
  const page = "<!doctype html><html><head><title>t</title></head><body></body></html>";
  const count = (s: string) => (s.match(/http-equiv="Content-Security-Policy"/gi) ?? []).length;
  it("adds one meta right after <head>", () => {
    const out = withMetaPolicy(page, "default-src 'self'");
    expect(count(out)).toBe(1);
    expect(out).toContain('<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src \'self\'">');
  });
  it("replaces an existing meta where it stands, whatever its attribute order or case", () => {
    const html = `<head><META content="old" HTTP-EQUIV='content-security-policy'><title>t</title></head>`;
    const out = withMetaPolicy(html, "new 'self'");
    expect(count(out)).toBe(1);
    expect(out).not.toContain("old");
    expect(out.indexOf("<meta")).toBeLessThan(out.indexOf("<title>"));
  });
  it("removes a second CSP meta and leaves other metas alone", () => {
    const html = `<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="a"><meta http-equiv="Content-Security-Policy" content="b"></head>`;
    const out = withMetaPolicy(html, "c");
    expect(count(out)).toBe(1);
    expect(out).toContain('<meta charset="utf-8">');
  });
  it("replaces a placeholder content and escapes quotes", () => {
    const out = withMetaPolicy(`<head><meta http-equiv="Content-Security-Policy" content="__CSP__"></head>`, `a "x"`);
    expect(out).not.toContain("__CSP__");
    expect(out).toContain('content="a &quot;x&quot;"');
  });
  it("puts the tag first when the page has no <head>", () => {
    expect(withMetaPolicy("<p>hi</p>", "a").startsWith("<meta http-equiv")).toBe(true);
  });
});
