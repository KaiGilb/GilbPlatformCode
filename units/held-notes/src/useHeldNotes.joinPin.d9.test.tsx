// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/heldnote/useHeldNotes.joinPin.d9.test.tsx` (1 cases).
// Re-based: the source drove the store through module mocks of the app's record client; here the real peers run over a fake platform
// (test/fakePlaceStore.ts, at the level of `fetch`). The source's `wrapped` once-only guard is dropped: `resetStore` here resets the spies' implementations, so the latency wrapper is put on again for each world.
// Agent.Scaling Delta9 F6 (GilbApp, Cycle214 1e) — PIN the reason `readFresh` never joins a read already
// in flight. A plan before a write (save, add, remove) must start its OWN fresh read. Joining one that
// began before the previous act's write landed hands the plan the store as it was BEFORE that write, and
// the act writes a second claim: Scaling measured it with `qc.fetchQuery` in `readFresh` — two saves of
// one note made 2 claims, both acts said "saved", and the next read showed the EARLIER text.
// ⛔ A later "simplification" back to `fetchQuery` (or any join) must turn this test red.
// Adopted from Agent.Scaling's Delta9 F1x join probe (`agscD9Hook.probe.test.tsx`), with its outcome
// asserted. REAL: useHeldNotes, heldNote, attributeFind, dpop (real ES256 proofs), config at build:prod
// values. MOCK: the record client and vocabulary (fakePlaceStore); the network is the two-host fake.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
const stater = vi.hoisted(() => ({ uri: "" }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) => (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri));

// eslint-disable-next-line import/first
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
// eslint-disable-next-line import/first
import { server, resetServer, serverFetch, VAULT_B } from "../test/twoHostFindFake";
// eslint-disable-next-line import/first
import { useHeldNotes, __resetHeldNoteChains, heldClaimsKey } from "./useHeldNotes";
// eslint-disable-next-line import/first
import { __resetHeldNoteVocab } from "./heldNoteVocab";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PRINCIPAL = "https://id.platform.example.test/base/p/kai";
let tom: string;
const lat = { ms: 0 };
const hooks: { onCreate: null | (() => Promise<void>) } = { onCreate: null };

function latencyStore() {
  for (const f of [fake.readRecord, fake.createRecord, fake.patchRecord, fake.deleteRecord] as const) {
    const impl = (f as unknown as { getMockImplementation: () => (...a: unknown[]) => Promise<unknown> }).getMockImplementation();
    const isCreate = f === fake.createRecord;
    (f as unknown as { mockImplementation: (g: (...a: unknown[]) => Promise<unknown>) => void }).mockImplementation(async (...a: unknown[]) => {
      if (isCreate && hooks.onCreate) {
        const h = hooks.onCreate;
        hooks.onCreate = null;
        await h();
      }
      if (lat.ms) await sleep(lat.ms);
      return impl(...a);
    });
  }
}
afterEach(tearDown);
function world(nAboutTom: number, others: number) {
  setUp();
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  resetServer();
  vi.stubGlobal("fetch", vi.fn(serverFetch));
  lat.ms = 0;
  tom = `${VAULT_B}/e/${fake.seed("t:Person", { "a:givenName": "Tom" })}`;
  stater.uri = `${VAULT_B}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  for (let i = 0; i < others; i++) {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": stater.uri }, "a:heldParty": { "@id": `${VAULT_B}/e/other${i}` }, "a:skill": { "@id": `https://veda.platform.example.test/base/t/S${i}` }, "a:skillDepthNote": `n${i}` });
  }
  for (let i = 0; i < nAboutTom; i++) {
    const k = i % 2 ? "a:topicInterest" : "a:skill";
    const nk = i % 2 ? "a:topicInterestNote" : "a:skillDepthNote";
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": stater.uri }, "a:heldParty": { "@id": tom }, [k]: { "@id": `https://veda.platform.example.test/base/t/T${i}` }, [nk]: `note ${i}` });
  }
  latencyStore();
}
function mountCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const h = renderHook(() => ({ skill: useHeldNotes("skill", VAULT_B, tom, PRINCIPAL), interest: useHeldNotes("interest", VAULT_B, tom, PRINCIPAL) }), { wrapper });
  return { h, qc };
}
const tomsClaimsFor = (topic: string) =>
  [...fake.store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim" && JSON.stringify(e.facts["a:heldParty"]) === JSON.stringify({ "@id": tom }) && JSON.stringify(e.facts["a:topicInterest"]) === JSON.stringify({ "@id": topic }));

beforeEach(() => world(0, 0));

describe("Delta9 F6: an act plans on its own fresh read, never on one already in flight", () => {
  const NEW = "https://veda.platform.example.test/base/t/Sailing";
  it("🔴 a load starts AFTER act A has read and BEFORE A's write lands; act B on the same interest after A → 1 claim, B's text", async () => {
    world(3, 0);
    lat.ms = 10;
    server.latencyMs = 10;
    const { h, qc } = mountCard();
    await waitFor(() => expect(h.result.current.interest.topics()).not.toBeNull(), { timeout: 60_000 });
    let release!: () => void;
    let R: Promise<unknown> = Promise.resolve();
    // When A's create starts (A has read and planned), a load R starts (window focus, another card
    // mounting): its find answer is the store BEFORE A's write, and it is delivered late.
    hooks.onCreate = async () => {
      server.holdNextFind = new Promise<void>((r) => (release = r));
      R = qc.refetchQueries({ queryKey: heldClaimsKey(VAULT_B, tom) });
      await sleep(40);
    };
    let a = false;
    await act(async () => {
      a = await h.result.current.interest.save(NEW, "first");
    });
    expect(a).toBe(true);
    expect(tomsClaimsFor(NEW)).toHaveLength(1);
    let b: Promise<boolean> | null = null;
    await act(async () => {
      b = h.result.current.interest.save(NEW, "second");
      await sleep(60);
    });
    release(); // R lands now; a B that joined R would get R's answer, taken before A wrote
    let bOk = false;
    await act(async () => {
      bOk = await b!;
      await R;
      await sleep(50);
    });
    expect(bOk).toBe(true);
    const claims = tomsClaimsFor(NEW);
    expect(claims).toHaveLength(1);
    expect(claims.map((c) => c.facts["a:topicInterestNote"])).toEqual(["second"]);
    // The next read shows B's text (with the join it showed A's).
    await act(async () => {
      await qc.refetchQueries({ queryKey: heldClaimsKey(VAULT_B, tom) });
      await sleep(50);
    });
    expect(h.result.current.interest.noteFor(NEW)).toBe("second");
    h.unmount();
  }, 120_000);
});
