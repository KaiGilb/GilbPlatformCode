// New. The wire of an EDIT of a role: only what the edit changed, and a null only for a value the person cleared.
import { describe, expect, it } from "vitest";
import { readRole, roleChangeWire, roleWire, type EmploymentRoleFacts, type RoleAttrs } from "./index";

const attrs: RoleAttrs = { startDate: "a:startDate", endDate: "a:endDate", ongoing: "a:ongoing", workLocation: "a:workLocation" };
const OSLO = "https://geo.example.test/base/e/osm-r-1";
const BERGEN = "https://geo.example.test/base/e/osm-r-2";
const role = (over: Partial<EmploymentRoleFacts> = {}): EmploymentRoleFacts => ({ start: "2019-03", end: "", current: null, placeId: OSLO, ...over });
const nothing = { set: {}, clear: [] };

describe("roleChangeWire", () => {
  it("an edit that changes nothing writes nothing", () => {
    expect(roleChangeWire(role(), role(), attrs)).toEqual(nothing);
    expect(roleChangeWire(role({ current: true }), role({ current: true }), attrs)).toEqual(nothing);
  });
  it("picking only a start month names the start and nothing else: no end, no ongoing, no place", () => {
    expect(roleChangeWire(role({ start: "" }), role({ start: "2020-01" }), attrs)).toEqual({ set: { "a:startDate": "2020-01" }, clear: [] });
  });
  it("picking only a place names the place and nothing else (never-said current stays untouched)", () => {
    const w = roleChangeWire(role(), role({ placeId: BERGEN }), attrs);
    expect(w).toEqual({ set: { "a:workLocation": { "@id": BERGEN } }, clear: [] });
  });
  it("clearing the place is a null for the place only", () => {
    expect(roleChangeWire(role(), role({ placeId: "" }), attrs)).toEqual({ set: {}, clear: ["a:workLocation"] });
  });
  it("clearing a start month the person had picked is a null for the start only", () => {
    expect(roleChangeWire(role(), role({ start: "" }), attrs)).toEqual({ set: {}, clear: ["a:startDate"] });
  });
  it("a stored value that did not read is not cleared by an edit of another attribute", () => {
    // A stored start of "2019-03-01" and a place that is not an address both read as "" before and after.
    const before = readRole({ start: "2019-03-01", end: undefined, ongoing: undefined, place: "Oslo" }, "https://geo.example.test");
    expect(before).toEqual({ start: "", end: "", current: null, placeId: "" });
    expect(roleChangeWire(before, { ...before, end: "2023-06" }, attrs)).toEqual({ set: { "a:endDate": "2023-06" }, clear: ["a:ongoing"] });
    const w = roleChangeWire(before, { ...before, current: true }, attrs);
    expect(w).toEqual({ set: { "a:ongoing": true }, clear: [] });
    expect(JSON.stringify(w)).not.toContain("startDate");
    expect(JSON.stringify(w)).not.toContain("workLocation");
  });
  it("Present on with a stored end: ongoing true, and the end cleared (the person cleared it)", () => {
    const w = roleChangeWire(role({ end: "2023-06", current: false }), role({ end: "", current: true }), attrs);
    expect(w).toEqual({ set: { "a:ongoing": true }, clear: ["a:endDate"] });
  });
  it("an end month picked on a current role: the end is written and ongoing is cleared", () => {
    const w = roleChangeWire(role({ current: true }), role({ end: "2023-06", current: true }), attrs);
    expect(w).toEqual({ set: { "a:endDate": "2023-06" }, clear: ["a:ongoing"] });
  });
  it("saying ended with no end month writes ongoing false and nothing else", () => {
    expect(roleChangeWire(role({ current: true }), role({ current: false }), attrs)).toEqual({ set: { "a:ongoing": false }, clear: [] });
  });
  it("an employment with no role yet: the first edit writes only what was given", () => {
    expect(roleChangeWire(undefined, role({ placeId: "" }), attrs)).toEqual({ set: { "a:startDate": "2019-03" }, clear: [] });
  });
  it("every key it names is one roleWire names, with the same value", () => {
    const after = role({ start: "2020-02", end: "2024-01", current: false, placeId: BERGEN });
    const whole = roleWire(after, attrs);
    const change = roleChangeWire(role(), after, attrs);
    for (const [k, v] of Object.entries(change.set)) expect(whole.set[k]).toEqual(v);
    for (const k of change.clear) expect(whole.clear).toContain(k);
  });
  it("compares places by their trimmed text", () => {
    expect(roleChangeWire(role(), role({ placeId: ` ${OSLO} ` }), attrs)).toEqual(nothing);
  });
});
