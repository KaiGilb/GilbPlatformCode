// The one card host's addressSpellings and readPlaceNames: the vocabulary, and one answer per place, in order.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressSpellings } from "@kaigilb/gilbplatformcode-one-card-merge";
import { resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { readPlaceNames } from "@kaigilb/gilbplatformcode-place-names";
import type { TheirPlaceRead } from "@kaigilb/gilbplatformcode-one-card";
import { createOneCardHost } from "./hosts/oneCardHost";

vi.mock("@kaigilb/gilbplatformcode-place-vocab", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kaigilb/gilbplatformcode-place-vocab")>();
  return { ...actual, resolvePlaceVocab: vi.fn() };
});
vi.mock("@kaigilb/gilbplatformcode-place-names", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kaigilb/gilbplatformcode-place-names")>();
  return { ...actual, readPlaceNames: vi.fn() };
});

const SPELLINGS: AddressSpellings = {
  label: "a:placeClaimLabel",
  streetLine: "a:streetLine",
  addressLine1: "a:addressLine1",
  addressLine2: "a:addressLine2",
  postalCode: "a:postalCode",
  claimPlace: "a:claimPlace",
};

beforeEach(() => {
  vi.mocked(resolvePlaceVocab).mockReset();
  vi.mocked(readPlaceNames).mockReset();
});

describe("createOneCardHost address members", () => {
  it("addressSpellings maps the vocabulary", async () => {
    vi.mocked(resolvePlaceVocab).mockResolvedValue({
      placeClaimLabel: SPELLINGS.label,
      streetLine: SPELLINGS.streetLine,
      addressLine1: SPELLINGS.addressLine1,
      addressLine2: SPELLINGS.addressLine2,
      postalCode: SPELLINGS.postalCode,
      claimPlace: SPELLINGS.claimPlace,
    } as Awaited<ReturnType<typeof resolvePlaceVocab>>);
    const host = createOneCardHost({ geoOrigin: "https://geo.example.test" });
    expect(host.addressSpellings).toEqual(expect.any(Function));
    await expect(host.addressSpellings!()).resolves.toEqual(SPELLINGS);
    expect(resolvePlaceVocab).toHaveBeenCalledTimes(1);
  });

  it("readPlaceNames maps named/missing/failed in order", async () => {
    vi.mocked(readPlaceNames).mockResolvedValue([
      { id: "a", state: "named", place: { id: "a", label: "Oslo", type: "City", memberOf: ["n"] } },
      { id: "b", state: "missing" },
      { id: "c", state: "failed", reason: "unreachable" },
    ]);
    const host = createOneCardHost({ geoOrigin: "https://geo.example.test" });
    expect(host.readPlaceNames).toEqual(expect.any(Function));
    await expect(host.readPlaceNames!(["a", "b", "c"])).resolves.toEqual([
      { state: "named", place: { id: "a", label: "Oslo", type: "City", memberOf: ["n"] } },
      { state: "missing" },
      { state: "failed" },
    ] satisfies TheirPlaceRead[]);
    expect(readPlaceNames).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("options override both members", async () => {
    const spellings = vi.fn(async () => SPELLINGS);
    const reads = vi.fn(async () => [] as TheirPlaceRead[]);
    const host = createOneCardHost({ geoOrigin: "https://geo.example.test", addressSpellings: spellings, readPlaceNames: reads });
    expect(host.addressSpellings).toBe(spellings);
    expect(host.readPlaceNames).toBe(reads);
    await expect(host.addressSpellings!()).resolves.toEqual(SPELLINGS);
    await expect(host.readPlaceNames!(["a"])).resolves.toEqual([]);
    expect(resolvePlaceVocab).not.toHaveBeenCalled();
    expect(readPlaceNames).not.toHaveBeenCalled();
  });
});
