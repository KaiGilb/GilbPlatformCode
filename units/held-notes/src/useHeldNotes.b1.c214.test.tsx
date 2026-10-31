// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/heldnote/useHeldNotes.b1.c214.test.tsx` (3 cases).
// Re-based: the source drove the store through module mocks of the app's record client; here the real peers run over a fake platform
// (test/fakePlaceStore.ts, at the level of `fetch`). `listVaultRecordsPage` is not part of the store.
// Agent.Scaling Delta7 B1 (P3, P11) at the HOOK, at N = 100 notes about other people in the vault, every
// store request taking 1 ms (MOCK latency, `fakePlaceStore`), as Scaling's probe drove them: two saves of
// one note 3 ms apart, and a removal 3 ms after a save started.
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

const { VAULT, store } = fake;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let tom: string;

function slowStore() {
  for (const f of [fake.readRecord, fake.findByAttribute, fake.createRecord, fake.patchRecord, fake.deleteRecord] as const) {
    const impl = (f as unknown as { getMockImplementation: () => (...a: unknown[]) => Promise<unknown> }).getMockImplementation();
    (f as unknown as { mockImplementation: (g: (...a: unknown[]) => Promise<unknown>) => void }).mockImplementation(async (...a: unknown[]) => (await sleep(1), impl(...a)));
  }
}

afterEach(tearDown);
beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  for (let i = 0; i < 100; i++) {
    const other = fake.seed("t:Person", { "a:givenName": `P${i}` });
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": stater.uri }, "a:heldParty": { "@id": uriOf(other) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": `n${i}` });
  }
  slowStore();
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useHeldNotes("skill", VAULT, uriOf(tom), "https://id.platform.example.test/base/p/kai"), { wrapper });
}
const tomsNursing = () =>
  [...store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim" && JSON.stringify(e.facts["a:heldParty"]) === JSON.stringify({ "@id": uriOf(tom) }));

describe("Delta7 B1 at the hook, N = 100", () => {
  it("P3: two saves 3 ms apart make ONE claim holding the LAST text; both report kept", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.noteFor(NURSING)).toBe(""), { timeout: 5000 });
    let a!: Promise<boolean>, b!: Promise<boolean>;
    await act(async () => {
      a = result.current.save(NURSING, "Ward nurse");
      await sleep(3);
      b = result.current.save(NURSING, "Ward nurse, ICU");
      await Promise.all([a, b]);
    });
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(tomsNursing()).toHaveLength(1);
    expect(tomsNursing()[0]!.facts["a:skillDepthNote"]).toBe("Ward nurse, ICU");
    await waitFor(() => expect(result.current.noteFor(NURSING)).toBe("Ward nurse, ICU"));
  });

  it("P11: a removal 3 ms after a save started leaves NO claim, and says 'gone' truthfully", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.noteFor(NURSING)).toBe(""), { timeout: 5000 });
    let gone!: boolean;
    await act(async () => {
      const s = result.current.save(NURSING, "Ward nurse");
      await sleep(3);
      gone = await result.current.removeFor(NURSING);
      await s;
    });
    expect(gone).toBe(true);
    expect(tomsNursing()).toHaveLength(0);
  });

  it("a removal the store answers but does not carry out is ⛔ not reported as gone", async () => {
    const id = fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": stater.uri }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "kept" });
    const { result } = mount();
    await waitFor(() => expect(result.current.noteFor(NURSING)).toBe("kept"), { timeout: 5000 });
    fake.deleteRecord.mockImplementationOnce(async () => undefined);
    let gone!: boolean;
    await act(async () => {
      gone = await result.current.removeFor(NURSING);
    });
    expect(store.has(id)).toBe(true);
    expect(gone).toBe(false);
    await waitFor(() => expect(result.current.errorFor(NURSING)).toContain("could not be confirmed removed"));
  });
});
