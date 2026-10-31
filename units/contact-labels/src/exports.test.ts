// New. The entry point exports exactly what the README lists, and the three named constants carry the words the card shows.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the entry point", () => {
  it("exports exactly the run-time names the README lists", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CHIP_PENDING_LABEL",
        "CHIP_UNREADABLE_LABEL",
        "ContactLabelError",
        "ContactLabelVocabUnavailableError",
        "DEFAULT_TIE_MISSING_SAYS",
        "NOT_OWN_VAULT_SAYS",
        "NO_VAULT_TIE_SAYS",
        "PRIVATE_TIER",
        "__resetContactLabelVocab",
        "addContactLabel",
        "assertNeutralLabelFacts",
        "contactLabelsOf",
        "hasAnnotationRecord",
        "heldTypedClaims",
        "isEndedClaimDoc",
        "labelClaimFacts",
        "ownContactLabels",
        "removeContactLabel",
        "resolveContactLabelReadVocab",
        "resolveContactLabelVocab",
        "resolveHeldClaimType",
        "useContactLabels",
      ].sort(),
    );
  });
  it("says what it says", () => {
    expect(unit.CHIP_PENDING_LABEL).toBe("…");
    expect(unit.CHIP_UNREADABLE_LABEL).toBe("A kind of contact");
    expect(unit.NOT_OWN_VAULT_SAYS).toBe("Kinds of contact are kept in your own vault only, so none is added or removed here.");
    expect(unit.NO_VAULT_TIE_SAYS).toBe("This vault has no entity to relate the contact to, so no relation could be saved.");
    expect(unit.DEFAULT_TIE_MISSING_SAYS).toBe("Could not save the relation: GilbVeda's list of relations does not name associated-with right now.");
    expect(unit.PRIVATE_TIER).toBe("private");
  });
  it("hasAnnotationRecord and heldTypedClaims tell a chip's claim from a note record", () => {
    const claims: Array<{ id: string; uri: string; doc: Record<string, unknown>; typeUri?: string }> = [
      { id: "a", uri: "u/a", doc: {}, typeUri: "https://ontology.example.test/base/t/HeldPartyFieldClaim" },
      { id: "b", uri: "u/b", doc: {}, typeUri: "https://ontology.example.test/base/t/ContactPrivateNote" },
      { id: "c", uri: "u/c", doc: {} },
    ];
    expect(unit.heldTypedClaims(claims as never, "t:HeldPartyFieldClaim").map((c) => c.id)).toEqual(["a", "c"]);
    expect(unit.hasAnnotationRecord(claims as never, "t:HeldPartyFieldClaim")).toBe(true);
    expect(unit.hasAnnotationRecord(claims.slice(0, 1) as never, "t:HeldPartyFieldClaim")).toBe(false);
  });
});

import { PRIVATE_TIER as HELD_NOTES_TIER } from "@kaigilb/gilbplatformcode-held-notes";
describe("PRIVATE_TIER", () => {
  it("is held-notes' binding, the same word, not a second definition", () => {
    expect(unit.PRIVATE_TIER).toBe(HELD_NOTES_TIER);
    expect(HELD_NOTES_TIER).toBe("private");
  });
});
