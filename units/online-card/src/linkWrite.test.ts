// The link between a held record and the party's online card, written by the holder only on the holder's own record; the link is
// the existing sameAs, never owl:sameAs, and grants nothing. (The reading of the link is tested in `online-card-link`.)
import { describe, expect, it } from "vitest";
import { linkWrite, unlinkWrite, LinkRefusedError } from "./linkWrite";

const RECORD = "https://holder.example.test/base/e/rec1";
const PARTY = "https://ann.example.test/vault";

describe("linkWrite: the one write that makes the link", () => {
  it("is a merge patch of a:sameAs alone, a reference, on the holder's own record", () => {
    const w = linkWrite({ record: RECORD, target: PARTY });
    expect(w.patch).toEqual({ sameAs: { "@id": PARTY } });
    expect(Object.keys(w.patch)).toEqual(["sameAs"]);
  });
  it("refuses a target that is not an absolute address", () => {
    for (const bad of ["", "  ", "ann", "mailto:ann@x.no", "javascript:alert(1)", "owl:sameAs"]) {
      expect(() => linkWrite({ record: RECORD, target: bad })).toThrow(LinkRefusedError);
    }
  });
  it("refuses to link a record to itself", () => {
    expect(() => linkWrite({ record: RECORD, target: RECORD })).toThrow(/itself/);
  });
  it("refuses a missing record", () => {
    expect(() => linkWrite({ record: "", target: PARTY })).toThrow(LinkRefusedError);
  });
  it("never names a grant term, a rung, a reader or a subject", () => {
    const text = JSON.stringify(linkWrite({ record: RECORD, target: PARTY }).patch);
    for (const k of ["owl:", "directReader", "directWriter", "visibilityTier", "claimSubject", "readerGroup", "writerGroup"]) expect(text).not.toContain(k);
  });
});

describe("unlinkWrite: removing the link changes nothing else", () => {
  it("is a merge patch that retracts a:sameAs alone", () => {
    const w = unlinkWrite({ record: RECORD });
    expect(w.patch).toEqual({ sameAs: null });
    expect(Object.keys(w.patch)).toEqual(["sameAs"]);
  });
  it("refuses a missing record", () => {
    expect(() => unlinkWrite({ record: "" })).toThrow(LinkRefusedError);
  });
});
