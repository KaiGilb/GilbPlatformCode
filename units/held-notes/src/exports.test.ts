// @vitest-environment node
// New. Pins the entry point so an export added or dropped is a decision, and that the module state has its reset and nothing else leaks.
import { expect, it } from "vitest";
import * as unit from "./index";

it("exports exactly these (the types are erased)", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "DIRECT_READER",
    "HELD_FIND_MAX_PAGES",
    "HELD_FIND_PAGE",
    "HELD_NOTES_STALE_MS",
    "HELD_NOTE_TERMS",
    "HeldMarkError",
    "HeldNoteError",
    "HeldNoteVocabUnavailableError",
    "PRIVATE_TIER",
    "__resetHeldNoteChains",
    "__resetHeldNoteVocab",
    "addHeldTopic",
    "heldClaimFacts",
    "heldClaimsKey",
    "heldNoteSurvived",
    "heldNotesAbout",
    "heldNotesOfKind",
    "inVault",
    "isPrivateDoc",
    "listHeldClaimsAbout",
    "listHeldNotesAbout",
    "mergeClaim",
    "notesForTopic",
    "ownHeldNotes",
    "planHeldNoteWrite",
    "privateMarkFacts",
    "readHeldClaim",
    "readHeldClaimDoc",
    "refuseGrantKeys",
    "removeHeldNotes",
    "resolveHeldNoteVocab",
    "resolveHeldPartyAttr",
    "runSerial",
    "saveHeldNote",
    "sharedMarkFacts",
    "subjectSpellings",
    "toHeldNote",
    "useHeldNotes",
    "writeHeldMark",
  ]);
});
it("arities of the writers and the switch", () => {
  expect(unit.saveHeldNote.length).toBe(1);
  expect(unit.addHeldTopic.length).toBe(1);
  expect(unit.removeHeldNotes.length).toBe(2); // the kind has a default
  expect(unit.writeHeldMark.length).toBe(2);
  expect(unit.privateMarkFacts.length).toBe(1);
  expect(unit.sharedMarkFacts.length).toBe(0);
  expect(unit.refuseGrantKeys.length).toBe(3); // `also` has a default and is not counted
  expect(unit.useHeldNotes.length).toBe(4); // the principal is optional in type only
});
it("the private helpers of the source stay private", () => {
  const names = Object.keys(unit);
  for (const n of ["MARKS", "TIER", "SUBJECT", "chains", "hostOf", "findAbout", "byId", "refuseWithout", "sameEntity", "firstString", "refOrText", "pick", "cached", "heldPartyCached", "NOT_ADDED"]) expect(names).not.toContain(n);
});
