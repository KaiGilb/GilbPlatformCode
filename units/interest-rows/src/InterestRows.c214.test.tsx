// @vitest-environment jsdom
// Ported from the source's `InterestRows.c214.test.tsx` (12 cases). Re-based: the source drove the store through module mocks of the app's record client; here the real
// peers (`held-notes`, `added-by`, `skill-picker-sheet`'s note, `lws-records`) run over a fake platform at the level of `fetch` (test/fakePlaceStore.ts). The picker is a
// double that picks one catalogue term (the real picker has its own tests); the term's label is a double of the ontology's. The cases are otherwise the source's, with
// ONE change: the (-) control's name is the interest's NAME ("Remove interest photography"); the source named it by the last part of the address ("Photography").
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { AddedByHostContext, __resetAddedByForTest } from "@kaigilb/gilbplatformcode-added-by";
import { __resetHeldNoteChains, __resetHeldNoteVocab } from "@kaigilb/gilbplatformcode-held-notes";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { installSourceName } from "../test/addedByTestkit";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  // The master's label of a catalogue term (a double; the live `t/Photography` answers its own `a:label`).
  const LABELS: Record<string, string> = { "https://veda.platform.example.test/base/t/Photography": "photography", "https://veda.platform.example.test/base/t/Sailing": "sailing" };
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel, termLabelOfIri: async (iri: string) => LABELS[iri] ?? null };
});
const stater = vi.hoisted(() => ({ uri: "" }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri),
);
vi.mock("@kaigilb/gilbplatformcode-skill-picker-sheet", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-skill-picker-sheet")>()),
  SkillPickerSheet: ({ noun, onPick }: { noun: string; onPick: (s: unknown) => void }) => (
    <button type="button" onClick={() => onPick({ tag: "sailing", uri: "https://veda.platform.example.test/base/e/x", typeUri: "https://veda.platform.example.test/base/t/Sailing", does: "", escoUri: null, harnessRole: null })}>
      pick sailing ({noun})
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
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");
let tom: string;
let ann: string;
let BY: Record<string, unknown>;

beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  tom = fake.seed("t:Person", { "a:givenName": "Tom" });
  ann = fake.seed("t:Person", { "a:givenName": "Ann" });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  BY = { "a:statedBy": { "@id": stater.uri } };
});
afterEach(() => {
  cleanup();
  tearDown();
  resetTermOrigin();
});

function show(canEdit = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AddedByHostContext.Provider value={{ useShell: () => null }}>
      <QueryClientProvider client={qc}>
        <InterestRows vaultId={VAULT} principal={AGENT} recordEntityUri={uriOf(tom)} canEdit={canEdit} />
      </QueryClientProvider>
    </AddedByHostContext.Provider>,
  );
}
const rowOf = (name: string) => screen.getAllByTestId("interest-row").find((r) => within(r).getByTestId("interest-row-value").textContent === name)!;


