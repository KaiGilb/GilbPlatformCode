// @vitest-environment node
// New (the source has no test of this file of its own; the marks were exercised through the screens). The marks are the PRIVACY switch of a
// held detail: PRIVATE = `a:visibilityTier` = "private" AND `a:claimSubject` = the adder's principal, written TOGETHER in one merge-patch with
// If-Match; BACK TO SHARED = both null. The real `lws-records` and `lws-vault-sets` run over the fake platform of test/fakePlaceStore.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { HeldMarkError, PRIVATE_TIER, isPrivateDoc, privateMarkFacts, refuseGrantKeys, sharedMarkFacts, writeHeldMark } from "./heldDetailMark";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});

const WHO = "https://id.platform.example.test/base/p/anna";
const uriOf = (id: string) => `${fake.VAULT}/e/${id}`;
const fail = (m: string) => new HeldMarkError(m);

beforeEach(() => {
  setUp();
  fake.resetStore();
});
afterEach(tearDown);

describe("privateMarkFacts / sharedMarkFacts", () => {
  it("private is the tier and the adder's principal as claim subject, together, and nothing else", () => {
    expect(PRIVATE_TIER).toBe("private");
    const m = privateMarkFacts(WHO);
    expect(m).toEqual({ "a:visibilityTier": "private", "a:claimSubject": { "@id": WHO } });
    expect(Object.keys(m).sort()).toEqual(["a:claimSubject", "a:visibilityTier"]);
  });
  it("the principal is trimmed; none at all is refused (a private detail needs someone to keep it for)", () => {
    expect(privateMarkFacts(`  ${WHO} `)["a:claimSubject"]).toEqual({ "@id": WHO });
    for (const bad of ["", "   ", undefined as unknown as string, null as unknown as string]) expect(() => privateMarkFacts(bad)).toThrow(HeldMarkError);
  });
  it("shared clears both keys together", () => {
    expect(sharedMarkFacts()).toEqual({ "a:visibilityTier": null, "a:claimSubject": null });
  });
  it("each call is a new object", () => {
    expect(privateMarkFacts(WHO)).not.toBe(privateMarkFacts(WHO));
    expect(sharedMarkFacts()).not.toBe(sharedMarkFacts());
  });
});

describe("refuseGrantKeys — a tier or a claim subject on a held claim is refused unless the facts ARE one of the marks", () => {
  it.each(["a:visibilityTier", "visibilityTier", "a:claimSubject", "claimSubject"])("%s on plain facts is refused, with the reason said", (k) => {
    expect(() => refuseGrantKeys({ "a:note": "x", [k]: "private" }, fail, "the reason.")).toThrow(`Refusing to write ${k} on a held claim: the reason.`);
  });
  it("plain facts with neither key pass", () => {
    expect(() => refuseGrantKeys({ "a:heldParty": { "@id": "x" }, "a:statedBy": { "@id": "y" }, "a:directReader": WHO }, fail, "r")).not.toThrow();
  });
  it("the marks pass", () => {
    expect(() => refuseGrantKeys(privateMarkFacts(WHO), fail, "r")).not.toThrow();
    expect(() => refuseGrantKeys(sharedMarkFacts(), fail, "r")).not.toThrow();
  });
  it("a COPY of a mark is not a mark: the privacy keys cannot be smuggled in by spreading one", () => {
    expect(() => refuseGrantKeys({ ...privateMarkFacts(WHO) }, fail, "r")).toThrow(HeldMarkError);
    expect(() => refuseGrantKeys({ ...sharedMarkFacts() }, fail, "r")).toThrow(HeldMarkError);
    expect(() => refuseGrantKeys(JSON.parse(JSON.stringify(privateMarkFacts(WHO))), fail, "r")).toThrow(HeldMarkError);
  });
  it("a mark with another key added later is still the mark (the guard is on the object, so a caller must not add keys to it)", () => {
    const m = privateMarkFacts(WHO) as Record<string, unknown>;
    m["a:note"] = "x";
    expect(() => refuseGrantKeys(m, fail, "r")).not.toThrow();
  });
  it("`also` names further bare keys that stay refused whatever the facts are, a mark included", () => {
    expect(() => refuseGrantKeys({ "a:numberFind": "1" }, fail, "r", ["numberFind"])).toThrow("Refusing to write a:numberFind");
    expect(() => refuseGrantKeys({ numberFind: "1" }, fail, "r", ["numberFind"])).toThrow(HeldMarkError);
    const m = privateMarkFacts(WHO) as Record<string, unknown>;
    m["a:numberFind"] = "1";
    expect(() => refuseGrantKeys(m, fail, "r", ["numberFind"])).toThrow(HeldMarkError);
  });
  it("the error is the caller's own kind", () => {
    class Mine extends Error {}
    expect(() => refuseGrantKeys({ "a:claimSubject": "x" }, (m) => new Mine(m), "r")).toThrow(Mine);
  });
});

describe("isPrivateDoc — what a served claim says about its tier", () => {
  it.each([
    ["the stored key, a string", { "a:visibilityTier": "private" }, true],
    ["the wire key, a string", { visibilityTier: "private" }, true],
    ["a one-element list", { "a:visibilityTier": ["private"] }, true],
    ["a reference", { "a:visibilityTier": { "@id": "private" } }, true],
    ["a list of references", { visibilityTier: [{ "@id": "private" }] }, true],
    ["another tier", { "a:visibilityTier": "public" }, false],
    ["private only as the second value", { "a:visibilityTier": ["public", "private"] }, false],
    ["no tier", { "a:note": "x" }, false],
    ["a null tier", { "a:visibilityTier": null }, false],
    ["the claim subject alone", { "a:claimSubject": { "@id": WHO } }, false],
  ] as const)("%s", (_n, doc, want) => {
    expect(isPrivateDoc(doc as Record<string, unknown>)).toBe(want);
  });
});

