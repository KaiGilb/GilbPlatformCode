// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/heldnote/useHeldNotes.f1.d8.test.tsx` (2 cases).
// Re-based: the source drove the store through module mocks of the app's record client; here the real peers run over a fake platform
// (test/fakePlaceStore.ts, at the level of `fetch`). 
// Agent.Scaling Delta8 F1 (GilbApp) — a person card mounts the Skills hook AND the Interests hook. Both
// keep claims of the same type about the same person (`a:heldParty`), so they share ONE read per (vault,
// person): 2 finds (the two IRI spellings) + n reads, ⛔ not 4 finds + 2n reads (Delta8 P1).
// MOCK: `fakePlaceStore`, the record client and the find doubled; the hooks and the store module are real.
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
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) => (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri));

// eslint-disable-next-line import/first
import { useHeldNotes, __resetHeldNoteChains } from "./useHeldNotes";
// eslint-disable-next-line import/first
import { __resetHeldNoteVocab } from "./heldNoteVocab";

const { VAULT } = fake;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const SELL = "https://veda.platform.example.test/base/t/SellProducts";
const PHOTO = "https://veda.platform.example.test/base/t/Photography";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
let tom: string;

afterEach(tearDown);
beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  const by = { "a:statedBy": { "@id": stater.uri }, "a:heldParty": { "@id": uriOf(tom) } };
  fake.seed("t:HeldPartyFieldClaim", { ...by, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ICU" });
  fake.seed("t:HeldPartyFieldClaim", { ...by, "a:skill": { "@id": SELL } });
  fake.seed("t:HeldPartyFieldClaim", { ...by, "a:topicInterest": { "@id": PHOTO }, "a:topicInterestNote": "night shots" });
  // 30 held claims about OTHER people: they cost nothing.
  for (let i = 0; i < 30; i++) {
    const other = fake.seed("t:Person", { "a:givenName": `P${i}` });
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": stater.uri }, "a:heldParty": { "@id": uriOf(other) }, "a:skill": { "@id": NURSING } });
  }
});

/** A person card: the Skills section and the Interests section, as `RecordDetail` mounts them. */
function mountCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(
    () => ({
      skills: useHeldNotes("skill", VAULT, uriOf(tom), "https://id.platform.example.test/base/p/kai"),
      interests: useHeldNotes("interest", VAULT, uriOf(tom), "https://id.platform.example.test/base/p/kai"),
    }),
    { wrapper },
  );
}

describe("Delta8 F1: one held-claim read for the Skills and Interests sections", () => {
  it("opening a card with n = 3 claims about the person is 2 finds + 3 reads, ⛔ 4 finds + 6 reads", async () => {
    fake.findByAttribute.mockClear();
    fake.readRecord.mockClear();
    const { result } = mountCard();
    await waitFor(() => {
      expect(result.current.skills.noteFor(NURSING)).toBe("ICU");
      expect(result.current.interests.noteFor(PHOTO)).toBe("night shots");
    });
    expect(result.current.skills.topics()).toEqual([NURSING, SELL]);
    expect(result.current.interests.topics()).toEqual([PHOTO]);
    expect(fake.requestCount()).toEqual({ find: 2, read: 3, list: 0, write: 0 });
  });

  it("a note saved in one section is seen by the other's read, with no second read of the person", async () => {
    const { result } = mountCard();
    await waitFor(() => expect(result.current.interests.noteFor(PHOTO)).toBe("night shots"));
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.interests.save(PHOTO, "long exposures");
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.interests.noteFor(PHOTO)).toBe("long exposures"));
    // The Skills section still shows its notes (the shared read kept them).
    expect(result.current.skills.noteFor(NURSING)).toBe("ICU");
  });
});
