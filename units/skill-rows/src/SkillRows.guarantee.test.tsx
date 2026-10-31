// @vitest-environment jsdom
// New. What SkillRows writes and when, read off the wire: nothing on mount, render, idle or a `canEdit` change; a PATCH carries a null only for the key the person
// cleared; no vault, no read. Every request is recorded at `fetch` with its method and body.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetHeldNoteChains, __resetHeldNoteVocab } from "@kaigilb/gilbplatformcode-held-notes";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { mount } from "../test/contactRowsHost";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
const stater = vi.hoisted(() => ({ uri: "" as string }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri),
);

// eslint-disable-next-line import/first
import { SkillRows } from "./index";

const { VAULT, store } = fake;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const SELL = "https://veda.platform.example.test/base/t/SellProducts";
const AGENT = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const META = {
  skill: { type: "skill", label: "nursing", order: 7, access: "private", valueIndex: 0 },
  skill2: { type: "skill", label: "sell products", order: 8, access: "private", valueIndex: 1 },
};

interface Wire { method: string; url: string; body: Record<string, unknown> | null }
const wire = (): Wire[] =>
  (globalThis.fetch as unknown as { mock: { calls: [unknown, RequestInit?][] } }).mock.calls.map(([u, i]) => ({
    method: (i?.method ?? "GET").toUpperCase(),
    url: String(u),
    body: typeof i?.body === "string" ? (JSON.parse(i.body) as Record<string, unknown>) : null,
  }));
const writes = () => wire().filter((w) => w.method !== "GET");
/** Every key sent as null in the bodies of `list`. */
const nullsOf = (list: Wire[]) => list.flatMap((w) => Object.entries(w.body ?? {}).filter(([, v]) => v === null).map(([k]) => k)).sort();

let tom: string;
let BY: Record<string, unknown>;
beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  tom = fake.seed("t:Person", { "a:givenName": "Tom", "a:skill": [{ "@id": NURSING }, { "@id": SELL }], "a:fieldMeta": META });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  BY = { "a:statedBy": { "@id": stater.uri } };
});
afterEach(() => {
  cleanup();
  tearDown();
  resetTermOrigin();
  vi.useRealTimers();
});

type Props = ComponentProps<typeof SkillRows>;
let seq = 0;
const propsOf = (over: Partial<Props> = {}): Props => {
  const facts = store.get(tom)!.facts;
  return {
    vaultId: VAULT, principal: AGENT, recordId: tom, recordEntityUri: uriOf(tom), title: "Skill", valueKey: "skill", metaKey: "fieldMeta",
    served: { values: facts["a:skill"], meta: facts["a:fieldMeta"] }, etag: `"g${++seq}"`, canEdit: true, onSaved: vi.fn(), ...over,
  };
};
const rowOf = (name: string) => screen.getAllByTestId("skill-row").find((r) => within(r).getByTestId("skill-row-value").textContent?.includes(name))!;
const seedNote = (extra: Record<string, unknown>) => fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, ...extra });

