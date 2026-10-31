// @vitest-environment jsdom
// New. What InterestRows writes and when, read off the wire: nothing on mount, render, idle or a `canEdit` change; each write exactly what the person asked
// (an add is one POST of one claim and the record is not written; emptying a note PATCHes exactly the note key to null; Make shared nulls exactly the two mark
// keys; a removal is a DELETE and nothing else); no vault, no read; a person with no landing vault is not offered the group.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { AddedByHostContext } from "@kaigilb/gilbplatformcode-added-by";
import { __resetHeldNoteChains, __resetHeldNoteVocab } from "@kaigilb/gilbplatformcode-held-notes";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";

const LABELS: Record<string, string> = { "https://veda.platform.example.test/base/t/Photography": "photography", "https://veda.platform.example.test/base/t/Sailing": "sailing" };
vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel, termLabelOfIri: async (iri: string) => LABELS[iri] ?? null };
});
const stater = vi.hoisted(() => ({ uri: "", noOwnVault: false }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri, () => ({ noOwnVault: stater.noOwnVault })),
);
vi.mock("@kaigilb/gilbplatformcode-skill-picker-sheet", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-skill-picker-sheet")>()),
  SkillPickerSheet: ({ onPick }: { onPick: (s: unknown) => void }) => (
    <button type="button" onClick={() => onPick({ tag: "sailing", uri: "https://veda.platform.example.test/base/e/x", typeUri: "https://veda.platform.example.test/base/t/Sailing", does: "", escoUri: null, harnessRole: null })}>
      pick sailing
    </button>
  ),
}));

// eslint-disable-next-line import/first
import { InterestRows } from "./index";

const { VAULT, store } = fake;
const PHOTO = "https://veda.platform.example.test/base/t/Photography";
const SAIL = "https://veda.platform.example.test/base/t/Sailing";
const AGENT = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;

interface Wire { method: string; url: string; body: Record<string, unknown> | null }
const wire = (): Wire[] =>
  (globalThis.fetch as unknown as { mock: { calls: [unknown, RequestInit?][] } }).mock.calls.map(([u, i]) => ({
    method: (i?.method ?? "GET").toUpperCase(),
    url: String(u),
    body: typeof i?.body === "string" ? (JSON.parse(i.body) as Record<string, unknown>) : null,
  }));
const writes = () => wire().filter((w) => w.method !== "GET");

let tom: string;
let BY: Record<string, unknown>;
beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  stater.noOwnVault = false;
  BY = { "a:statedBy": { "@id": stater.uri } };
});
afterEach(() => {
  cleanup();
  tearDown();
  resetTermOrigin();
  vi.useRealTimers();
});

