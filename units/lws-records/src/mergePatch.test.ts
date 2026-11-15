import { describe, expect, it } from "vitest";
import { RecordForbiddenError, mergePatch } from "./index";

interface Watch {
  name: string;
  maker?: string;
  movement?: string;
  price?: number;
  tags?: string[];
  place?: { city: string; country: string };
}
const base: Watch = { name: "Speedmaster", maker: "Omega", movement: "manual", price: 4200, tags: ["a", "b"], place: { city: "Biel", country: "CH" } };

describe("mergePatch", () => {
  it("is {} when nothing changed (a copy is not a change)", () => {
    expect(mergePatch(base, structuredClone(base))).toEqual({});
  });
  it("gives a changed field as its new value and leaves unchanged fields out", () => {
    expect(mergePatch(base, { ...base, name: "Seamaster", price: 4300 })).toEqual({ name: "Seamaster", price: 4300 });
  });
  it("gives a cleared field as null: missing, undefined and null all clear", () => {
    const { maker: _m, ...noMaker } = base;
    expect(mergePatch(base, noMaker)).toEqual({ maker: null });
    expect(mergePatch(base, { ...base, maker: undefined, price: undefined })).toEqual({ maker: null, price: null });
    expect(mergePatch(base, { ...base, movement: null as unknown as undefined })).toEqual({ movement: null });
  });
  it("a field that was not set and still is not set is not in the patch (no null for nothing)", () => {
    const { maker: _m, ...noMaker } = base;
    expect(mergePatch<Watch>(noMaker, { ...noMaker, maker: undefined })).toEqual({});
  });
  it("a field set where there was none is given", () => {
    const { maker: _m, ...noMaker } = base;
    expect(mergePatch<Watch>(noMaker, { ...noMaker, maker: "Rolex" })).toEqual({ maker: "Rolex" });
  });
  it("0, false and the empty string are values, not cleared", () => {
    expect(mergePatch<Record<string, unknown>>({ n: 5, b: true, s: "x" }, { n: 0, b: false, s: "" })).toEqual({ n: 0, b: false, s: "" });
  });
  it("nested objects and arrays compare by what they hold, in any key order, and a change is sent whole", () => {
    expect(mergePatch(base, { ...base, place: { country: "CH", city: "Biel" }, tags: ["a", "b"] })).toEqual({});
    expect(mergePatch(base, { ...base, place: { city: "Biel", country: "DE" } })).toEqual({ place: { city: "Biel", country: "DE" } });
    expect(mergePatch(base, { ...base, tags: ["b", "a"] })).toEqual({ tags: ["b", "a"] });
    expect(mergePatch(base, { ...base, place: undefined })).toEqual({ place: null });
  });
  it("names: a field is written under another fact name; toFact: its value is converted, and a cleared field is still null", () => {
    const o = { names: { movement: "watchMovement" }, toFact: { movement: (m: string) => ({ "@id": `https://ex.test/m/${m}` }) } };
    expect(mergePatch(base, { ...base, movement: "automatic" }, o)).toEqual({ watchMovement: { "@id": "https://ex.test/m/automatic" } });
    expect(mergePatch(base, { ...base, movement: undefined }, o)).toEqual({ watchMovement: null });
    expect(mergePatch(base, { ...base }, o)).toEqual({});
  });
  it("does not change its inputs", () => {
    const a = structuredClone(base);
    const b = { ...structuredClone(base), name: "Other" };
    mergePatch(a, b);
    expect(a).toEqual(base);
    expect(b.name).toBe("Other");
  });
});

describe("RecordForbiddenError.status", () => {
  it("is 403 and the class is otherwise unchanged", () => {
    const e = new RecordForbiddenError("owner only");
    expect(e.status).toBe(403);
    expect(e.reason).toBe("owner only");
    expect(e.name).toBe("RecordForbiddenError");
  });
});
