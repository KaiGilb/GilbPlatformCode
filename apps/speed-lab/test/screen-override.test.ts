// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { cacheControlOf, contentTypeOf, overridePath, parseOverride, spaFallback } from "../scripts/screen-core.mjs";

const PREFIX = "https://gilb.com/app/";

describe("parseOverride", () => {
  it("splits a prefix that ends in / from a folder", () => {
    expect(parseOverride("https://gilb.com/app/=/path/to/dist")).toEqual({
      prefix: "https://gilb.com/app/",
      dir: "/path/to/dist",
    });
    expect(parseOverride("http://127.0.0.1:5262/=/tmp/page")).toEqual({
      prefix: "http://127.0.0.1:5262/",
      dir: "/tmp/page",
    });
    expect(parseOverride("https://gilb.com/app/=/path=with=equals")).toEqual({
      prefix: "https://gilb.com/app/",
      dir: "/path=with=equals",
    });
  });

  it("rejects a missing =, a prefix that does not end in /, and a non-http prefix", () => {
    expect(() => parseOverride("https://gilb.com/app/")).toThrow("separated by =");
    expect(() => parseOverride("https://gilb.com/app/=")).toThrow("override needs a folder");
    expect(() => parseOverride("https://gilb.com/app=/tmp/dist")).toThrow("override prefix must end with /");
    expect(() => parseOverride("ftp://example.com/=/tmp/dist")).toThrow("override prefix must be http or https");
    expect(() => parseOverride("file:///tmp/=/tmp/dist")).toThrow("override prefix must be http or https");
    expect(() => parseOverride("not a url=/tmp/dist")).toThrow("override prefix is not a url");
  });
});

describe("overridePath", () => {
  it("drops the query and the hash, and decodes the path", () => {
    expect(overridePath(PREFIX, "https://gilb.com/app/assets/app.js?v=1#h")).toEqual({
      kind: "file",
      rel: "assets/app.js",
    });
    expect(overridePath(PREFIX, "https://gilb.com/app/a.js?x=../y")).toEqual({ kind: "file", rel: "a.js" });
    expect(overridePath(PREFIX, "https://gilb.com/app/ok.js#../x")).toEqual({ kind: "file", rel: "ok.js" });
    expect(overridePath(PREFIX, "https://gilb.com/app/my%20file.txt")).toEqual({ kind: "file", rel: "my file.txt" });
  });

  it("maps an empty path and a trailing slash to index.html", () => {
    expect(overridePath(PREFIX, "https://gilb.com/app/")).toEqual({ kind: "file", rel: "index.html" });
    expect(overridePath(PREFIX, "https://gilb.com/app/?x=1#h")).toEqual({ kind: "file", rel: "index.html" });
    expect(overridePath(PREFIX, "https://gilb.com/app/records/")).toEqual({ kind: "file", rel: "index.html" });
    expect(overridePath(PREFIX, "https://gilb.com/app/records/?x=1")).toEqual({ kind: "file", rel: "index.html" });
  });

  it("rejects .. after decoding, and leaves other hosts outside", () => {
    expect(overridePath(PREFIX, "https://gilb.com/app/../secret")).toEqual({ kind: "bad" });
    expect(overridePath(PREFIX, "https://gilb.com/app/foo/../../etc/passwd")).toEqual({ kind: "bad" });
    expect(overridePath(PREFIX, "https://gilb.com/app/%2e%2e/secret")).toEqual({ kind: "bad" });
    expect(overridePath(PREFIX, "https://gilb.com/app/foo/%2e%2e/secret")).toEqual({ kind: "bad" });
    expect(overridePath(PREFIX, "https://gilb.com/app/foo..bar.txt")).toEqual({ kind: "bad" });
    expect(overridePath(PREFIX, "https://gilb.com/app/%ZZ")).toEqual({ kind: "bad" });
    expect(overridePath(PREFIX, "https://gilb.com/other/x.js")).toEqual({ kind: "outside" });
    expect(overridePath(PREFIX, "https://gilb.com/application/x.js")).toEqual({ kind: "outside" });
    expect(overridePath(PREFIX, "https://evil.com/app/x.js")).toEqual({ kind: "outside" });
    expect(overridePath(PREFIX, "http://gilb.com/app/x.js")).toEqual({ kind: "outside" });
    expect(overridePath(PREFIX, "not a url")).toEqual({ kind: "outside" });
  });

  it("keeps a same-origin path that is not the prefix", () => {
    expect(overridePath("http://127.0.0.1:5262/", "http://127.0.0.1:5262/img?id=1&delay=2")).toEqual({
      kind: "file",
      rel: "img",
    });
    expect(overridePath("http://127.0.0.1:5262/", "http://127.0.0.1:5262/")).toEqual({
      kind: "file",
      rel: "index.html",
    });
  });
});

describe("contentTypeOf", () => {
  it("names the types the override serves, and falls back for the rest", () => {
    expect(contentTypeOf("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeOf("assets/app.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeOf("mod.mjs")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeOf("app.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeOf("version.json")).toBe("application/json");
    expect(contentTypeOf("site.webmanifest")).toBe("application/manifest+json");
    expect(contentTypeOf("icon.svg")).toBe("image/svg+xml");
    expect(contentTypeOf("a.png")).toBe("image/png");
    expect(contentTypeOf("a.jpg")).toBe("image/jpeg");
    expect(contentTypeOf("a.jpeg")).toBe("image/jpeg");
    expect(contentTypeOf("a.webp")).toBe("image/webp");
    expect(contentTypeOf("favicon.ico")).toBe("image/x-icon");
    expect(contentTypeOf("f.woff")).toBe("font/woff");
    expect(contentTypeOf("f.woff2")).toBe("font/woff2");
    expect(contentTypeOf("robots.txt")).toBe("text/plain; charset=utf-8");
    expect(contentTypeOf("app.js.map")).toBe("application/json");
    expect(contentTypeOf("DIR/FILE.PNG")).toBe("image/png");
    expect(contentTypeOf("file.bin")).toBe("application/octet-stream");
    expect(contentTypeOf("noext")).toBe("application/octet-stream");
  });
});

describe("spaFallback", () => {
  it("is true when the last segment has no dot", () => {
    expect(spaFallback("records")).toBe(true);
    expect(spaFallback("records/123")).toBe(true);
    expect(spaFallback("img")).toBe(true);
    expect(spaFallback("index.html")).toBe(false);
    expect(spaFallback("assets/app.js")).toBe(false);
    expect(spaFallback("favicon.ico")).toBe(false);
    expect(spaFallback("records/index.html")).toBe(false);
    expect(spaFallback("")).toBe(false);
    expect(spaFallback("records/")).toBe(false);
  });
});

describe("cacheControlOf", () => {
  it("does not cache index.html, and marks assets immutable", () => {
    expect(cacheControlOf("index.html")).toBe("no-cache");
    expect(cacheControlOf("docs/index.html")).toBe("no-cache");
    expect(cacheControlOf("assets/app.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlOf("assets/nested/a.css")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlOf("favicon.ico")).toBe("no-cache");
    expect(cacheControlOf("version.json")).toBe("no-cache");
  });
});
