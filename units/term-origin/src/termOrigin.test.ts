import { afterEach, describe, expect, test } from "vitest";
import { resetTermOrigin, setTermOrigin, termOrigin } from "./termOrigin";
import * as api from "./index";

afterEach(() => resetTermOrigin());

describe("setTermOrigin / termOrigin", () => {
  test("the value that was set is the value given back", () => {
    setTermOrigin("https://ontology.example.test");
    expect(termOrigin()).toBe("https://ontology.example.test");
  });

  test("http is accepted as well as https", () => {
    setTermOrigin("http://ontology.example.test:8080");
    expect(termOrigin()).toBe("http://ontology.example.test:8080");
  });

  test("a trailing slash is removed", () => {
    setTermOrigin("https://ontology.example.test/");
    expect(termOrigin()).toBe("https://ontology.example.test");
  });

  test("the text is trimmed first", () => {
    setTermOrigin("  https://example.test  ");
    expect(termOrigin()).toBe("https://example.test");
    setTermOrigin("\n https://example.test/ \t");
    expect(termOrigin()).toBe("https://example.test");
  });

  test("an explicit default port is dropped, a port that is not the default is kept", () => {
    setTermOrigin("https://Ontology.Example.Test:443");
    expect(termOrigin()).toBe("https://ontology.example.test");
    setTermOrigin("http://example.test:80/");
    expect(termOrigin()).toBe("http://example.test");
    setTermOrigin("http://example.test:8080");
    expect(termOrigin()).toBe("http://example.test:8080");
    setTermOrigin("https://example.test:8443/");
    expect(termOrigin()).toBe("https://example.test:8443");
  });

  test("upper-case host letters and an upper-case scheme are normalised", () => {
    setTermOrigin("HTTPS://Ontology.Example.TEST");
    expect(termOrigin()).toBe("https://ontology.example.test");
  });

  test("an IPv6 host keeps its brackets", () => {
    setTermOrigin("http://[::1]:8080");
    expect(termOrigin()).toBe("http://[::1]:8080");
  });

  test("a second call replaces the first", () => {
    setTermOrigin("https://one.example.test");
    setTermOrigin("https://two.example.test");
    expect(termOrigin()).toBe("https://two.example.test");
  });

  test("a type address is built from it", () => {
    setTermOrigin("https://ontology.example.test/");
    expect(`${termOrigin()}/base/t/Person`).toBe("https://ontology.example.test/base/t/Person");
  });

  test.each([
    [""],
    ["   "],
    ["ontology.example.test"],
    ["//ontology.example.test"],
    ["/base/t/"],
    ["https://"],
    ["http://"],
    ["https:///"],
    ["ftp://example.test"],
    ["file:///etc"],
    ["mailto:a@example.test"],
    ["javascript:alert(1)"],
  ])("%j throws a TypeError that starts with term-origin:", (bad) => {
    expect(() => setTermOrigin(bad)).toThrow(TypeError);
    expect(() => setTermOrigin(bad)).toThrow(/^term-origin: /);
  });

  test.each([
    ["https://x//", /no path/],
    ["https://ontology.example.test//", /no path/],
    ["https://example.test/base", /no path/],
    ["https://example.test/base/", /no path/],
    ["https://example.test/ontology/", /no path/],
    ["https://example.test/base/t/Person", /no path/],
    ["https://example.test?x=1", /no query/],
    ["https://example.test/?x=1", /no query/],
    ["https://example.test?", /no query/],
    ["https://example.test#top", /no fragment/],
    ["https://example.test/#", /no fragment/],
    ["https://user@example.test", /user name or password/],
    ["https://user:secret@example.test", /user name or password/],
  ])("%j is more than an origin: a TypeError that says what is wrong", (bad, why) => {
    expect(() => setTermOrigin(bad)).toThrow(TypeError);
    expect(() => setTermOrigin(bad)).toThrow(/^term-origin: /);
    expect(() => setTermOrigin(bad)).toThrow(why);
  });

  test("the message of a wrong scheme names the scheme rule, and of an unparsable text says it is no URL", () => {
    expect(() => setTermOrigin("ftp://example.test")).toThrow(/scheme must be http or https/);
    expect(() => setTermOrigin("not a url")).toThrow(/not a URL/);
    expect(() => setTermOrigin("https://")).toThrow(/not a URL/);
  });

  test("a bad value leaves the earlier value in place", () => {
    setTermOrigin("https://one.example.test");
    expect(() => setTermOrigin("nope")).toThrow(TypeError);
    expect(termOrigin()).toBe("https://one.example.test");
  });

  test("a bad value with nothing set earlier leaves it unset", () => {
    expect(() => setTermOrigin("")).toThrow(TypeError);
    expect(() => termOrigin()).toThrow("term-origin: call setTermOrigin(<origin>) once at start-up");
  });

  test("never set: termOrigin throws an Error with the call-to-action message", () => {
    expect(() => termOrigin()).toThrow(Error);
    expect(() => termOrigin()).not.toThrow(TypeError);
    expect(() => termOrigin()).toThrow("term-origin: call setTermOrigin(<origin>) once at start-up");
  });
});

describe("resetTermOrigin", () => {
  test("forgets the origin: termOrigin throws again", () => {
    setTermOrigin("https://ontology.example.test");
    resetTermOrigin();
    expect(() => termOrigin()).toThrow("term-origin: call setTermOrigin(<origin>) once at start-up");
  });

  test("is harmless when nothing was set", () => {
    expect(() => resetTermOrigin()).not.toThrow();
  });
});

describe("the export list", () => {
  test("is exactly the three functions", () => {
    expect(Object.keys(api).sort()).toEqual(["resetTermOrigin", "setTermOrigin", "termOrigin"]);
  });
});
