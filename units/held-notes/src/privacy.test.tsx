// New. THE PRIVACY RULE in one place: a held note is written with NO grant to anyone but the writer's own read-back, and it is made PRIVATE only by
// the mark (`privateMarkFacts` through `writeHeldMark`), in a separate patch that only the adder can make. The whole flow is driven through the hook
// over the fake platform, and EVERY request body that went out is scanned. The unit tests of the pieces are in heldDetailMark.test.ts,
// heldNote.pure.test.ts and heldNote.c214.test.ts.
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
const stater = vi.hoisted(() => ({ uri: "" }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri),
);

import { useHeldNotes } from "./useHeldNotes";
import { __resetHeldNoteChains } from "./useHeldNotes";
import { __resetHeldNoteVocab, HeldNoteVocabUnavailableError } from "./heldNoteVocab";
import { HeldNoteError, addHeldTopic, heldClaimFacts, saveHeldNote } from "./heldNote";
import { privateMarkFacts, refuseGrantKeys } from "./heldDetailMark";
import { resolveHeldNoteVocab } from "./heldNoteVocab";

const { VAULT, store } = fake;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const PRINCIPAL = "https://id.platform.example.test/base/p/anna";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
let tom: string;

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  fake.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  stater.uri = "https://anna.platform.example.test/base/e/vsc-anna";
});
afterEach(tearDown);

const sent = () =>
  (globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls
    .filter(([, i]) => i?.method === "POST" || i?.method === "PATCH" || i?.method === "PUT")
    .map(([url, i]) => ({ method: i.method!, url, headers: i.headers as Record<string, string>, body: JSON.parse(String(i.body)) as Record<string, unknown> }));
const GRANT = /directWriter|readerGroup|writerGroup|reader|grant|public/i;

describe("a note's create carries no grant to anyone else", () => {
  it("the create body holds the five facts of a note and nothing else; the only grant is the writer's own read-back (a:directReader = their own principal)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const h = renderHook(() => useHeldNotes("skill", VAULT, uriOf(tom), PRINCIPAL), { wrapper });
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe(""));
    await act(async () => void (await h.result.current.save(NURSING, "private thoughts")));
    const creates = sent().filter((r) => r.method === "POST");
    expect(creates).toHaveLength(1);
    const facts = (creates[0]!.body as { facts: Record<string, unknown> }).facts;
    expect(Object.keys(facts).sort()).toEqual(["a:directReader", "a:heldParty", "a:skill", "a:skillDepthNote", "a:statedBy"]);
    expect(facts["a:directReader"]).toBe(PRINCIPAL);
    expect(Object.keys(facts).filter((k) => k !== "a:directReader" && (GRANT.test(k) || /visibilityTier|claimSubject/.test(k)))).toEqual([]);
  });

  it("the whole flow — write a note, make it private, share it again — never sends a grant to anyone else, a tier on a create, or a mark the adder did not make", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const h = renderHook(() => useHeldNotes("skill", VAULT, uriOf(tom), PRINCIPAL), { wrapper });
    await waitFor(() => expect(h.result.current.noteFor(NURSING)).toBe(""));
    await act(async () => void (await h.result.current.save(NURSING, "private thoughts")));
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("shared"));
    await act(async () => void (await h.result.current.setPrivate(NURSING, true)));
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("private"));
    await act(async () => void (await h.result.current.save(NURSING, "edited while private")));
    await act(async () => void (await h.result.current.setPrivate(NURSING, false)));
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("shared"));

    const reqs = sent();
    const create = reqs.find((r) => r.method === "POST")!;
    const cf = (create.body as { facts: Record<string, unknown> }).facts;
    expect(Object.keys(cf).some((k) => /visibilityTier|claimSubject/.test(k))).toBe(false); // a note is born shared, never with a tier
    const grantsEverywhere = reqs.flatMap((r) => Object.keys(((r.body as { facts?: Record<string, unknown> }).facts ?? r.body) as Record<string, unknown>)).filter((k) => /directWriter|readerGroup|writerGroup|grant|public/i.test(k));
    expect(grantsEverywhere).toEqual([]);
    const readers = reqs.flatMap((r) => Object.entries(((r.body as { facts?: Record<string, unknown> }).facts ?? r.body) as Record<string, unknown>)).filter(([k]) => /directReader/.test(k));
    expect(readers.every(([, v]) => v === PRINCIPAL)).toBe(true);
    // The marks: exactly two patches that touch the tier, each exactly the two keys, with If-Match.
    const marks = reqs.filter((r) => r.method === "PATCH" && Object.keys(r.body).some((k) => /visibilityTier|claimSubject/.test(k)));
    expect(marks).toHaveLength(2);
    expect(marks[0]!.body).toEqual({ "a:visibilityTier": "private", "a:claimSubject": { "@id": PRINCIPAL } });
    expect(marks[1]!.body).toEqual({ "a:visibilityTier": null, "a:claimSubject": null });
    expect(marks.every((m) => !!m.headers["if-match"])).toBe(true);
    // The edit made while private is a note patch and does not touch the tier.
    const edit = reqs.filter((r) => r.method === "PATCH" && "a:skillDepthNote" in r.body);
    expect(edit).toHaveLength(1);
    expect(Object.keys(edit[0]!.body)).toEqual(["a:skillDepthNote"]);
    // What the vault holds at the end: shared again, the edited note, the writer's read-back grant still only theirs.
    const [[, c]] = [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");
    expect("a:visibilityTier" in c.facts || "a:claimSubject" in c.facts).toBe(false);
    expect(c.facts["a:skillDepthNote"]).toBe("edited while private");
    expect(c.facts["a:directReader"]).toBe(PRINCIPAL);
  });

  it("while a note is private the edit does not drop the mark: the patch of the note leaves the tier and the subject in the vault", async () => {
    const id = fake.seed("t:HeldPartyFieldClaim", {
      "a:heldParty": { "@id": uriOf(tom) },
      "a:skill": { "@id": NURSING },
      "a:skillDepthNote": "old",
      "a:statedBy": { "@id": stater.uri },
      "a:visibilityTier": "private",
      "a:claimSubject": { "@id": PRINCIPAL },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const h = renderHook(() => useHeldNotes("skill", VAULT, uriOf(tom), PRINCIPAL), { wrapper });
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("private"));
    await act(async () => void (await h.result.current.save(NURSING, "new")));
    expect(store.get(id)!.facts["a:visibilityTier"]).toBe("private");
    expect(store.get(id)!.facts["a:claimSubject"]).toEqual({ "@id": PRINCIPAL });
    expect(store.get(id)!.facts["a:skillDepthNote"]).toBe("new");
    await waitFor(() => expect(h.result.current.markFor(NURSING)).toBe("private"));
  });
});

