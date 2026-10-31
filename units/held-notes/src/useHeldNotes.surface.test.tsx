// New. The hook's surface and its privacy switch, which the ported cases reach only on the way: what each member says before and after the read,
// whose claim the viewer may change, the write paths' messages, `setPrivate` (the switch), `removeFor`, and the serial chain. The real peers
// run over the fake platform of test/fakePlaceStore.ts; the viewer's own card is stood in for by the adder-card test seam (test/adderCardMock.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
const stater = vi.hoisted(() => ({ uri: "", fail: false, noOwnVault: false }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(
    await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(),
    async () => {
      if (stater.fail) throw new Error("Your own vault could not be found, so what you add would have no source. Nothing was saved.");
      return stater.uri;
    },
    () => ({ noOwnVault: stater.noOwnVault }),
  ),
);

import {
  HELD_NOTES_STALE_MS,
  __resetHeldNoteChains,
  heldClaimsKey,
  mergeClaim,
  runSerial,
  useHeldNotes,
} from "./useHeldNotes";
import type { HeldClaimDoc } from "./heldNote";
import { __resetHeldNoteVocab } from "./heldNoteVocab";

const { VAULT, store } = fake;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const SELL = "https://veda.platform.example.test/base/t/SellProducts";
const PRINCIPAL = "https://id.platform.example.test/base/p/anna";
const OLA = "https://ola.platform.example.test/base/e/vsc-ola";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
let tom: string;

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  fake.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  stater.fail = false;
  stater.noOwnVault = false;
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  stater.uri = "https://anna.platform.example.test/base/e/vsc-anna";
});
afterEach(tearDown);

const by = (card: string) => ({ "a:statedBy": { "@id": card }, "a:heldParty": { "@id": uriOf(tom) } });
const claim = (card: string, extra: Record<string, unknown>) => fake.seed("t:HeldPartyFieldClaim", { ...by(card), ...extra });
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");