describe("InterestRows — interests on a held person card, each with its note", () => {
  it("shows THIS person's interests stated by this vault, by the term's own name, each with 'About this interest'; ⛔ not Ann's", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": PHOTO }, "a:topicInterestNote": "Long exposures" });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:topicInterest": { "@id": SAIL } });
    show();
    await waitFor(() => expect(screen.getAllByTestId("interest-row")).toHaveLength(1));
    const row = rowOf("photography");
    expect(within(row).getByTestId("interest-note").textContent).toContain("About this interest");
    expect(within(row).getByTestId("interest-note-text").textContent).toBe("Long exposures");
    expect(screen.queryByText("sailing")).toBeNull();
  });

  it("an interest picked from the catalogue becomes ONE held claim; the person's record is ⛔ not written; ⛔ no rung, ⛔ no claim subject", async () => {
    const before = JSON.stringify(store.get(tom)!.facts);
    show();
    fireEvent.click(await screen.findByTestId("interest-add"));
    fireEvent.click(screen.getByRole("button", { name: "pick sailing (interest)" }));
    await waitFor(() => expect(claims()).toHaveLength(1));
    expect(claims()[0]![1].facts).toEqual({
      "a:heldParty": { "@id": uriOf(tom) },
      "a:topicInterest": { "@id": SAIL },
      "a:statedBy": { "@id": stater.uri },
      "a:directReader": AGENT,
    });
    expect(JSON.stringify(store.get(tom)!.facts)).toBe(before);
    await waitFor(() => expect(rowOf("sailing")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the note is saved on leaving the box as a:topicInterestNote on the SAME claim; emptying it keeps the interest", async () => {
    const id = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": PHOTO } });
    show();
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    const row = rowOf("photography");
    const type = async (text: string) => {
      fireEvent.click(await within(row).findByRole("button", { name: /Edit note for/ }));
      const box = within(row).getByRole("textbox");
      fireEvent.change(box, { target: { value: text } });
      fireEvent.blur(box);
    };
    expect(within(row).getByTestId("interest-note-text").textContent).toBe("Add a note about this interest");
    await type("Night shots of the fjord");
    await waitFor(() => expect(store.get(id)!.facts["a:topicInterestNote"]).toBe("Night shots of the fjord"));
    expect(claims()).toHaveLength(1);
    expect("a:skillDepthNote" in store.get(id)!.facts).toBe(false);
    await type("");
    await waitFor(() => expect("a:topicInterestNote" in store.get(id)!.facts).toBe(false));
    expect(store.get(id)!.facts["a:topicInterest"]).toEqual({ "@id": PHOTO });
  });

  // s8 card UX (Kai's walk 2, item 3, verbatim: "Place the proper (−) back to the left together with the
  // content it is deleting"): MyNet's `InterestsCard` draws `RemoveControl` first in the row. So does this.
  it("S8: the remove control is MyNet's (−), the interest row's FIRST element, in front of the interest's name", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": PHOTO } });
    show();
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    const row = rowOf("photography");
    const btn = within(row).getByTestId("interest-row-remove");
    expect(btn.getAttribute("data-remove-control")).toBe("minus-circle");
    expect(btn.getAttribute("aria-label")).toBe("Remove interest photography");
    expect(btn.textContent).toBe("");
    expect(row.firstElementChild).toBe(btn);
  });

  it("removing an interest deletes its claim (and its note); Ann's claim on the same interest stays", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": PHOTO }, "a:topicInterestNote": "x" });
    const keepAnn = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:topicInterest": { "@id": PHOTO } });
    show();
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    fireEvent.click(within(rowOf("photography")).getByTestId("interest-row-remove"));
    await waitFor(() => expect(claims().map(([id]) => id)).toEqual([keepAnn]));
    await waitFor(() => expect(screen.queryAllByTestId("interest-row")).toHaveLength(0));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("read-only: interests and notes shown as text; no add, no remove, no edit", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": PHOTO }, "a:topicInterestNote": "Long exposures" });
    show(false);
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    expect(screen.queryByTestId("interest-add")).toBeNull();
    expect(screen.queryByTestId("interest-row-remove")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit note/ })).toBeNull();
    expect(screen.getByTestId("interest-note-text").textContent).toBe("Long exposures");
  });

  it("a failed read is said, ⛔ never shown as 'no interests' (nothing is offered)", async () => {
    fake.findByAttribute.mockRejectedValueOnce(new Error("503"));
    show();
    expect((await screen.findByTestId("interest-notes-read-error")).textContent).toContain("Could not read the interest notes");
    expect(screen.queryByTestId("interest-add")).toBeNull();
  });
});

