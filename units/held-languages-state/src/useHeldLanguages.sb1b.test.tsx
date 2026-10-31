// @vitest-environment jsdom
// Ported from the source's `heldPrivate.sb1b.test.tsx`: the block "SB1b-1 a language", 2 cases (the other blocks are `held-notes`' and the organization number's).
// Re-based: the source drove the store through module mocks of the app's record client and read `patchRecord`'s fourth argument for If-Match; here the real peers
// run over the fake platform (test/fakePlaceStore.ts, at the level of `fetch`) and the PATCH is read as it went out on the wire, with its If-Match header.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { watchWire, writes, type WireCall } from "../test/wire";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
const ADDER = vi.hoisted(() => "https://adder.platform.example.test/base/e/vsc-adder");
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => ADDER),
);

// eslint-disable-next-line import/first
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
// eslint-disable-next-line import/first
import { __resetHeldLanguageVocab } from "@kaigilb/gilbplatformcode-held-language";
// eslint-disable-next-line import/first
import { useHeldLanguages } from "./index";

const { VAULT, store } = fake;
const AGENT = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const NOR = "https://veda.platform.example.test/base/e/xja6zz79cmva";
const OTHER_ADDER = "https://other.platform.example.test/base/e/vsc-other";

let tom: string;
let qc: QueryClient;
let calls: WireCall[];
beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldNoteChains();
  __resetHeldLanguageVocab();
  fake.attributeSpelling.mockImplementation(async (name: string) => name);
  calls = watchWire();
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  resetTermOrigin();
  tearDown();
});
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
/** The PATCHes that went out, as `[id, body, If-Match]`. */
const patches = () => writes(calls).filter((c) => c.method === "PATCH").map((c) => [c.url.split("/lws/r/")[1], c.body, c.headers["if-match"]] as const);

describe("SB1b-1 a language", () => {
  const seed = (statedBy: string, language = NOR) => fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf(tom) }, "a:languageUsed": { "@id": language }, "a:statedBy": { "@id": statedBy } });

  it("private writes exactly the tier and the principal in ONE PATCH with If-Match; back to shared writes both null in ONE PATCH", async () => {
    const mine = seed(ADDER);
    const langs = renderHook(() => useHeldLanguages(VAULT, uriOf(tom), AGENT, { tag: "", write: null }), { wrapper });
    await waitFor(() => expect(langs.result.current.rows.find((r) => r.language === NOR)?.own).toBe(true));
    const row = () => langs.result.current.rows.find((r) => r.language === NOR)!;
    const etag = `"${store.get(mine)!.seq}"`;
    await act(async () => {
      expect(await langs.result.current.setPrivate!(row(), true)).toBe(true);
    });
    expect(patches()).toEqual([[mine, { "a:visibilityTier": "private", "a:claimSubject": { "@id": AGENT } }, etag]]);
    expect(store.get(mine)!.facts["a:visibilityTier"]).toBe("private");
    await waitFor(() => expect(row().private).toBe(true));
    calls.length = 0;
    const etag2 = `"${store.get(mine)!.seq}"`;
    await act(async () => {
      expect(await langs.result.current.setPrivate!(row(), false)).toBe(true);
    });
    expect(patches()).toEqual([[mine, { "a:visibilityTier": null, "a:claimSubject": null }, etag2]]);
    await waitFor(() => expect(row().private).toBe(false));
  });

  it("a language another adder (or an old vault card) wrote has no switch (own = false) and the hook refuses it", async () => {
    seed(OTHER_ADDER);
    const langs = renderHook(() => useHeldLanguages(VAULT, uriOf(tom), AGENT, { tag: "", write: null }), { wrapper });
    await waitFor(() => expect(langs.result.current.rows).toHaveLength(1));
    await waitFor(() => expect(langs.result.current.rows[0]!.own).toBe(false));
    await act(async () => {
      expect(await langs.result.current.setPrivate!(langs.result.current.rows[0]!, true)).toBe(false);
    });
    expect(langs.result.current.errorFor(NOR)).toBe("You did not add this, so you cannot change who sees it.");
    expect(writes(calls)).toHaveLength(0);
  });

  it("new (not in the source): a mark the store accepted but did not keep is said, not reported done", async () => {
    seed(ADDER);
    fake.patchRecord.mockImplementation(async () => ({ etag: '"0"' }));
    const langs = renderHook(() => useHeldLanguages(VAULT, uriOf(tom), AGENT, { tag: "", write: null }), { wrapper });
    await waitFor(() => expect(langs.result.current.rows.find((r) => r.language === NOR)?.own).toBe(true));
    await act(async () => {
      expect(await langs.result.current.setPrivate!(langs.result.current.rows[0]!, true)).toBe(false);
    });
    expect(langs.result.current.errorFor(NOR)).toBe("The store accepted this but did not keep it, so who sees it is not changed. Try again.");
  });
});