describe("nothing is written without an act", () => {
  it.each([["with a stored note", true], ["with no note", false]])("mount, idle and a canEdit change make zero writes (%s)", async (_n, withNote) => {
    if (withNote) seedNote({ "a:skillDepthNote": "ICU nights" });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = mount(<SkillRows {...propsOf()} />);
    await waitFor(() => expect(wire().some((w) => w.url.includes("find-by-attribute"))).toBe(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    for (const canEdit of [false, true, false]) {
      view.rerender(<SkillRows {...propsOf({ canEdit })} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    }
    expect(writes()).toEqual([]);
    expect(fake.requestCount().write).toBe(0);
  });
});

describe("a PATCH carries a null only for the key the person cleared", () => {
  it("emptying a note: exactly one PATCH of the claim, {a:skillDepthNote: null}, nothing else", async () => {
    const id = seedNote({ "a:skillDepthNote": "old" });
    mount(<SkillRows {...propsOf()} />);
    const row = rowOf("nursing");
    await waitFor(() => expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("old"));
    fireEvent.click(within(row).getByRole("button", { name: "Edit note for nursing" }));
    fireEvent.change(within(row).getByRole("textbox", { name: "About nursing" }), { target: { value: "" } });
    fireEvent.blur(within(row).getByRole("textbox", { name: "About nursing" }));
    await waitFor(() => expect("a:skillDepthNote" in store.get(id)!.facts).toBe(false));
    const w = writes();
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe("PATCH");
    expect(w[0]!.url).toContain(`/lws/r/${id}`);
    expect(w[0]!.body).toEqual({ "a:skillDepthNote": null });
    expect(nullsOf(w)).toEqual(["a:skillDepthNote"]);
  });

  it("Make private, then Make shared: the private PATCH holds the tier and the subject, the shared PATCH nulls exactly those two", async () => {
    const id = seedNote({ "a:skillDepthNote": "n" });
    mount(<SkillRows {...propsOf()} />);
    await waitFor(() => expect(within(rowOf("nursing")).queryByRole("button", { name: /private to me only/ })).not.toBeNull());
    fireEvent.click(within(rowOf("nursing")).getByRole("button", { name: /private to me only/ }));
    await waitFor(() => expect(store.get(id)!.facts["a:visibilityTier"]).toBe("private"));
    expect(nullsOf(writes())).toEqual([]);
    fireEvent.click(await within(rowOf("nursing")).findByRole("button", { name: /to everyone in this vault/ }));
    await waitFor(() => expect("a:visibilityTier" in store.get(id)!.facts).toBe(false));
    const w = writes().filter((x) => x.method === "PATCH");
    expect(w).toHaveLength(2);
    expect(Object.keys(w[0]!.body!).sort()).toEqual(["a:claimSubject", "a:visibilityTier"]);
    expect(w[1]!.body).toEqual({ "a:claimSubject": null, "a:visibilityTier": null });
  });

  it("removing a skill: ONE record PATCH that nulls exactly that skill's sidecar entry, then a DELETE of the viewer's own claim for it; nothing else", async () => {
    const id = seedNote({ "a:skillDepthNote": "t-n" });
    seedNote({ "a:skillDepthNote": "ann's", "a:statedBy": { "@id": "https://anna.platform.example.test/base/e/anna" } });
    mount(<SkillRows {...propsOf()} />);
    await waitFor(() => expect(within(rowOf("nursing")).getByTestId("skill-depth-note-text").textContent).toBe("t-n"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Skill nursing" }));
    await waitFor(() => expect(store.has(id)).toBe(false));
    const w = writes();
    expect(w.map((x) => x.method)).toEqual(["PATCH", "DELETE"]);
    expect(w[0]!.url).toContain(`/lws/r/${tom}`);
    const patched = w[0]!.body!;
    expect(Object.keys(patched).sort()).toEqual(["a:fieldMeta", "a:skill"]);
    expect(patched["a:skill"]).toEqual([{ "@id": SELL }]);
    // the one entry the person cleared: the sidecar entry of the removed skill (the other skill keeps its entry)
    const meta = patched["a:fieldMeta"] as Record<string, unknown>;
    expect(Object.entries(meta).filter(([, v]) => v === null)).toHaveLength(1);
    expect(w[1]!.url).toContain(`/lws/r/${id}`);
  });
});

describe("no vault, no read and no notes", () => {
  it("vaultId null: the skills are drawn, no claim is looked for, no note block, nothing is written", async () => {
    mount(<SkillRows {...propsOf({ vaultId: null })} />);
    expect(screen.getAllByTestId("skill-row")).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 60));
    expect(wire().filter((w) => w.url.includes("find-by-attribute"))).toEqual([]);
    expect(wire().filter((w) => /heldParty/.test(decodeURIComponent(w.url)))).toEqual([]);
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
    expect(writes()).toEqual([]);
  });
});
