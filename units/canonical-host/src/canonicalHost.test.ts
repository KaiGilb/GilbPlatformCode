import { describe, expect, it } from "vitest";
import { canonicalAppUrl } from "./canonicalHost";

const hosts = ["www.example.test"];

describe("canonicalAppUrl", () => {
  it("moves an exact host and keeps path, query, and hash", () => {
    expect(
      canonicalAppUrl(
        {
          protocol: "https:",
          hostname: "www.example.test",
          pathname: "/app/",
          search: "?x=1",
          hash: "#top",
        },
        hosts,
        "example.test",
      ),
    ).toBe("https://example.test/app/?x=1#top");
  });

  it("does not match a different case, a port, or a suffix, and forces a strange scheme", () => {
    const page = {
      protocol: "https:",
      hostname: "WWW.EXAMPLE.TEST",
      pathname: "/",
      search: "",
      hash: "",
    };
    expect(canonicalAppUrl(page, hosts, "example.test")).toBeNull();
    expect(
      canonicalAppUrl({ ...page, hostname: "www.example.test:443" }, hosts, "example.test"),
    ).toBeNull();
    expect(
      canonicalAppUrl({ ...page, hostname: "notwww.example.test" }, hosts, "example.test"),
    ).toBeNull();
    expect(canonicalAppUrl({ ...page, hostname: "www.example.test" }, [], "example.test")).toBeNull();
    expect(
      canonicalAppUrl(
        { protocol: "file:", hostname: "www.example.test", pathname: "", search: "?x=1", hash: "" },
        hosts,
        "example.test",
      ),
    ).toBe("https://example.test?x=1");
  });

  it("keeps http", () => {
    expect(
      canonicalAppUrl(
        { protocol: "http:", hostname: "www.example.test", pathname: "/", search: "", hash: "" },
        hosts,
        "example.test",
      ),
    ).toBe("http://example.test/");
  });
});
