import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { geoOrigin, isGeoEntityId, isGeoUrl, resetGeoOrigin, setGeoOrigin } from "./geoOrigin";
import * as api from "./index";

afterEach(() => resetGeoOrigin());

describe("setGeoOrigin / geoOrigin", () => {
  test("the value that was set is the value given back", () => {
    setGeoOrigin("https://geo.example.test");
    expect(geoOrigin()).toBe("https://geo.example.test");
  });

  test("http is accepted as well as https", () => {
    setGeoOrigin("http://geo.example.test:8080");
    expect(geoOrigin()).toBe("http://geo.example.test:8080");
  });

  test("a trailing slash is removed", () => {
    setGeoOrigin("https://geo.example.test/");
    expect(geoOrigin()).toBe("https://geo.example.test");
  });

  test("the text is trimmed first", () => {
    setGeoOrigin("  https://example.test  ");
    expect(geoOrigin()).toBe("https://example.test");
    setGeoOrigin("\n https://example.test/ \t");
    expect(geoOrigin()).toBe("https://example.test");
  });

  test("an explicit default port is dropped, a port that is not the default is kept", () => {
    setGeoOrigin("https://Geo.Example.Test:443");
    expect(geoOrigin()).toBe("https://geo.example.test");
    setGeoOrigin("http://example.test:80/");
    expect(geoOrigin()).toBe("http://example.test");
    setGeoOrigin("http://example.test:8080");
    expect(geoOrigin()).toBe("http://example.test:8080");
    setGeoOrigin("https://example.test:8443/");
    expect(geoOrigin()).toBe("https://example.test:8443");
  });

  test("upper-case host letters and an upper-case scheme are normalised", () => {
    setGeoOrigin("HTTPS://Geo.Example.TEST");
    expect(geoOrigin()).toBe("https://geo.example.test");
  });

  test("an IPv6 host keeps its brackets", () => {
    setGeoOrigin("http://[::1]:8080");
    expect(geoOrigin()).toBe("http://[::1]:8080");
  });

  test("a second call replaces the first", () => {
    setGeoOrigin("https://one.example.test");
    setGeoOrigin("https://two.example.test");
    expect(geoOrigin()).toBe("https://two.example.test");
  });

  test("an entity address is built from it", () => {
    setGeoOrigin("https://geo.example.test/");
    expect(`${geoOrigin()}/base/e/oslo`).toBe("https://geo.example.test/base/e/oslo");
  });

  test.each([
    [""],
    ["   "],
    ["geo.example.test"],
    ["//geo.example.test"],
    ["/base/t/"],
    ["https://"],
    ["http://"],
    ["https:///"],
    ["ftp://example.test"],
    ["file:///etc"],
    ["mailto:a@example.test"],
    ["javascript:alert(1)"],
  ])("%j throws a TypeError that starts with geo-origin:", (bad) => {
    expect(() => setGeoOrigin(bad)).toThrow(TypeError);
    expect(() => setGeoOrigin(bad)).toThrow(/^geo-origin: /);
  });

  test.each([
    ["https://x//", /no path/],
    ["https://geo.example.test//", /no path/],
    ["https://example.test/base", /no path/],
    ["https://example.test/base/", /no path/],
    ["https://example.test/ontology/", /no path/],
    ["https://example.test/base/e/oslo", /no path/],
    ["https://example.test?x=1", /no query/],
    ["https://example.test/?x=1", /no query/],
    ["https://example.test?", /no query/],
    ["https://example.test#top", /no fragment/],
    ["https://example.test/#", /no fragment/],
    ["https://user@example.test", /user name or password/],
    ["https://user:secret@example.test", /user name or password/],
  ])("%j is more than an origin: a TypeError that says what is wrong", (bad, why) => {
    expect(() => setGeoOrigin(bad)).toThrow(TypeError);
    expect(() => setGeoOrigin(bad)).toThrow(/^geo-origin: /);
    expect(() => setGeoOrigin(bad)).toThrow(why);
  });

  test("the message of a wrong scheme names the scheme rule, and of an unparsable text says it is no URL", () => {
    expect(() => setGeoOrigin("ftp://example.test")).toThrow(/scheme must be http or https/);
    expect(() => setGeoOrigin("not a url")).toThrow(/not a URL/);
    expect(() => setGeoOrigin("https://")).toThrow(/not a URL/);
  });

  test("a bad value leaves the earlier value in place", () => {
    setGeoOrigin("https://one.example.test");
    expect(() => setGeoOrigin("nope")).toThrow(TypeError);
    expect(geoOrigin()).toBe("https://one.example.test");
  });

  test("a bad value with nothing set earlier leaves it unset", () => {
    expect(() => setGeoOrigin("")).toThrow(TypeError);
    expect(() => geoOrigin()).toThrow("geo-origin: call setGeoOrigin(<origin>) once at start-up");
  });

  test("never set: geoOrigin throws an Error with the call-to-action message", () => {
    expect(() => geoOrigin()).toThrow(Error);
    expect(() => geoOrigin()).not.toThrow(TypeError);
    expect(() => geoOrigin()).toThrow("geo-origin: call setGeoOrigin(<origin>) once at start-up");
  });
});