const tree = (over: { vaultId?: string | null; canEdit?: boolean } = {}, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => (
  <AddedByHostContext.Provider value={{ useShell: () => null }}>
    <QueryClientProvider client={qc}>
      <InterestRows vaultId={over.vaultId === undefined ? VAULT : over.vaultId} principal={AGENT} recordEntityUri={uriOf(tom)} canEdit={over.canEdit ?? true} />
    </QueryClientProvider>
  </AddedByHostContext.Provider>
);
const seedInterest = (topic: string, extra: Record<string, unknown> = {}) =>
  fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": topic }, ...extra });
const rowOf = (name: string) => screen.getAllByTestId("interest-row").find((r) => within(r).getByTestId("interest-row-value").textContent === name)!;

describe("nothing is written without an act", () => {
  it.each([["with a stored interest", true], ["with none", false]])("mount, idle and a canEdit change make zero writes (%s)", async (_n, stored) => {
    if (stored) seedInterest(PHOTO, { "a:topicInterestNote": "Long exposures" });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(tree({}, qc));
    await waitFor(() => expect(wire().some((w) => w.url.includes("find-by-attribute"))).toBe(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    for (const canEdit of [false, true, false]) {
      view.rerender(tree({ canEdit }, qc));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    }
    expect(writes()).toEqual([]);
    expect(fake.requestCount().write).toBe(0);
  });
});

describe("each write is exactly what the person asked", () => {
  it("adding an interest: ONE POST of ONE claim with exactly the claim's keys; the person's record is not written", async () => {
    const before = JSON.stringify(store.get(tom)!.facts);
    render(tree());
    fireEvent.click(await screen.findByTestId("interest-add"));
    fireEvent.click(screen.getByRole("button", { name: "pick sailing" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(rowOf("sailing")).toBeTruthy());
    const w = writes()[0]!;
    expect(w.method).toBe("POST");
    expect(w.url).toContain("/lws/vault/");
    expect(Object.keys((w.body as { facts: Record<string, unknown> }).facts).sort()).toEqual(["a:directReader", "a:heldParty", "a:statedBy", "a:topicInterest"]);
    expect(JSON.stringify(store.get(tom)!.facts)).toBe(before);
    expect(writes().filter((x) => x.url.includes(`/lws/r/${tom}`))).toEqual([]);
  });

  it("emptying a note: exactly one PATCH of the claim, {a:topicInterestNote: null}, nothing else", async () => {
    const id = seedInterest(PHOTO, { "a:topicInterestNote": "old" });
    render(tree());
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    const row = rowOf("photography");
    await waitFor(() => expect(within(row).getByTestId("interest-note-text").textContent).toBe("old"));
    fireEvent.click(within(row).getByRole("button", { name: /Edit note for/ }));
    const box = within(row).getByRole("textbox");
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    await waitFor(() => expect("a:topicInterestNote" in store.get(id)!.facts).toBe(false));
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe("PATCH");
    expect(w[0]!.url).toContain(`/lws/r/${id}`);
    expect(w[0]!.body).toEqual({ "a:topicInterestNote": null });
  });

  it("Make private, then Make shared: the private PATCH holds the tier and the subject, the shared PATCH nulls exactly those two", async () => {
    const id = seedInterest(PHOTO);
    render(tree());
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    fireEvent.click(await within(rowOf("photography")).findByRole("button", { name: /private to me only/ }));
    await waitFor(() => expect(store.get(id)!.facts["a:visibilityTier"]).toBe("private"));
    fireEvent.click(await within(rowOf("photography")).findByRole("button", { name: /to everyone in this vault/ }));
    await waitFor(() => expect("a:visibilityTier" in store.get(id)!.facts).toBe(false));
    const w = writes().filter((x) => x.method === "PATCH");
    expect(w).toHaveLength(2);
    expect(Object.keys(w[0]!.body!).sort()).toEqual(["a:claimSubject", "a:visibilityTier"]);
    expect(Object.values(w[0]!.body!).some((v) => v === null)).toBe(false);
    expect(w[1]!.body).toEqual({ "a:claimSubject": null, "a:visibilityTier": null });
  });

  it("removing an interest: ONE DELETE of the viewer's own claim, no PATCH of anything", async () => {
    const id = seedInterest(PHOTO, { "a:topicInterestNote": "x" });
    render(tree());
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    fireEvent.click(within(rowOf("photography")).getByTestId("interest-row-remove"));
    await waitFor(() => expect(store.has(id)).toBe(false));
    const w = writes();
    expect(w.map((x) => x.method)).toEqual(["DELETE"]);
    expect(w[0]!.url).toContain(`/lws/r/${id}`);
  });
});

describe("no vault, no own vault", () => {
  it("vaultId null: no interest, nothing is looked for, nothing is offered", async () => {
    render(tree({ vaultId: null }));
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryAllByTestId("interest-row")).toHaveLength(0);
    expect(screen.queryByTestId("interest-add")).toBeNull();
    expect(wire().filter((w) => w.url.includes("find-by-attribute"))).toEqual([]);
    expect(writes()).toEqual([]);
  });
  it("a person with no landing vault of their own who may edit: the group is not drawn at all", async () => {
    stater.noOwnVault = true;
    seedInterest(PHOTO);
    render(tree({ canEdit: true }));
    await waitFor(() => expect(wire().some((w) => w.url.includes("find-by-attribute"))).toBe(true));
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.queryByTestId("interest-section")).toBeNull();
    expect(writes()).toEqual([]);
  });
  it("the same person, read-only: the interests are drawn as text and nothing is offered", async () => {
    stater.noOwnVault = true;
    seedInterest(PHOTO);
    render(tree({ canEdit: false }));
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    expect(screen.queryByTestId("interest-add")).toBeNull();
    expect(screen.queryByTestId("interest-row-remove")).toBeNull();
  });
});
