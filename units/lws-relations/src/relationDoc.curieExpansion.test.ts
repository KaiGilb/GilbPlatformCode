
// Cycle145 — THE COMPACTED MEMBER REF (carried item ③), on the surface the door fix reaches.
//
// 🔴 THIS ARM EXISTS BECAUSE THE DOOR FIX CREATED ITS REACHABILITY. While `GET /base/r/:id`
// 404'd at the apex, `doc` was always `null`, `sourceUri`/`targetUri` were always `null`, and
// `RelationEditPane.save` refused with "this connection's two ends could not be read". Now the
// read succeeds — so whatever the vault puts in `role:source` reaches `memberEntityUri`, and the
// server puts a CURIE there. Measured before the expansion landed, through the shipped
// functions and nothing else:
//
//     doc.sourceUri  base:e/ann-06g1nt2pd5v131v2rzf3knf2kc
//     memberEntityUri(...)  https://ann.platform.example.test/base/e/base:e/ann-06g1nt2pd5v131v2rzf3knf2kc
//
// — an address that exists at no host, matched by exact string equality on every read path.
// `resolveMemberEntityUri`'s own note records that exact corruption already reaching 2 of 9
// authored relations on 2026-08-01. ⛔ Shipping the door without this would have converted an
// honest refusal into a silent write to nowhere.

import { describe, it, expect } from "vitest";

import { relationDocFromJson } from "./relationDoc";
import { memberEntityUri } from "./relationWrite";

const COMPACT_VAULT = "https://ann.platform.example.test/base";
const COMPACT_DOC = {
  "@context": `${COMPACT_VAULT}/context.jsonld`,
  "@id": `${COMPACT_VAULT}/r/d3559185c6ed756cb418eb41d8`,
  "@type": "t:ConnectedTo",
  "role:source": { "@id": "base:e/ann-06g1nt2pd5v131v2rzf3knf2kc" },
  "role:target": { "@id": "base:e/hallo-note-06g1nsxabds0d9m23p0dbmpnkw" },
};

describe("C145 — a compacted member ref expands before it can reach a write", () => {
  it("🔴 resolves `base:e/…` against the document's OWN @id — never a guessed origin", () => {
    const doc = relationDocFromJson("d3559185c6ed756cb418eb41d8", COMPACT_DOC);
    expect(doc.sourceUri).toBe(`${COMPACT_VAULT}/e/ann-06g1nt2pd5v131v2rzf3knf2kc`);
    expect(doc.targetUri).toBe(`${COMPACT_VAULT}/e/hallo-note-06g1nsxabds0d9m23p0dbmpnkw`);
  });

  it("🔴 what the SHIPPED write door would then persist is a real address", () => {
    const doc = relationDocFromJson("d3559185c6ed756cb418eb41d8", COMPACT_DOC);
    const written = memberEntityUri(doc.sourceUri!, doc.sourceUri, COMPACT_VAULT);
    expect(written).toBe(`${COMPACT_VAULT}/e/ann-06g1nt2pd5v131v2rzf3knf2kc`);
    // The shape of the corruption, named so a regression is recognisable on sight.
    expect(written).not.toContain("/e/base:");
  });

  it("NEGATIVE CONTROL — an unresolvable ref stays UNRESOLVED, it is not invented", () => {
    // ⛔ The expansion must not become a general "make something absolute" rule. With no
    // derivable vault base (a root `@id` that is not a `/base/{e,r}/<id>` URI), a CURIE resolves
    // to nothing and the pane keeps its honest "the two ends could not be read" refusal —
    // ⛔ never a member address composed out of the app's own BASE_ORIGIN.
    const doc = relationDocFromJson("x", { ...COMPACT_DOC, "@id": "urn:uuid:not-a-vault-uri" });
    expect(doc.sourceUri).toBeNull();
    expect(doc.targetUri).toBeNull();
    // …and an unknown prefix is not expanded even when the vault base IS derivable.
    const other = relationDocFromJson("y", {
      ...COMPACT_DOC,
      "role:source": { "@id": "veda:t/ConnectedTo" },
    });
    expect(other.sourceUri).toBeNull();
  });
});
