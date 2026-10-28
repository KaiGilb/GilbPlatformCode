// Ported from `gilb-stakeholders` `test/onlineCard/link.test.ts` at 27fe0cef: 7 of its 14 tests (the others call symbols that are not in this unit).
import { describe, expect, it } from "vitest";
import { readLink } from "./link";

const PARTY = "https://kari.platform.example.test/vault";

describe("readLink: the link as the record's served facts carry it", () => {
  it("none when the record carries no a:sameAs", () => {
    expect(readLink({ label: "Kari" })).toEqual({ state: "none" });
  });
  it("linked when a:sameAs is one reference, under either spelling", () => {
    expect(readLink({ sameAs: { "@id": PARTY } })).toEqual({ state: "linked", target: PARTY });
    expect(readLink({ "a:sameAs": { "@id": PARTY } })).toEqual({ state: "linked", target: PARTY });
  });
  it("never reads owl:sameAs as the link (it is the platform's grant bridge, a different term)", () => {
    expect(readLink({ "owl:sameAs": { "@id": PARTY } })).toEqual({ state: "none" });
    expect(readLink({ "owl:sameAs": { "@id": PARTY }, sameAs: { "@id": "https://x.platform.example.test/vault" } })).toEqual({ state: "linked", target: "https://x.platform.example.test/vault" });
  });
  it("a plain string is not a link (a text value must not be able to name a card)", () => {
    expect(readLink({ sameAs: PARTY })).toEqual({ state: "malformed" });
  });
  it("two references is ambiguous, and no card is chosen for it", () => {
    expect(readLink({ sameAs: [{ "@id": PARTY }, { "@id": "https://x.platform.example.test/vault" }] })).toEqual({ state: "ambiguous" });
  });
  it("a list of one reference is that link", () => {
    expect(readLink({ sameAs: [{ "@id": PARTY }] })).toEqual({ state: "linked", target: PARTY });
  });
  it("an empty reference is no link", () => {
    expect(readLink({ sameAs: { "@id": "  " } })).toEqual({ state: "malformed" });
    expect(readLink({ sameAs: null })).toEqual({ state: "none" });
  });
});
