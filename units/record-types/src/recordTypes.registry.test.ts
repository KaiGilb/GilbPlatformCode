import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECORD_TYPES, recordTypeByUri, attrKey, resolveType, typeUri } from "./recordTypes";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";

beforeEach(() => setBaseOrigin("https://platform.example.test"));
afterEach(() => resetBaseOrigin());

// The registry is the BaseVeda type-anchoring SURFACE (BASEAPP_03 / the typing gate).
// These invariants keep it well-formed so every write anchors cleanly.
describe("record type registry (BaseVeda anchoring surface)", () => {
  it("every type resolves to an absolute https base/t URI", () => {
    for (const t of RECORD_TYPES) {
      const uri = typeUri(t.typeName);
      expect(uri).toMatch(/^https:\/\/[^/]+\/base\/t\/[A-Za-z]+$/);
      expect(recordTypeByUri()[uri]).toBe(t);
    }
  });

  // An entry with NO field list holds a type whose fields are read from the
  // master (a stakeholder kind, through gilb-stakeholders); the card names it by the set's own
  // name field. Every entry that does hold a list still names its nameField (and discField) in it.
  it("each type has a nameField that exists in its fields", () => {
    for (const t of RECORD_TYPES) {
      // Only an entry MARKED `fieldsFrom` is exempt,
      // and such an entry holds no fields, no nameField and no discField of its own.
      if (t.fieldsFrom === "stakeholder-package") {
        expect(t.fields).toEqual([]);
        expect(t.nameField).toBeUndefined();
        expect(t.discField).toBeUndefined();
        continue;
      }
      expect(t.fields.length).toBeGreaterThan(0);
      expect(t.fields.some((f) => f.slug === t.nameField)).toBe(true);
      if (t.discField) expect(t.fields.some((f) => f.slug === t.discField)).toBe(true);
    }
  });

  it("field slugs are unique within a type and wire as a:<slug>", () => {
    for (const t of RECORD_TYPES) {
      const slugs = t.fields.map((f) => f.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      expect(attrKey(slugs[0]!)).toBe(`a:${slugs[0]}`);
    }
  });

  it("resolveType accepts both a local id and an absolute type URI", () => {
    const note = RECORD_TYPES.find((t) => t.id === "note")!;
    expect(resolveType("note")).toBe(note);
    expect(resolveType(typeUri("Note"))).toBe(note);
    expect(resolveType("nope")).toBeNull();
  });
});
