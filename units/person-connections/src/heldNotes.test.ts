// One My Note and one Where / How we met per person, in the vault, under ONE key every app computes with `heldNoteKey`.
import { describe, expect, it } from "vitest";
import { heldNoteKey } from "./index";

const RECORD = "https://holder.example.test/base/e/06ann0000000000000000000";
const PRINCIPAL = "https://ann.example.test/base/p/3f2b6c1e-1111-4a2b-9c3d-000000000001";

describe("heldNoteKey", () => {
  // A person linked to an online card is keyed by the principal (a linked record and a contact agree).
  it("is the principal when the person is linked, whatever the record", () => {
    expect(heldNoteKey({ linkedPrincipal: PRINCIPAL, record: RECORD })).toBe(PRINCIPAL);
    expect(heldNoteKey({ linkedPrincipal: ` ${PRINCIPAL} ` })).toBe(PRINCIPAL);
  });

  // Only a local stakeholder with no link keeps the record's address.
  it("is the record when there is no linked principal", () => {
    expect(heldNoteKey({ linkedPrincipal: null, record: RECORD })).toBe(RECORD);
    expect(heldNoteKey({ linkedPrincipal: "  ", record: ` ${RECORD}` })).toBe(RECORD);
  });

  // A LINKED record whose principal is not known (pending or the lookup failed) has no key: never the record.
  it("is null for a linked record whose principal is not known, whatever the record", () => {
    expect(heldNoteKey({ linked: true, linkedPrincipal: null, record: RECORD })).toBeNull();
    expect(heldNoteKey({ linked: true, linkedPrincipal: "  ", record: RECORD })).toBeNull();
    expect(heldNoteKey({ linked: true, linkedPrincipal: PRINCIPAL, record: RECORD })).toBe(PRINCIPAL);
    expect(heldNoteKey({ linked: false, record: RECORD })).toBe(RECORD);
  });

  // A DEFINITE answer that the link is not a person keys by the record;
  // a lookup that has not answered or failed stays unknown (null).
  it("is the record for a link the resolver definitely answered is not a person; null while unanswered or failed", () => {
    expect(heldNoteKey({ linked: true, linkAnswer: "organization", record: RECORD })).toBe(RECORD);
    for (const failed of ["unavailable", "unauthenticated", "busy", null, undefined] as const) {
      expect(heldNoteKey({ linked: true, linkAnswer: failed, record: RECORD })).toBeNull();
    }
    expect(heldNoteKey({ linked: true, linkAnswer: "person", linkedPrincipal: PRINCIPAL, record: RECORD })).toBe(PRINCIPAL);
    expect(heldNoteKey({ linked: true, linkAnswer: "person", record: RECORD })).toBeNull();
  });

  // The platform's one 404 ("none") is also its answer for a target that
  // cannot be reached or is not the caller's, so it is UNKNOWN: null, never the record (a linked person's old record-keyed note stays unread).
  it("is null for a link the resolver answered 'none' (the platform's one 404), whatever the record", () => {
    expect(heldNoteKey({ linked: true, linkAnswer: "none", record: RECORD })).toBeNull();
    expect(heldNoteKey({ linked: true, linkAnswer: "none", linkedPrincipal: null, record: RECORD })).toBeNull();
    // An unlinked record is not asked about and keeps its record key.
    expect(heldNoteKey({ linked: false, linkAnswer: "none", record: RECORD })).toBe(RECORD);
  });

  it("is null when there is neither", () => {
    expect(heldNoteKey({})).toBeNull();
    expect(heldNoteKey({ linkedPrincipal: "", record: "" })).toBeNull();
  });
});