function mount(principal: string | null | undefined = PRINCIPAL, kind: "skill" | "interest" = "skill", vaultId: string | null = VAULT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const h = renderHook(() => useHeldNotes(kind, vaultId, uriOf(tom), principal), { wrapper });
  return { ...h, qc };
}
const read = async (h: ReturnType<typeof mount>, topic = NURSING) => waitFor(() => expect(h.result.current.noteFor(topic)).not.toBeNull());
const patchBodies = () => (globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls.filter(([, i]) => i?.method === "PATCH").map(([, i]) => i);

describe("the shared key and the clock", () => {
  it("one key per (vault, person); a load may use a read up to a minute old", () => {
    expect(heldClaimsKey("v", "s")).toEqual(["mynet", "held-claims", "v", "s"]);
    expect(HELD_NOTES_STALE_MS).toBe(60_000);
  });
});

describe("mergeClaim — a read-back put into the shared query", () => {
  const d = (id: string, extra: Record<string, unknown> = {}): HeldClaimDoc => ({ id, uri: `u${id}`, doc: extra });
  it("replaces by id, adds when new, drops when gone, and keeps the list in id order", () => {
    const qc = new QueryClient();
    const key = ["k"] as const;
    qc.setQueryData(key, [d("b"), d("d")]);
    mergeClaim(qc, key, "c", d("c"));
    expect(qc.getQueryData<HeldClaimDoc[]>(key)!.map((x) => x.id)).toEqual(["b", "c", "d"]);
    mergeClaim(qc, key, "b", d("b", { x: 1 }));
    expect(qc.getQueryData<HeldClaimDoc[]>(key)!.find((x) => x.id === "b")!.doc).toEqual({ x: 1 });
    expect(qc.getQueryData<HeldClaimDoc[]>(key)).toHaveLength(3);
    mergeClaim(qc, key, "d", null);
    expect(qc.getQueryData<HeldClaimDoc[]>(key)!.map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("on a key with nothing yet it starts the list", () => {
    const qc = new QueryClient();
    mergeClaim(qc, ["n"], "a", d("a"));
    expect(qc.getQueryData<HeldClaimDoc[]>(["n"])!.map((x) => x.id)).toEqual(["a"]);
    mergeClaim(qc, ["m"], "a", null);
    expect(qc.getQueryData<HeldClaimDoc[]>(["m"])).toEqual([]);
  });
});

describe("runSerial — one at a time per key", () => {
  it("acts on one key run in order, each after the one before has settled, whatever happened to it", async () => {
    const order: string[] = [];
    const gate = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const a = runSerial("k", async () => (await gate(20), order.push("a"), "a"));
    const b = runSerial("k", async () => (order.push("b"), Promise.reject(new Error("b failed"))));
    const c = runSerial("k", async () => (order.push("c"), "c"));
    expect(await a).toBe("a");
    await expect(b).rejects.toThrow("b failed");
    expect(await c).toBe("c");
    expect(order).toEqual(["a", "b", "c"]);
  });
  it("two keys do not wait for each other", async () => {
    const order: string[] = [];
    const slow = runSerial("x", () => new Promise<void>((r) => setTimeout(() => (order.push("slow"), r()), 30)));
    const fast = runSerial("y", async () => void order.push("fast"));
    await Promise.all([slow, fast]);
    expect(order).toEqual(["fast", "slow"]);
  });
  it("a settled chain leaves nothing behind: a later act on the key runs at once", async () => {
    await runSerial("z", async () => 1);
    await new Promise((r) => setTimeout(r, 5));
    const t0 = Date.now();
    await runSerial("z", async () => 2);
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe("what the hook says before and after the read", () => {
  it("before the read nothing is known: no note, no topics, no mark, no source; an unknown category is editable", async () => {
    const h = mount();
    expect(h.result.current.noteFor(NURSING)).toBeNull();
    expect(h.result.current.topics()).toBeNull();
    expect(h.result.current.markFor(NURSING)).toBeNull();
    expect(h.result.current.sourceFor(NURSING)).toBeNull();
    expect(h.result.current.editableFor(NURSING)).toBe(true);
    expect(h.result.current.readError).toBeNull();
    await read(h);
  });
  it("no vault means nothing is read", async () => {
    const h = mount(PRINCIPAL, "skill", null);
    await new Promise((r) => setTimeout(r, 30));
    expect(h.result.current.noteFor(NURSING)).toBeNull();
    expect(fake.findByAttribute).not.toHaveBeenCalled();
  });
  it("an empty vault reads as no note ('') and no topics", async () => {
    const h = mount();
    await read(h);
    expect(h.result.current.noteFor(NURSING)).toBe("");
    expect(h.result.current.topics()).toEqual([]);
    expect(h.result.current.editableFor(NURSING)).toBe(true);
    expect(h.result.current.sourceFor(NURSING)).toBeNull();
    expect(h.result.current.errorFor(NURSING)).toBeNull();
    expect(h.result.current.savingFor(NURSING)).toBe(false);
  });
  it("the viewer's own claim wins over another's on the same category; another's alone is read and not editable", async () => {
    claim(OLA, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ola's" });
    claim(stater.uri, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "mine" });
    claim(OLA, { "a:skill": { "@id": SELL }, "a:skillDepthNote": "only ola" });
    const h = mount();
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe("mine"));
    expect(h.result.current.noteFor(SELL)).toBe("only ola");
    expect(h.result.current.editableFor(NURSING)).toBe(true);
    expect(h.result.current.editableFor(SELL)).toBe(false);
    expect(h.result.current.sourceFor(NURSING)).toMatchObject({ own: true, hasSource: true });
    expect(h.result.current.sourceFor(SELL)).toMatchObject({ own: false, hasSource: true });
    expect(h.result.current.topics()).toHaveLength(2);
  });
  it("a claim with no stater is read, has no source, and is not the viewer's", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "no source" });
    const h = mount();
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe("no source"));
    expect(h.result.current.sourceFor(NURSING)).toMatchObject({ own: false, hasSource: false });
    expect(h.result.current.editableFor(NURSING)).toBe(false);
    expect(h.result.current.markFor(NURSING)).toBeNull();
  });
  it("markFor: null when the viewer stated none, private when any of theirs is private, shared otherwise; another's tier never counts", async () => {
    claim(OLA, { "a:skill": { "@id": NURSING }, "a:visibilityTier": "private" });
    claim(stater.uri, { "a:skill": { "@id": SELL } });
    const priv = claim(stater.uri, { "a:skill": { "@id": "https://veda.platform.example.test/base/t/Sailing" }, "a:visibilityTier": "private", "a:claimSubject": { "@id": PRINCIPAL } });
    const h = mount();
    await waitFor(() => expect(h.result.current.markFor(SELL)).toBe("shared"));
    expect(h.result.current.markFor(NURSING)).toBeNull();
    expect(h.result.current.markFor("https://veda.platform.example.test/base/t/Sailing")).toBe("private");
    expect(priv).toBeTruthy();
  });
  it("markFor is private when ANY of the viewer's claims on the category is private", async () => {
    claim(stater.uri, { "a:skill": { "@id": NURSING } });
    claim(stater.uri, { "a:skill": { "@id": NURSING }, "a:visibilityTier": "private", "a:claimSubject": { "@id": PRINCIPAL } });
    const h = mount();
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("private"));
  });
  it("topics are the distinct categories in mint order", async () => {
    claim(stater.uri, { "a:skill": { "@id": SELL } });
    claim(OLA, { "a:skill": { "@id": NURSING } });
    claim(stater.uri, { "a:skill": { "@id": SELL }, "a:skillDepthNote": "twice" });
    const h = mount();
    await waitFor(() => expect(h.result.current.topics()).not.toBeNull());
    expect(h.result.current.topics()).toEqual([SELL, NURSING]);
  });
  it("a kind the master does not name is said, and the read of the vault failing is said", async () => {
    fake.attributeSpelling.mockImplementation(async (n: string) => (n === "skillDepthNote" ? (null as never) : n));
    const h = mount();
    await waitFor(() => expect(h.result.current.readError).toMatch(/^Could not read the skill notes: The ontology did not name a\/skillDepthNote/));
    __resetHeldNoteVocab();
    fake.attributeSpelling.mockImplementation(async (n: string) => n);
    fake.findByAttribute.mockRejectedValue(new Error("503 busy"));
    const g = mount();
    await waitFor(() => expect(g.result.current.readError).toMatch(/^Could not read the skill notes: /));
  });
  it("the person having no vault of their own is said (noOwnVault)", async () => {
    stater.noOwnVault = true;
    const h = mount();
    expect(h.result.current.noOwnVault).toBe(true);
    await read(h);
  });
});

describe("save and add — the messages, and what is written", () => {
  it("save with no vault says so and writes nothing", async () => {
    const h = mount(PRINCIPAL, "skill", null);
    let ok = true;
    await act(async () => (ok = await h.result.current.save(NURSING, "x")));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("Not signed in to a vault, so there is nowhere to store this note.");
    expect(claims()).toHaveLength(0);
  });
  it("add with no vault says so", async () => {
    const h = mount(PRINCIPAL, "skill", null);
    let ok = true;
    await act(async () => (ok = await h.result.current.add(NURSING)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("Not signed in to a vault, so there is nowhere to store this.");
  });
  it("with no card to state, save and add say the reason as it is and write nothing", async () => {
    stater.fail = true;
    const h = mount();
    await read(h);
    let ok = true;
    await act(async () => (ok = await h.result.current.save(NURSING, "x")));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toMatch(/^Your own vault could not be found/);
    await act(async () => (ok = await h.result.current.add(NURSING)));
    expect(ok).toBe(false);
    expect(claims()).toHaveLength(0);
  });
  it("a note saved is made once, stated by the viewer's card, with the read grant to the viewer's principal only, and read back", async () => {
    const h = mount();
    await read(h);
    let ok = false;
    await act(async () => (ok = await h.result.current.save(NURSING, "ICU")));
    expect(ok).toBe(true);
    expect(claims()).toHaveLength(1);
    expect(claims()[0]![1].facts).toEqual({
      "a:heldParty": { "@id": uriOf(tom) },
      "a:skill": { "@id": NURSING },
      "a:skillDepthNote": "ICU",
      "a:statedBy": { "@id": stater.uri },
      "a:directReader": PRINCIPAL,
    });
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe("ICU"));
    expect(h.result.current.errorFor(NURSING)).toBeNull();
    expect(h.result.current.savingFor(NURSING)).toBe(false);
  });
  it("with no principal there is no read grant at all", async () => {
    const h = mount(null);
    await read(h);
    await act(async () => void (await h.result.current.save(NURSING, "x")));
    expect("a:directReader" in claims()[0]![1].facts).toBe(false);
  });
  it("the same note again is true and writes nothing more", async () => {
    const h = mount();
    await read(h);
    await act(async () => void (await h.result.current.save(NURSING, "x")));
    fake.createRecord.mockClear();
    fake.patchRecord.mockClear();
    let ok = false;
    await act(async () => (ok = await h.result.current.save(NURSING, "x")));
    expect(ok).toBe(true);
    expect(fake.createRecord).not.toHaveBeenCalled();
    expect(fake.patchRecord).not.toHaveBeenCalled();
  });
  it("a list that cannot be read stops the save before it writes", async () => {
    const h = mount();
    await read(h);
    fake.findByAttribute.mockRejectedValue(new Error("503"));
    let ok = true;
    await act(async () => (ok = await h.result.current.save(NURSING, "x")));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("The notes could not be read, so this note is not saved. Try again.");
    expect(claims()).toHaveLength(0);
  });
  it("a write that fails says why and the busy mark is gone", async () => {
    const h = mount();
    await read(h);
    fake.createRecord.mockRejectedValueOnce(new Error("503 down"));
    let ok = true;
    await act(async () => (ok = await h.result.current.save(NURSING, "x")));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toMatch(/^Could not save this note: /);
    expect(h.result.current.savingFor(NURSING)).toBe(false);
  });
  it("a store that accepts the note but does not keep it is not reported saved", async () => {
    const h = mount();
    await read(h);
    fake.createRecord.mockImplementationOnce(async () => ({ id: "ghost", etag: '"1"' }));
    let ok = true;
    await act(async () => (ok = await h.result.current.save(NURSING, "x")));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("The store accepted this note but did not keep it, so it is not saved. Try again.");
  });
  it("a read-back that fails is not a confirmation", async () => {
    const h = mount();
    await read(h);
    const impl = fake.readRecord.getMockImplementation()!;
    let n = 0;
    fake.readRecord.mockImplementation(async (id: string, at: string | null) => (++n >= 1 && store.get(id)?.type === "t:HeldPartyFieldClaim" ? Promise.reject(new Error("503")) : impl(id, at)));
    let ok = true;
    await act(async () => (ok = await h.result.current.save(NURSING, "x")));
    fake.readRecord.mockImplementation(impl);
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("Saved, but the note could not be read back, so this is not confirmed. Try again.");
  });
  it("savingFor is true while the save runs", async () => {
    const h = mount();
    await read(h);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const impl = fake.createRecord.getMockImplementation()!;
    fake.createRecord.mockImplementationOnce(async (...a: Parameters<typeof impl>) => (await held, impl(...a)));
    let p!: Promise<boolean>;
    act(() => void (p = h.result.current.save(NURSING, "x")));
    await waitFor(() => expect(h.result.current.savingFor(NURSING)).toBe(true));
    release();
    await act(async () => void (await p));
    expect(h.result.current.savingFor(NURSING)).toBe(false);
  });
  it("add makes the category's own claim with no note; adding it again is true and writes nothing; an interest is the same code", async () => {
    const h = mount(PRINCIPAL, "interest");
    await read(h, "https://veda.platform.example.test/base/t/Photography");
    const PHOTO = "https://veda.platform.example.test/base/t/Photography";
    let ok = false;
    await act(async () => (ok = await h.result.current.add(PHOTO)));
    expect(ok).toBe(true);
    expect(claims()[0]![1].facts).toEqual({ "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": PHOTO }, "a:statedBy": { "@id": stater.uri }, "a:directReader": PRINCIPAL });
    await waitFor(() => expect(h.result.current.topics()).toEqual([PHOTO]));
    fake.createRecord.mockClear();
    await act(async () => (ok = await h.result.current.add(PHOTO)));
    expect(ok).toBe(true);
    expect(fake.createRecord).not.toHaveBeenCalled();
  });
  it("an add the store does not keep is not reported added", async () => {
    const h = mount();
    await read(h);
    fake.createRecord.mockImplementationOnce(async () => ({ id: "ghost", etag: '"1"' }));
    let ok = true;
    await act(async () => (ok = await h.result.current.add(NURSING)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("The store accepted this but did not keep it, so it is not added. Try again.");
  });
  it("an add whose write fails says why", async () => {
    const h = mount();
    await read(h);
    fake.createRecord.mockRejectedValueOnce(new Error("503 down"));
    let ok = true;
    await act(async () => (ok = await h.result.current.add(NURSING)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toMatch(/^Could not add this: /);
  });
  it("a save changes only the viewer's own claim: another's on the same category is left as it is and a second of the viewer's is not made", async () => {
    const theirs = claim(OLA, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ola" });
    const h = mount();
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe("ola"));
    await act(async () => void (await h.result.current.save(NURSING, "mine")));
    expect(claims()).toHaveLength(2);
    expect(store.get(theirs)!.facts["a:skillDepthNote"]).toBe("ola");
    await act(async () => void (await h.result.current.save(NURSING, "mine, changed")));
    expect(claims()).toHaveLength(2);
    expect(store.get(theirs)!.facts["a:skillDepthNote"]).toBe("ola");
    expect(claims().filter(([, e]) => JSON.stringify(e.facts["a:statedBy"]) === JSON.stringify({ "@id": stater.uri }))[0]![1].facts["a:skillDepthNote"]).toBe("mine, changed");
  });
});

describe("different categories do not wait for each other", () => {
  it("a slow save of one category does not hold up a save of another", async () => {
    const h = mount();
    await read(h);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const impl = fake.createRecord.getMockImplementation()!;
    fake.createRecord.mockImplementationOnce(async (...a: Parameters<typeof impl>) => (await held, impl(...a)));
    let slow!: Promise<boolean>;
    act(() => void (slow = h.result.current.save(NURSING, "slow")));
    await waitFor(() => expect(h.result.current.savingFor(NURSING)).toBe(true));
    let fast = false;
    await act(async () => (fast = await h.result.current.save(SELL, "fast")));
    expect(fast).toBe(true);
    expect(h.result.current.savingFor(NURSING)).toBe(true);
    release();
    await act(async () => void (await slow));
    expect(claims()).toHaveLength(2);
  });
});

describe("removeFor — only what the viewer stated", () => {
  it("removes the viewer's claims on the category and leaves another's, then confirms", async () => {
    const theirs = claim(OLA, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ola" });
    claim(stater.uri, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "mine" });
    const other = claim(stater.uri, { "a:skill": { "@id": SELL } });
    const h = mount();
    await waitFor(() => expect(h.result.current.topics()).toEqual([NURSING, SELL]));
    let ok = false;
    await act(async () => (ok = await h.result.current.removeFor(NURSING)));
    expect(ok).toBe(true);
    expect(claims().map(([id]) => id).sort()).toEqual([theirs, other].sort());
    expect(h.result.current.errorFor(NURSING)).toBeNull();
  });
  it("with no vault it is false; with no card of their own the viewer stated nothing, so it is true and nothing is removed", async () => {
    const none = mount(PRINCIPAL, "skill", null);
    let ok = true;
    await act(async () => (ok = await none.result.current.removeFor(NURSING)));
    expect(ok).toBe(false);
    claim(OLA, { "a:skill": { "@id": NURSING } });
    stater.fail = true;
    const h = mount();
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).not.toBeNull());
    await act(async () => (ok = await h.result.current.removeFor(NURSING)));
    expect(ok).toBe(true);
    expect(claims()).toHaveLength(1);
  });
  it("a list that cannot be read, a delete that fails and a delete that is not carried out are each said and false", async () => {
    claim(stater.uri, { "a:skill": { "@id": NURSING } });
    const h = mount();
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe(""));
    let ok = true;
    fake.findByAttribute.mockRejectedValueOnce(new Error("503"));
    await act(async () => (ok = await h.result.current.removeFor(NURSING)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("The notes could not be read, so the note on this was not removed.");
    fake.deleteRecord.mockRejectedValueOnce(new Error("503 down"));
    await act(async () => (ok = await h.result.current.removeFor(NURSING)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toMatch(/^Could not remove the note on this: /);
    fake.deleteRecord.mockImplementationOnce(async () => undefined);
    await act(async () => (ok = await h.result.current.removeFor(NURSING)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("The note on this could not be confirmed removed. Try again.");
  });
  it("a category the viewer has no claim on is true at once", async () => {
    const h = mount();
    await read(h);
    let ok = false;
    await act(async () => (ok = await h.result.current.removeFor(NURSING)));
    expect(ok).toBe(true);
    expect(fake.deleteRecord).not.toHaveBeenCalled();
  });
});

describe("setPrivate — the switch: who sees the viewer's own claim", () => {
  const seeMine = async (extra: Record<string, unknown> = {}) => {
    const id = claim(stater.uri, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "mine", ...extra });
    const h = mount();
    await waitFor(() => expect(h.result.current.markFor(NURSING)).not.toBeNull());
    return { id, h };
  };
  it("private: ONE patch of the tier and the viewer's principal as claim subject with If-Match, read back, and the hook says private", async () => {
    const { id, h } = await seeMine();
    let ok = false;
    await act(async () => (ok = await h.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(true);
    expect(patchBodies()).toHaveLength(1);
    expect(JSON.parse(String(patchBodies()[0]!.body))).toEqual({ "a:visibilityTier": "private", "a:claimSubject": { "@id": PRINCIPAL } });
    expect((patchBodies()[0]!.headers as Record<string, string>)["if-match"]).toBeTruthy();
    expect(store.get(id)!.facts["a:visibilityTier"]).toBe("private");
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("private"));
    expect(h.result.current.errorFor(NURSING)).toBeNull();
  });
  it("back to shared: both keys cleared, the note kept", async () => {
    const { id, h } = await seeMine({ "a:visibilityTier": "private", "a:claimSubject": { "@id": PRINCIPAL } });
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("private"));
    let ok = false;
    await act(async () => (ok = await h.result.current.setPrivate(NURSING, false)));
    expect(ok).toBe(true);
    expect(JSON.parse(String(patchBodies()[0]!.body))).toEqual({ "a:visibilityTier": null, "a:claimSubject": null });
    expect("a:visibilityTier" in store.get(id)!.facts).toBe(false);
    expect(store.get(id)!.facts["a:skillDepthNote"]).toBe("mine");
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("shared"));
  });
  it("⛔ a claim the viewer did not add cannot be switched: said, and NOTHING is patched", async () => {
    const theirs = claim(OLA, { "a:skill": { "@id": NURSING } });
    const h = mount();
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe(""));
    let ok = true;
    await act(async () => (ok = await h.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("You did not add this, so you cannot change who sees it.");
    expect(fake.patchRecord).not.toHaveBeenCalled();
    expect("a:visibilityTier" in store.get(theirs)!.facts).toBe(false);
  });
  it("⛔ with no card of their own the viewer added nothing: same refusal, nothing patched", async () => {
    claim(OLA, { "a:skill": { "@id": NURSING } });
    stater.fail = true;
    const h = mount();
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe(""));
    let ok = true;
    await act(async () => (ok = await h.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("You did not add this, so you cannot change who sees it.");
    expect(fake.patchRecord).not.toHaveBeenCalled();
  });
  it("⛔ with no principal there is nobody to keep it for: refused, nothing patched; likewise with no vault", async () => {
    const { h } = await seeMine();
    const noPrincipal = mount(null);
    await waitFor(() => expect(noPrincipal.result.current.noteFor(NURSING)).toBe("mine"));
    let ok = true;
    await act(async () => (ok = await noPrincipal.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(false);
    expect(noPrincipal.result.current.errorFor(NURSING)).toBe("Not signed in, so who sees this cannot be changed.");
    const noVault = mount(PRINCIPAL, "skill", null);
    await act(async () => (ok = await noVault.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(false);
    expect(fake.patchRecord).not.toHaveBeenCalled();
    expect(h.result.current.markFor(NURSING)).toBe("shared");
  });
  it("a list that cannot be read stops the switch before it patches", async () => {
    const { h } = await seeMine();
    fake.findByAttribute.mockRejectedValue(new Error("503"));
    let ok = true;
    await act(async () => (ok = await h.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("The notes could not be read, so who sees this was not changed. Try again.");
    expect(fake.patchRecord).not.toHaveBeenCalled();
  });
  it("a patch the store accepts but does not keep is not reported as changed", async () => {
    const { id, h } = await seeMine();
    fake.patchRecord.mockImplementationOnce(async () => ({ etag: '"x"' }));
    let ok = true;
    await act(async () => (ok = await h.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toBe("The store accepted this but did not keep it, so who sees it is not changed. Try again.");
    expect("a:visibilityTier" in store.get(id)!.facts).toBe(false);
  });
  it("a patch that fails says why", async () => {
    const { h } = await seeMine();
    fake.patchRecord.mockRejectedValueOnce(new Error("503 down"));
    let ok = true;
    await act(async () => (ok = await h.result.current.setPrivate(NURSING, true)));
    expect(ok).toBe(false);
    expect(h.result.current.errorFor(NURSING)).toMatch(/^Could not change who sees this: /);
  });
  it("every claim of the viewer's on the category gets the mark; another's is left alone", async () => {
    const a = claim(stater.uri, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "1" });
    const b = claim(stater.uri, { "a:skill": { "@id": NURSING }, "a:skillDepthNote": "2" });
    const theirs = claim(OLA, { "a:skill": { "@id": NURSING } });
    const h = mount();
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("shared"));
    await act(async () => void (await h.result.current.setPrivate(NURSING, true)));
    expect(store.get(a)!.facts["a:visibilityTier"]).toBe("private");
    expect(store.get(b)!.facts["a:visibilityTier"]).toBe("private");
    expect("a:visibilityTier" in store.get(theirs)!.facts).toBe(false);
  });
  it("the switch is per category: another category of the viewer's is not marked", async () => {
    const sell = claim(stater.uri, { "a:skill": { "@id": SELL } });
    const { h } = await seeMine();
    await act(async () => void (await h.result.current.setPrivate(NURSING, true)));
    expect("a:visibilityTier" in store.get(sell)!.facts).toBe(false);
  });
});