describe("writeHeldMark — one merge-patch, If-Match the version read, the two keys together", () => {
  const seedClaim = (extra: Record<string, unknown> = {}) =>
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf("tom") }, "a:skill": { "@id": "https://veda.platform.example.test/base/t/Nursing" }, "a:statedBy": { "@id": uriOf("me") }, ...extra });
  const patches = () => (globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls.filter(([, i]) => i?.method === "PATCH");

  it("refuses facts that are not a mark, before any request", async () => {
    const id = seedClaim();
    await expect(writeHeldMark({ id, uri: uriOf(id) }, { "a:visibilityTier": "private", "a:claimSubject": { "@id": WHO } })).rejects.toThrow(
      "Refusing to write a tier or a claim subject on a held claim that is not a mark.",
    );
    await expect(writeHeldMark({ id, uri: uriOf(id) }, { ...privateMarkFacts(WHO) })).rejects.toBeInstanceOf(HeldMarkError);
    expect(fake.readRecord).not.toHaveBeenCalled();
    expect(fake.patchRecord).not.toHaveBeenCalled();
  });

  it("private: ONE patch, tier private and claim subject the principal, with If-Match = the version just read; nothing else is written", async () => {
    const id = seedClaim();
    const before = fake.store.get(id)!;
    const etag = `"${before.seq}"`;
    const { etag: after } = await writeHeldMark({ id, uri: uriOf(id) }, privateMarkFacts(WHO));
    expect(fake.patchRecord).toHaveBeenCalledTimes(1);
    expect(fake.patchRecord.mock.calls[0]![1]).toEqual({ visibilityTier: "private", claimSubject: { "@id": WHO } });
    const [, init] = patches()[0]!;
    expect((init.headers as Record<string, string>)["if-match"]).toBe(etag);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ "a:visibilityTier": "private", "a:claimSubject": { "@id": WHO } });
    expect(fake.store.get(id)!.facts["a:visibilityTier"]).toBe("private");
    expect(fake.store.get(id)!.facts["a:claimSubject"]).toEqual({ "@id": WHO });
    expect(after).toBe(`"${fake.store.get(id)!.seq}"`);
  });

  it("⛔ the private mark grants nobody anything: no reader, no writer, no group is written, and the claim's own grants are untouched", async () => {
    const id = seedClaim({ "a:directReader": WHO });
    await writeHeldMark({ id, uri: uriOf(id) }, privateMarkFacts(WHO));
    const keys = Object.keys(JSON.parse(String(patches()[0]![1].body)));
    expect(keys.some((k) => /directReader|directWriter|readerGroup|writerGroup|grant/i.test(k))).toBe(false);
    expect(fake.store.get(id)!.facts["a:directReader"]).toBe(WHO);
    const facts = fake.store.get(id)!.facts;
    expect(Object.keys(facts).filter((k) => /Group|directWriter/.test(k))).toEqual([]);
  });

  it("back to shared: both keys cleared in ONE patch, the rest of the claim kept", async () => {
    const id = seedClaim({ "a:visibilityTier": "private", "a:claimSubject": { "@id": WHO }, "a:skillDepthNote": "keep" });
    await writeHeldMark({ id, uri: uriOf(id) }, sharedMarkFacts());
    expect(patches()).toHaveLength(1);
    expect(JSON.parse(String(patches()[0]![1].body))).toEqual({ "a:visibilityTier": null, "a:claimSubject": null });
    const f = fake.store.get(id)!.facts;
    expect("a:visibilityTier" in f).toBe(false);
    expect("a:claimSubject" in f).toBe(false);
    expect(f["a:skillDepthNote"]).toBe("keep");
    expect(isPrivateDoc(f)).toBe(false);
  });

  it("a claim that is gone is refused with the sentence, and nothing is patched", async () => {
    await expect(writeHeldMark({ id: "nope", uri: uriOf("nope") }, privateMarkFacts(WHO))).rejects.toThrow("This detail is no longer there, so who sees it was not changed.");
    expect(fake.patchRecord).not.toHaveBeenCalled();
  });

  it("the claim is read at ITS address (the node that holds it), and the patch goes to the same node", async () => {
    const other = "https://olda.platform.example.test/base";
    const id = fake.seed("t:HeldPartyFieldClaim", { "a:skill": { "@id": "x" } }, undefined, other);
    await writeHeldMark({ id, uri: `${other}/e/${id}` }, privateMarkFacts(WHO));
    expect(fake.readRecord.mock.calls[0]![1]).toBe("https://olda.platform.example.test");
    expect(fake.patchRecord.mock.calls[0]![2]).toBe("https://olda.platform.example.test");
  });

  it("a store that refuses the patch rejects the write", async () => {
    const id = seedClaim();
    fake.patchRecord.mockRejectedValueOnce(new Error("503 busy"));
    await expect(writeHeldMark({ id, uri: uriOf(id) }, privateMarkFacts(WHO))).rejects.toBeTruthy();
  });
});
