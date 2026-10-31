// The vocabulary. Cases 1-2 and 5 are ported from GilbApp `placeAddressLines.c214.test.ts` and `placePostalCode.c214.test.ts` (commit a703b3ed): the master's
// spellings and labels, a label that cannot be given is only a missing label, and the postal code's spelling and label. The master is doubled at
// `term-slots` as the source doubled it at the app's `termSlots` module. The rest is new.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isCardPartType } from "@kaigilb/gilbplatformcode-lws-vault-sets";

const master = vi.hoisted(() => ({
  attributeSpelling: undefined as unknown as ReturnType<typeof vi.fn>,
  typeSpelling: undefined as unknown as ReturnType<typeof vi.fn>,
  attributeLabel: undefined as unknown as ReturnType<typeof vi.fn>,
}));
const LABELS: Record<string, string> = { addressLine1: "Address 1", addressLine2: "Address 2", postalCode: "Postal Code" };
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => {
  master.attributeSpelling = vi.fn(async (name: string) => name);
  master.typeSpelling = vi.fn(async (name: string) => `t:${name}`);
  master.attributeLabel = vi.fn(async (name: string) => LABELS[name] ?? null);
  return { attributeSpelling: master.attributeSpelling, typeSpelling: master.typeSpelling, attributeLabel: master.attributeLabel };
});

import { PlaceVocabUnavailableError, __resetPlaceVocab, resolvePlaceVocab } from "./index";

beforeEach(() => {
  __resetPlaceVocab();
  master.attributeSpelling.mockReset().mockImplementation(async (name: string) => name);
  master.typeSpelling.mockReset().mockImplementation(async (name: string) => `t:${name}`);
  master.attributeLabel.mockReset().mockImplementation(async (name: string) => LABELS[name] ?? null);
});

describe("the address is spelled by the master", () => {
  it("(ported) the vocabulary carries the master's spellings and labels (no string typed in the app)", async () => {
    const v = await resolvePlaceVocab();
    expect(v.addressLine1).toBe("a:addressLine1");
    expect(v.addressLine2).toBe("a:addressLine2");
    expect(v.postalCode).toBe("a:postalCode");
    expect(v.termLabels).toEqual({ addressLine1: "Address 1", addressLine2: "Address 2", postalCode: "Postal Code" });
    expect(master.attributeSpelling.mock.calls.map((c) => c[0])).toContain("postalCode");
  });

  it("(ported) a label the master cannot give is only a missing label, not a failed vocabulary", async () => {
    master.attributeLabel.mockImplementation(async () => {
      throw new Error("label read failed");
    });
    const v = await resolvePlaceVocab();
    expect(v.addressLine1).toBe("a:addressLine1");
    expect(v.termLabels).toEqual({});
  });

  it("every attribute and both types come from the master's answer to the term's NAME (a different spelling is carried through)", async () => {
    master.attributeSpelling.mockImplementation(async (name: string) => `x${name}`);
    master.typeSpelling.mockImplementation(async (name: string) => `t:Y${name}`);
    const v = await resolvePlaceVocab();
    expect(v).toMatchObject({
      placeClaimLabel: "a:xplaceClaimLabel",
      streetLine: "a:xstreetLine",
      memberOf: "a:xmemberOf",
      claimSubject: "a:xclaimSubject",
      claimPlace: "a:xclaimPlace",
      detailOf: "a:xdetailOf",
      addressLine1: "a:xaddressLine1",
      addressLine2: "a:xaddressLine2",
      postalCode: "a:xpostalCode",
      placeClaimType: "t:YPlaceClaim",
      fieldClaimType: "t:YSelfAssertedFieldClaim",
      placeClaimTypeQuery: "YPlaceClaim",
      fieldClaimTypeQuery: "YSelfAssertedFieldClaim",
    });
  });

  it("a term the master does not answer makes the whole vocabulary unavailable, and the error lists what was missing", async () => {
    master.attributeSpelling.mockImplementation(async (name: string) => (name === "detailOf" || name === "claimPlace" ? null : name));
    master.typeSpelling.mockImplementation(async (name: string) => (name === "PlaceClaim" ? null : `t:${name}`));
    const err = (await resolvePlaceVocab().catch((e: unknown) => e)) as PlaceVocabUnavailableError;
    expect(err).toBeInstanceOf(PlaceVocabUnavailableError);
    expect([...err.missing].sort()).toEqual(["a/claimPlace", "a/detailOf", "t/PlaceClaim"]);
    expect(err.message).toContain("so no address can be read or written right now");
  });

  it("ONE term the master does not answer is enough to make it unavailable", async () => {
    master.attributeSpelling.mockImplementation(async (name: string) => (name === "postalCode" ? null : name));
    await expect(resolvePlaceVocab()).rejects.toMatchObject({ missing: ["a/postalCode"] });
  });

  it("a failure is not kept: the next ask asks the master again", async () => {
    master.attributeSpelling.mockImplementation(async () => null);
    await expect(resolvePlaceVocab()).rejects.toBeInstanceOf(PlaceVocabUnavailableError);
    master.attributeSpelling.mockImplementation(async (name: string) => name);
    await expect(resolvePlaceVocab()).resolves.toMatchObject({ claimSubject: "a:claimSubject" });
  });

  it("a success is kept: the master is asked once however often the vocabulary is read", async () => {
    await resolvePlaceVocab();
    const asked = master.attributeSpelling.mock.calls.length;
    await resolvePlaceVocab();
    expect(master.attributeSpelling.mock.calls.length).toBe(asked);
  });

  it("the two types are registered as parts of a person card, by the bare name and by the master's spelling", async () => {
    expect(isCardPartType("PlaceClaim")).toBe(true);
    expect(isCardPartType("SelfAssertedFieldClaim")).toBe(true);
    __resetPlaceVocab();
    master.typeSpelling.mockImplementation(async (name: string) => `t:Z${name}`);
    await resolvePlaceVocab();
    expect(isCardPartType("t:ZPlaceClaim")).toBe(true);
  });

  it("asks for nine attributes, two types and three labels, and no more", async () => {
    await resolvePlaceVocab();
    expect(master.attributeSpelling).toHaveBeenCalledTimes(9);
    expect(master.typeSpelling).toHaveBeenCalledTimes(2);
    expect(master.attributeLabel).toHaveBeenCalledTimes(3);
  });
});