describe("SB1b-1 InterestRows — the 'who sees this' switch (RuleBaseappSourceIsAdder point 4)", () => {
  const seedInterest = (statedBy: string, topic: string, extra: Record<string, unknown> = {}) =>
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": statedBy }, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": topic }, ...extra });

  it("an interest the viewer added offers 'Make private to me only'; pressing it makes it private in one PATCH, then shows 'Only you see this' and offers 'Everyone in this vault'", async () => {
    const id = seedInterest(stater.uri, PHOTO);
    show();
    await waitFor(() => expect(rowOf("photography")).toBeTruthy());
    const row = rowOf("photography");
    expect(within(row).queryByTestId("held-private-label")).toBeNull();
    expect((await within(row).findByTestId("held-visibility-private")).textContent).toBe("Make private to me only");
    // The old wording is gone: no button reads "Only me" on a shared own detail.
    expect(within(row).queryByText("Only me")).toBeNull();
    expect(within(row).queryByRole("button", { name: /^Only me$/ })).toBeNull();
    fireEvent.click(await within(row).findByRole("button", { name: /private to me only/ }));
    await waitFor(() => expect(store.get(id)!.facts["a:visibilityTier"]).toBe("private"));
    expect(fake.patchRecord.mock.calls.filter((c) => c[0] === id)).toHaveLength(1);
    expect((await within(row).findByTestId("held-private-label")).textContent).toBe("Only you see this");
    fireEvent.click(within(row).getByRole("button", { name: /to everyone in this vault/ }));
    await waitFor(() => expect("a:visibilityTier" in store.get(id)!.facts).toBe(false));
    await waitFor(() => expect(within(row).queryByTestId("held-private-label")).toBeNull());
    expect(within(row).getByText("Make private to me only")).toBeTruthy();
  });

  it("an interest another adder or an old vault card stated has NO switch and no label", async () => {
    seedInterest("https://other.gilb.com/base/e/vsc-other", PHOTO);
    seedInterest(uriOf("vsc-oldvaultcard"), SAIL);
    show();
    await waitFor(() => expect(screen.getAllByTestId("interest-row")).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("held-visibility")).toBeNull();
    expect(screen.queryByText("Make private to me only")).toBeNull();
  });

  it("in presentation (canEdit false) a private interest shows its label and no control", async () => {
    seedInterest(stater.uri, PHOTO, { "a:visibilityTier": "private", "a:claimSubject": { "@id": AGENT } });
    show(false);
    await waitFor(() => expect(screen.getByTestId("held-private-label").textContent).toBe("Only you see this"));
    expect(screen.queryByText("Everyone in this vault")).toBeNull();
    expect(screen.queryByText("Make private to me only")).toBeNull();
  });
});

describe("SB1b-2 InterestRows — 'Added by <name>' with a link to the adder's card", () => {
  const ANNA = "https://anna.gilb.com/base/e/vsc-anna";
  const seedInterest = (statedBy: string, topic: string) =>
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": statedBy }, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": topic } });
  beforeEach(() => __resetAddedByForTest());

  it("another adder's interest shows 'Added by Anna Berg' with the name a link to her card; the viewer's own shows 'Added by you' with no link; ONE request, for the other adder's only", async () => {
    seedInterest(stater.uri, PHOTO);
    const hers = seedInterest(ANNA, SAIL);
    const rig = installSourceName((items) => ({ [items[0]!]: { statedBy: ANNA, name: "Anna Berg" } }));
    try {
      show();
      await waitFor(() => expect(within(rowOf("sailing")).getByTestId("added-by-link").textContent).toBe("Anna Berg"));
      const link = within(rowOf("sailing")).getByTestId("added-by-link") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(ANNA);
      expect(within(rowOf("sailing")).getByTestId("added-by").textContent).toBe("Added by Anna Berg");
      expect(within(rowOf("photography")).getByTestId("added-by").textContent).toBe("Added by you");
      expect(within(rowOf("photography")).queryByTestId("added-by-link")).toBeNull();
      await new Promise((r) => setTimeout(r, 60));
      expect(rig.calls).toEqual([[uriOf(hers)]]);
    } finally {
      rig.restore();
    }
  });

  it("not disclosed (null/null) and an older platform (404 on the route) show NOTHING: no 'unknown', no error text, no retry", async () => {
    seedInterest(ANNA, SAIL);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    for (const answer of [() => ({}), () => 404] as const) {
      __resetAddedByForTest();
      const rig = installSourceName(answer);
      try {
        const r = show();
        await waitFor(() => expect(rig.calls).toHaveLength(1));
        await new Promise((x) => setTimeout(x, 60));
        expect(screen.queryByTestId("added-by")).toBeNull();
        expect(screen.queryByText(/unknown|error|could not/i)).toBeNull();
        expect(rig.calls).toHaveLength(1);
        r.unmount();
      } finally {
        rig.restore();
      }
    }
    debug.mockRestore();
  });
});
