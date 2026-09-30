import { describe, expect, it } from "vitest";
import { hopableTermIris } from "./termHops";

describe("hopableTermIris", () => {
  it("keeps base term addresses, strips one slash, and drops the rest", () => {
    const a = "https://terms.example.test/base/t/Chair";
    const b = "http://terms.example.test/base/t/Seat";
    expect(hopableTermIris(`${a}/ | ${b}|${a}`)).toEqual([a, b]);
    expect(hopableTermIris("https://terms.example.test/vault/t/Chair")).toEqual([]);
    expect(hopableTermIris("https://terms.example.test/base/t/Chair//")).toEqual([]);
    expect(hopableTermIris("HTTP://terms.example.test/base/t/Chair")).toEqual([]);
    expect(hopableTermIris("https://terms.example.test/base/t/Chair?x=1")).toEqual([]);
    expect(hopableTermIris("")).toEqual([]);
    expect(hopableTermIris("not-an-address")).toEqual([]);
  });
});
