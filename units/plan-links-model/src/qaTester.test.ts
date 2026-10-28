// Ported from the app's planQaTester test (the case that reads Part of System and an a:partOf link).
import { describe, expect, it } from "vitest";
import { pointsAt, readPartOf } from "./index";

const SH = "https://vault.example.test/vault/e/stakeholder-1";

describe("served-shape round trips", () => {
  it("Part of System and a:partOf links read back from a served one-member list of links", () => {
    expect(readPartOf([{ "@id": SH }])).toEqual({ kind: "link", uri: SH });
    const row = { id: "x", typeUri: "t:SpecificationElement", facts: {}, served: { facts: { partOf: [{ "@id": "https://vault.example.test/base/e/walk" }] } } };
    expect(pointsAt(row, "partOf", { id: "walk", entityUri: "https://vault.example.test/base/e/walk" })).toBe(true);
  });
});