describe("resetGeoOrigin", () => {
  test("forgets the origin: geoOrigin throws again", () => {
    setGeoOrigin("https://geo.example.test");
    resetGeoOrigin();
    expect(() => geoOrigin()).toThrow("geo-origin: call setGeoOrigin(<origin>) once at start-up");
  });

  test("is harmless when nothing was set", () => {
    expect(() => resetGeoOrigin()).not.toThrow();
  });
});

describe("the export list", () => {
  test("is exactly the five functions", () => {
    expect(Object.keys(api).sort()).toEqual(["geoOrigin", "isGeoEntityId", "isGeoUrl", "resetGeoOrigin", "setGeoOrigin"]);
  });
});

describe("isGeoEntityId (the source's test over the catalogue's origin)", () => {
  test("a row under <origin>/base/e/ is a catalogue row, anything else is not", () => {
    setGeoOrigin("https://geo.example.test/");
    expect(isGeoEntityId("https://geo.example.test/base/e/osm-r-1")).toBe(true);
    expect(isGeoEntityId("https://geo.example.test/base/e/")).toBe(true);
    expect(isGeoEntityId("https://geo.example.test/base/search?q=x")).toBe(false);
    expect(isGeoEntityId("https://other.example.test/base/e/osm-r-1")).toBe(false);
    expect(isGeoEntityId("base:e/osm-r-1")).toBe(false);
    expect(isGeoEntityId(null)).toBe(false);
    expect(isGeoEntityId(42)).toBe(false);
    expect(isGeoEntityId(undefined)).toBe(false);
  });
  test("it follows the origin that was set", () => {
    setGeoOrigin("https://one.example.test");
    expect(isGeoEntityId("https://two.example.test/base/e/x")).toBe(false);
    setGeoOrigin("https://two.example.test");
    expect(isGeoEntityId("https://two.example.test/base/e/x")).toBe(true);
  });
  test("never set: it throws like geoOrigin()", () => {
    expect(() => isGeoEntityId("https://geo.example.test/base/e/x")).toThrow("geo-origin: call setGeoOrigin");
  });
});

describe("isGeoUrl (the fence: inside the catalogue by PARSED origin, never by text)", () => {
  beforeEach(() => setGeoOrigin("https://geo.example.test"));
  test.each([
    ["https://geo.example.test/base/e/x"],
    ["https://geo.example.test/base/search?q=a&type=City"],
    ["https://geo.example.test/files/flag-x"],
    ["https://GEO.example.test:443/base/e/x"],
    ["https://geo.example.test"],
  ])("%j is inside", (u) => expect(isGeoUrl(u)).toBe(true));
  test.each([
    ["https://evil.example/x"],
    ["https://evil.example/?u=https://geo.example.test/base/e/x"],
    ["https://evil.example/#https://geo.example.test/base/e/x"],
    ["https://geo.example.test@evil.example/base/e/x"],
    ["https://geo.example.test:pw@geo.example.test/base/e/x"],
    ["https://geo.example.test.evil.example/base/e/x"],
    ["https://evilgeo.example.test/base/e/x"],
    ["http://geo.example.test/base/e/x"],
    ["https://geo.example.test:8443/base/e/x"],
    ["base:e/x"],
    ["/base/e/x"],
    ["//geo.example.test/base/e/x"],
    ["javascript:alert(1)//geo.example.test"],
    ["data:text/plain,https://geo.example.test/base/e/x"],
    [""],
    [null],
    [{ href: "https://geo.example.test/" }],
  ])("%j is outside", (u) => expect(isGeoUrl(u)).toBe(false));
});