describe("no composer writes a tier or a claim subject unless it is the mark", () => {
  it("heldClaimFacts refuses both keys in either spelling, as the note's key, the topic's or the stater's", async () => {
    const v = await resolveHeldNoteVocab("skill");
    for (const key of ["a:visibilityTier", "visibilityTier", "a:claimSubject", "claimSubject"]) {
      for (const field of ["note", "topic", "statedBy", "heldParty"] as const) {
        expect(() => heldClaimFacts({ ...v, [field]: key }, { subject: "s", topic: NURSING, note: "x", stater: stater.uri })).toThrow(HeldNoteError);
      }
    }
  });
  it("a master that spells a note term as the tier cannot make saveHeldNote or addHeldTopic write one", async () => {
    fake.attributeSpelling.mockImplementation(async (n: string) => (n === "skillDepthNote" ? "visibilityTier" : n));
    await expect(saveHeldNote({ kind: "skill", vaultId: VAULT, subject: uriOf(tom), topic: NURSING, text: "x", existing: [], stater: stater.uri })).rejects.toThrow(
      "Refusing to write a:visibilityTier on a held claim: a new note is shared with the vault by default and carries no tier.",
    );
    fake.attributeSpelling.mockImplementation(async (n: string) => (n === "topicInterest" ? "claimSubject" : n));
    __resetHeldNoteVocab();
    await expect(addHeldTopic({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: NURSING, existing: [], stater: stater.uri })).rejects.toBeInstanceOf(HeldNoteError);
    expect(fake.createRecord).not.toHaveBeenCalled();
  });
  it("the mark's keys cannot be smuggled into a note's facts by naming them with the mark object either", async () => {
    const v = await resolveHeldNoteVocab("skill");
    const facts = heldClaimFacts(v, { subject: "s", topic: NURSING, note: "x", stater: stater.uri, readerPrincipal: PRINCIPAL });
    expect(Object.keys(facts).sort()).toEqual(["a:directReader", "a:heldParty", "a:skill", "a:skillDepthNote", "a:statedBy"]);
    // The guard is on the object: the facts of a note are never a mark, so adding a tier to them is refused.
    expect(() => refuseGrantKeys({ ...facts, "a:visibilityTier": "private" }, (m) => new HeldNoteError(m), "r")).toThrow(HeldNoteError);
    expect(() => refuseGrantKeys(privateMarkFacts(PRINCIPAL), (m) => new HeldNoteError(m), "r")).not.toThrow();
  });
  it("the read grant is the writer's alone: a blank principal gives no grant, a padded one is trimmed", async () => {
    const v = await resolveHeldNoteVocab("skill");
    const base = { subject: "s", topic: NURSING, note: "x", stater: stater.uri };
    expect("a:directReader" in heldClaimFacts(v, { ...base, readerPrincipal: "   " })).toBe(false);
    expect("a:directReader" in heldClaimFacts(v, { ...base, readerPrincipal: null })).toBe(false);
    expect("a:directReader" in heldClaimFacts(v, base)).toBe(false);
    expect(heldClaimFacts(v, { ...base, readerPrincipal: `  ${PRINCIPAL} ` })["a:directReader"]).toBe(PRINCIPAL);
  });
  it("vocabulary missing refuses with its own error and writes nothing", async () => {
    fake.attributeSpelling.mockImplementation(async (n: string) => (n === "statedBy" ? (null as never) : n));
    await expect(saveHeldNote({ kind: "skill", vaultId: VAULT, subject: uriOf(tom), topic: NURSING, text: "x", existing: [], stater: stater.uri })).rejects.toBeInstanceOf(HeldNoteVocabUnavailableError);
    expect(fake.createRecord).not.toHaveBeenCalled();
  });
});
