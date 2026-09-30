import { describe, expect, it } from "vitest";
import { defaultTermIri, looksLikeStoreId, ontologyRefIri } from "./ontologyRef";

const host = "terms.example.test";

describe("looksLikeStoreId", () => {
  it("accepts a digit-bearing lowercase id and a lowercase uuid", () => {
    expect(looksLikeStoreId("3ehvnp0kqwha")).toBe(true);
    expect(looksLikeStoreId("abcdefghi1")).toBe(true);
    expect(looksLikeStoreId("1234567890")).toBe(true);
    expect(looksLikeStoreId("01234567-89ab-cdef-0123-456789abcdef")).toBe(true);
  });

  it("rejects names, short ids, uppercase, and surrounding space", () => {
    expect(looksLikeStoreId("improvement")).toBe(false);
    expect(looksLikeStoreId("3DPrinting")).toBe(false);
    expect(looksLikeStoreId("abcdefghi")).toBe(false);
    expect(looksLikeStoreId("abcdefghij")).toBe(false);
    expect(looksLikeStoreId("01234567-89AB-cdef-0123-456789abcdef")).toBe(false);
    expect(looksLikeStoreId(" 3ehvnp0kqwha")).toBe(false);
  });
});

describe("ontologyRefIri", () => {
  it("passes a lowercase http address through and trims first", () => {
    expect(ontologyRefIri("  https://kept.example/t/Chair  ", host)).toBe(
      "https://kept.example/t/Chair",
    );
    expect(ontologyRefIri("", host)).toBe("");
    expect(ontologyRefIri("   ", host)).toBe("");
  });

  it("does not treat HTTP:// or httpfoo as an address", () => {
    expect(ontologyRefIri("HTTP://kept.example/t/Chair", host)).toBe(
      `https://${host}/base/t/HTTP%3A%2F%2Fkept.example%2Ft%2FChair`,
    );
    expect(ontologyRefIri("httpfoo", host)).toBe(`https://${host}/base/t/httpfoo`);
  });

  it("expands a lowercase base curie and encodes the rest", () => {
    expect(ontologyRefIri("base:e/a b", host)).toBe(`https://${host}/base/e/a%20b`);
    expect(ontologyRefIri("BASE:e/x", host)).toBe(`https://${host}/base/t/BASE%3Ae%2Fx`);
  });

  it("puts a store id on e and a name on t", () => {
    expect(ontologyRefIri("3ehvnp0kqwha", host)).toBe(`https://${host}/base/e/3ehvnp0kqwha`);
    expect(ontologyRefIri("Chair", host)).toBe(`https://${host}/base/t/Chair`);
  });
});

describe("defaultTermIri", () => {
  it("does not trim and does not strip t:", () => {
    expect(defaultTermIri("Person", host)).toBe(`https://${host}/base/t/Person`);
    expect(defaultTermIri("t:Person", host)).toBe(`https://${host}/base/t/t%3APerson`);
    expect(defaultTermIri(" Person ", host)).toBe(`https://${host}/base/t/%20Person%20`);
  });
});
