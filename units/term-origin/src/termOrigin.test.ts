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

  test("only one trailing slash is removed", () => {
    setTermOrigin("https://ontology.example.test//");
    expect(termOrigin()).toBe("https://ontology.example.test/");
  });

  test("a path is kept (only the end slash goes)", () => {
    setTermOrigin("https://example.test/ontology/");
    expect(termOrigin()).toBe("https://example.test/ontology");
  });

  test("the text is trimmed first, so a slash before trailing spaces is removed too", () => {
    setTermOrigin("  https://ontology.example.test/  ");
    expect(termOrigin()).toBe("https://ontology.example.test");
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
    ["ftp://ontology.example.test"],
    ["HTTPS://ontology.example.test"],
    ["/base/t/"],
  ])("%j throws a TypeError that starts with term-origin:", (bad) => {
    expect(() => setTermOrigin(bad)).toThrow(TypeError);
    expect(() => setTermOrigin(bad)).toThrow(/^term-origin: /);
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

  test("a scheme with nothing after it is accepted, and the slash is cut: a kept oddity", () => {
    setTermOrigin("https://");
    expect(termOrigin()).toBe("https:/");
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
