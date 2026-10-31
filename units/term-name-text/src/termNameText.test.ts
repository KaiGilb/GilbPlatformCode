// New. The name of a term address, and the word when there is none.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { referentNameOf, termNameWord } from "./index";

const ORIGIN = "https://ontology.example.test";
beforeEach(() => setTermOrigin(ORIGIN));
afterEach(() => resetTermOrigin());

describe("referentNameOf", () => {
  it("takes the words of a term address of the ontology origin", () => {
    expect(referentNameOf(`${ORIGIN}/base/t/StreetLine`)).toBe("Street Line");
    expect(referentNameOf(`${ORIGIN}/base/t/Photography`)).toBe("Photography");
    expect(referentNameOf(`  ${ORIGIN}/base/t/SellProducts  `)).toBe("Sell Products");
  });
  it("gives null for a storage address, whatever its tail", () => {
    expect(referentNameOf(`${ORIGIN}/base/e/06gf80rjtdw3h9q187p80kx00m`)).toBeNull();
    expect(referentNameOf(`${ORIGIN}/base/e/Photography`)).toBeNull();
  });
  it("gives null for a foreign origin, another scheme, a look-alike host, a prefix or a suffix", () => {
    for (const iri of [
      "https://other.example.test/base/t/Photography",
      "http://ontology.example.test/base/t/Photography",
      "https://ontology.example.test.evil.test/base/t/Photography",
      `x${ORIGIN}/base/t/Photography`,
      `${ORIGIN}/base/t/Photography/more`,
      `${ORIGIN}/base/t/Photography?x=1`,
      `${ORIGIN}/base/t/`,
    ]) expect(referentNameOf(iri), iri).toBeNull();
  });
  it("gives null for free text and the empty string", () => {
    expect(referentNameOf("photography")).toBeNull();
    expect(referentNameOf("")).toBeNull();
  });
  it("reads the origin at each call, not when the module loads", () => {
    expect(referentNameOf("https://second.example.test/base/t/Sailing")).toBeNull();
    setTermOrigin("https://second.example.test");
    expect(referentNameOf("https://second.example.test/base/t/Sailing")).toBe("Sailing");
    expect(referentNameOf(`${ORIGIN}/base/t/Sailing`)).toBeNull();
  });
});

describe("termNameWord", () => {
  it("is one word for each noun, and never an address", () => {
    expect(termNameWord("skill")).toBe("A skill");
    expect(termNameWord("interest")).toBe("An interest");
  });
});
