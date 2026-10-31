// The fence on grants (ported in intent from GilbApp's `placeFieldClaim.cycle168.test.ts` idea, which the read side's file header names): no fact composer lets an
// authorisation attribute through, except the one reader grant added at CREATE, after the check.
import { describe, expect, it, vi } from "vitest";
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ attributeSpelling: vi.fn(async (n: string) => n), typeSpelling: vi.fn(async (n: string) => `t:${n}`), attributeLabel: vi.fn(async () => null) }));
import { resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { GRANT_PLANE_ATTRIBUTES, PlaceFieldClaimError, assertNoGrantPlane, placeClaimFacts, placeClaimLabelPatch, placeFieldClaimFacts } from "./index";

describe("assertNoGrantPlane", () => {
  it.each(GRANT_PLANE_ATTRIBUTES.map((a) => [a]))("%s reaches a composer: refused, in either spelling", (a) => {
    expect(() => assertNoGrantPlane({ [a]: "x" }, "t")).toThrow(PlaceFieldClaimError);
    expect(() => assertNoGrantPlane({ [a.slice(2)]: "x" }, "t")).toThrow(PlaceFieldClaimError);
  });
  it("an ordinary fact passes", () => expect(() => assertNoGrantPlane({ "a:streetLine": "x", claimSubject: { "@id": "y" } }, "t")).not.toThrow());
  it("the four attributes are the ones GilbApp fenced", () => expect([...GRANT_PLANE_ATTRIBUTES].sort()).toEqual(["a:directReader", "a:directWriter", "a:partOf", "a:readerGroup"]));
});

describe("the composers", () => {
  it("no composer puts a grant in its facts (the reader grant is added by create, after the check)", async () => {
    const v = await resolvePlaceVocab();
    expect(Object.keys(placeClaimFacts({ label: "home", streetLine: "x", place: { city: null, region: null, country: null } }, "https://h.example.test/base/e/r", v))).toEqual(["a:claimSubject", "a:placeClaimLabel"]);
    expect(Object.keys(placeClaimFacts({ label: "   ", streetLine: "x", place: { city: null, region: null, country: null } }, "https://h.example.test/base/e/r", v))).toEqual(["a:claimSubject"]); // a blank label is not a fact
    expect(Object.keys(placeFieldClaimFacts({ streetLine: "x" }, "https://h.example.test/base/e/r", v, "https://h.example.test/base/e/c"))).toEqual(["a:claimSubject", "a:detailOf", "a:streetLine"]);
    expect(Object.keys(placeClaimLabelPatch({ label: "a" }, { label: "b" }, v))).toEqual(["a:placeClaimLabel"]);
  });
});

describe("a master that spells a term as a grant is refused at composition (the fence is on the spelling, not on our own constants)", () => {
  it("createPlaceClaim / placeClaimFacts / placeFieldClaimFacts / the label patch refuse a term the master spells as a grant, and nothing is sent", async () => {
    const slots = await import("@kaigilb/gilbplatformcode-term-slots");
    const { __resetPlaceVocab } = await import("@kaigilb/gilbplatformcode-place-vocab");
    for (const [term, grant] of [["placeClaimLabel", "directReader"], ["streetLine", "partOf"], ["claimSubject", "readerGroup"]] as const) {
      __resetPlaceVocab();
      vi.mocked(slots.attributeSpelling).mockImplementation(async (n: string) => (n === term ? grant : n));
      const v = await resolvePlaceVocab();
      if (term === "placeClaimLabel") {
        expect(() => placeClaimFacts({ label: "home", streetLine: "", place: { city: null, region: null, country: null } }, "https://h.example.test/base/e/r", v)).toThrow(PlaceFieldClaimError);
        expect(() => placeClaimLabelPatch({ label: "a" }, { label: "b" }, v)).toThrow(PlaceFieldClaimError);
      }
      if (term === "streetLine") expect(() => placeFieldClaimFacts({ streetLine: "x" }, "https://h.example.test/base/e/r", v, "https://h.example.test/base/e/c")).toThrow(PlaceFieldClaimError);
      if (term === "claimSubject") expect(() => placeFieldClaimFacts({ streetLine: "x" }, "https://h.example.test/base/e/r", v, "https://h.example.test/base/e/c")).toThrow(PlaceFieldClaimError);
    }
    vi.mocked(slots.attributeSpelling).mockImplementation(async (n: string) => n);
    __resetPlaceVocab();
  });
});
