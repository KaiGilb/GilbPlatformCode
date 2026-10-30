// @vitest-environment node
// Ported: the four `rebaseOnStored` cases of the source's `savedElsewhere.test.ts` (S-2: a card save refused with 412), as they were.
// New cases follow (the empty answers, the order of conflicts, the inputs left alone).
import { describe, expect, it } from "vitest";
import { rebaseOnStored } from "./rebaseOnStored";

describe("rebaseOnStored (ported: a card save refused with 412)", () => {
  it("the person changed the name; B changed the email: the name is the person's, the email is B's; no conflict", () => {
    const r = rebaseOnStored({ name: "Tom", email: "a" }, { name: "Thomas", email: "a" }, { name: "Tom", email: "b" });
    expect(r).toEqual({ facts: { name: "Thomas", email: "b" }, conflicts: [] });
  });
  it("the person and B changed the same field to different values: B's wins and the field is named", () => {
    const r = rebaseOnStored({ email: "a" }, { email: "c" }, { email: "b" });
    expect(r).toEqual({ facts: { email: "b" }, conflicts: ["email"] });
  });
  it("the same value both ways (the card's own save, or both agree): no conflict", () => {
    expect(rebaseOnStored({ email: "a" }, { email: "b" }, { email: "b" })).toEqual({ facts: { email: "b" }, conflicts: [] });
  });
  it("a fact added elsewhere is carried, so the retraction sweep does not take it; one the card read unchanged is left to the sweep", () => {
    const r = rebaseOnStored({ name: "Tom", note: "x" }, { name: "Tom" }, { name: "Tom", note: "x", phone: "1" });
    expect(r.facts).toEqual({ name: "Tom", phone: "1" });
  });
});

describe("rebaseOnStored, more", () => {
  it("nothing changed anywhere: the held facts, no conflict", () => {
    expect(rebaseOnStored({ a: "1" }, { a: "1" }, { a: "1" })).toEqual({ facts: { a: "1" }, conflicts: [] });
  });
  it("an unchanged field takes the stored value, so a value another session saved is never sent back with the old one", () => {
    expect(rebaseOnStored({ a: "1", b: "1" }, { a: "1", b: "1" }, { a: "9", b: "1" }).facts).toEqual({ a: "9", b: "1" });
  });
  it("a field the person added (absent when read) and nobody else touched keeps the person's value", () => {
    expect(rebaseOnStored({}, { a: "mine" }, {}).facts).toEqual({ a: "mine" });
  });
  it("a field removed elsewhere that the person did not change takes the empty stored value", () => {
    expect(rebaseOnStored({ a: "1" }, { a: "1" }, {}).facts).toEqual({ a: "" });
  });
  it("a stored fact the editor does not hold and that was read unchanged is left out", () => {
    expect(rebaseOnStored({ x: "1" }, {}, { x: "1" }).facts).toEqual({});
  });
  it("a stored fact the editor does not hold, absent when read, is carried (a new fact elsewhere)", () => {
    expect(rebaseOnStored({}, {}, { x: "1" }).facts).toEqual({ x: "1" });
  });
  it("a stored fact the editor does not hold and changed elsewhere is carried as stored", () => {
    expect(rebaseOnStored({ x: "1" }, {}, { x: "2" }).facts).toEqual({ x: "2" });
  });
  it("a field the person added that the store holds as an empty value is still the person's", () => {
    expect(rebaseOnStored({}, { a: "mine" }, { a: "" }).facts).toEqual({ a: "mine" });
  });
  it("the conflicts are sorted", () => {
    const r = rebaseOnStored({ b: "1", a: "1" }, { b: "2", a: "2" }, { b: "3", a: "3" });
    expect(r.conflicts).toEqual(["a", "b"]);
    expect(r.facts).toEqual({ b: "3", a: "3" });
  });
  it("an absent fact reads as the empty string on every side", () => {
    expect(rebaseOnStored({}, { a: "" }, {})).toEqual({ facts: { a: "" }, conflicts: [] });
  });
  it("the inputs are not changed", () => {
    const read = { a: "1" };
    const held = { a: "2" };
    const stored = { a: "3", b: "4" };
    rebaseOnStored(read, held, stored);
    expect(read).toEqual({ a: "1" });
    expect(held).toEqual({ a: "2" });
    expect(stored).toEqual({ a: "3", b: "4" });
  });
});
