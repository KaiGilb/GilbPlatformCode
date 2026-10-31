// @vitest-environment jsdom
// Ported from the source's `SkillRows.c214.test.tsx` (19 cases). Re-based: the source drove the store through module mocks of the app's record client; here the real peers
// (`contact-rows`, `held-notes`, `record-sidecar-save`, `added-by`, `skill-picker-sheet`, `lws-records`) run over a fake platform at the level of `fetch`
// (test/fakePlaceStore.ts), with the host of `contact-rows` made of the real units (test/contactRowsHost.tsx). The cases are otherwise the source's; the typed list
// (`listVaultRecordsPage`) of the source's store is not used by anything here and its two lines are dropped.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetAddedByForTest } from "@kaigilb/gilbplatformcode-added-by";
import { __resetHeldNoteChains, __resetHeldNoteVocab } from "@kaigilb/gilbplatformcode-held-notes";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { installSourceName } from "../test/addedByTestkit";
import { mount } from "../test/contactRowsHost";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
// The stater: the ADDER's own card, in their own vault. It answers a card seeded here, or refuses as a person whose own card cannot be made.
const stater = vi.hoisted(() => ({ uri: "" as string, fail: false }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => {
    if (stater.fail) throw new Error("Your own card could not be made, so what you add would have no source. Nothing was saved.");
    return stater.uri;
  }),
);

// eslint-disable-next-line import/first
import { SkillRows } from "./index";

const { VAULT, store } = fake;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const SELL = "https://veda.platform.example.test/base/t/SellProducts";
const AGENT = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");
const META = {
  skill: { type: "skill", label: "nursing", order: 7, access: "private", valueIndex: 0 },
  skill2: { type: "skill", label: "sell products", order: 8, access: "private", valueIndex: 1 },
};

let tom: string;
let ann: string;
let BY: Record<string, unknown>;
beforeEach(() => {
  setUp();
  setTermOrigin("https://veda.platform.example.test");
  fake.resetStore();
  __resetHeldNoteVocab();
  __resetHeldNoteChains();
  tom = fake.seed("t:Person", { "a:givenName": "Tom", "a:skill": [{ "@id": NURSING }, { "@id": SELL }], "a:fieldMeta": META });
  ann = fake.seed("t:Person", { "a:givenName": "Ann", "a:skill": [{ "@id": NURSING }] });
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  stater.fail = false;
  BY = { "a:statedBy": { "@id": stater.uri } };
});
afterEach(() => {
  cleanup();
  tearDown();
  resetTermOrigin();
});

type Props = ComponentProps<typeof SkillRows>;
let seq = 0;
function show(over: Partial<Props> = {}) {
  const facts = store.get(tom)!.facts;
  const props: Props = {
    vaultId: VAULT,
    principal: AGENT,
    recordId: tom,
    recordEntityUri: uriOf(tom),
    title: "Skill",
    valueKey: "skill",
    metaKey: "fieldMeta",
    served: { values: facts["a:skill"], meta: facts["a:fieldMeta"] },
    // A fresh version per render: the per-record save state (`record-sidecar-save`) is module-wide.
    etag: `"e${++seq}"`,
    canEdit: true,
    onSaved: vi.fn(),
    ...over,
  };
  const view = mount(<SkillRows {...props} />);
  return { ...view, props };
}

const rowOf = (name: string) => screen.getAllByTestId("skill-row").find((r) => within(r).getByTestId("skill-row-value").textContent?.includes(name))!;

async function typeNote(row: HTMLElement, name: string, text: string) {
  fireEvent.click(await within(row).findByRole("button", { name: `Edit note for ${name}` }));
  const box = within(row).getByRole("textbox", { name: `About ${name}` });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
}

describe("SkillRows — MyNet's 'About this skill' under each picked skill", () => {
  it("each picked skill offers MyNet's note: 'About this skill', 'Add a note about this skill'", async () => {
    show();
    const row = rowOf("nursing");
    const note = await within(row).findByTestId("skill-depth-note");
    expect(note.textContent).toContain("About this skill");
    expect(note.textContent).toContain("Add a note about this skill");
    expect(within(rowOf("sell products")).getByTestId("skill-depth-note")).toBeTruthy();
  });

  it("a typed note is saved, on leaving the box, as a held claim about THIS person and THIS skill; the card's values are not written", async () => {
    show();
    const row = rowOf("nursing");
    await typeNote(row, "nursing", "ICU night shifts, 8 years");
    await waitFor(() => expect(claims()).toHaveLength(1));
    expect(claims()[0]![1].facts).toEqual({
      "a:heldParty": { "@id": uriOf(tom) },
      "a:skill": { "@id": NURSING },
      "a:skillDepthNote": "ICU night shifts, 8 years",
      "a:statedBy": { "@id": stater.uri },
      "a:directReader": AGENT,
    });
    // The record's own skills and sidecar are not written by a note.
    expect(fake.patchRecord).not.toHaveBeenCalled();
    await waitFor(() => expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("ICU night shifts, 8 years"));
    expect(within(row).queryByTestId("skill-depth-note-error")).toBeNull();
  });

  it("a stored note is shown under its skill; another person's note on the same skill is ⛔ not", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "Sells B2B software" });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "Ann's paediatrics" });
    show();
    await waitFor(() => expect(within(rowOf("sell products")).getByTestId("skill-depth-note-text").textContent).toBe("Sells B2B software"));
    expect(within(rowOf("nursing")).getByTestId("skill-depth-note-text").textContent).toBe("Add a note about this skill");
    expect(screen.queryByText("Ann's paediatrics")).toBeNull();
  });

  it("changing a stored note amends its claim; emptying it retracts the note and keeps the claim", async () => {
    const id = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "old" });
    show();
    const row = rowOf("nursing");
    await waitFor(() => expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("old"));
    await typeNote(row, "nursing", "new");
    await waitFor(() => expect(store.get(id)!.facts["a:skillDepthNote"]).toBe("new"));
    expect(claims()).toHaveLength(1);
    await waitFor(() => expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("new"));
    await typeNote(row, "nursing", "");
    await waitFor(() => expect("a:skillDepthNote" in store.get(id)!.facts).toBe(false));
    expect(claims()).toHaveLength(1);
    await waitFor(() => expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("Add a note about this skill"));
  });

  it("Escape leaves the note as it was and writes nothing", async () => {
    show();
    const row = rowOf("nursing");
    fireEvent.click(await within(row).findByRole("button", { name: "Edit note for nursing" }));
    const box = within(row).getByRole("textbox", { name: "About nursing" });
    fireEvent.change(box, { target: { value: "draft" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(fake.createRecord).not.toHaveBeenCalled();
  });

  it("a store that answers but does not keep the note: 'not saved' is said and the typed note stays on screen", async () => {
    fake.createRecord.mockImplementationOnce(async () => ({ id: "06gkdropped", etag: '"x"' }));
    show();
    const row = rowOf("nursing");
    await typeNote(row, "nursing", "kept on screen");
    await waitFor(() => expect(within(row).getByTestId("skill-depth-note-error").textContent).toContain("did not keep it, so it is not saved"));
    expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("kept on screen");
    expect(claims()).toHaveLength(0);
  });

  it("removing a skill removes its note claim about this person; Ann's note and Tom's other skill's note stay", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "t-n" });
    const keepSell = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "t-s" });
    const keepAnn = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "a-n" });
    show();
    await waitFor(() => expect(within(rowOf("nursing")).getByTestId("skill-depth-note-text").textContent).toBe("t-n"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Skill nursing" }));
    await waitFor(() => expect(claims().map(([id]) => id).sort()).toEqual([keepSell, keepAnn].sort()));
    // The card stored the removal first: the record now holds only the other skill.
    expect(store.get(tom)!.facts["a:skill"]).toEqual([{ "@id": SELL }]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("read-only: a stored note is shown as text, with no edit; a skill with no note shows no note block", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "Sells B2B software" });
    show({ canEdit: false });
    await waitFor(() => expect(within(rowOf("sell products")).getByTestId("skill-depth-note-text").textContent).toBe("Sells B2B software"));
    expect(within(rowOf("sell products")).queryByRole("button", { name: /Edit note/ })).toBeNull();
    expect(within(rowOf("nursing")).queryByTestId("skill-depth-note")).toBeNull();
  });

  it("a failed read is said, ⛔ never shown as 'no note' (no note is offered)", async () => {
    fake.findByAttribute.mockRejectedValueOnce(new Error("503"));
    show();
    expect((await screen.findByTestId("skill-notes-read-error")).textContent).toContain("Could not read the skill notes");
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
  });

  it("a note another adder (or an old vault card) wrote about this person is SHOWN, read-only, ⛔ not changed, ⛔ not deleted with the skill", async () => {
    const theirs = fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": uriOf(ann) }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "imported" });
    show();
    await waitFor(() => expect(within(rowOf("nursing")).getByTestId("skill-depth-note-text").textContent).toBe("imported"));
    // No edit control for the viewer: the claim is not theirs.
    expect(within(rowOf("nursing")).queryByRole("button", { name: "Edit note for nursing" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Skill nursing" }));
    await waitFor(() => expect(store.get(tom)!.facts["a:skill"]).toEqual([{ "@id": SELL }]));
    await new Promise((r) => setTimeout(r, 50));
    expect(store.get(theirs)!.facts["a:skillDepthNote"]).toBe("imported");
  });

  it("a note the VIEWER stated is editable, beside another adder's note on another skill", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": uriOf(ann) }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "theirs" });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "mine" });
    show();
    await waitFor(() => expect(within(rowOf("nursing")).getByTestId("skill-depth-note-text").textContent).toBe("mine"));
    expect(await within(rowOf("nursing")).findByRole("button", { name: "Edit note for nursing" })).toBeTruthy();
    expect(within(rowOf("sell products")).getByTestId("skill-depth-note-text").textContent).toBe("theirs");
    expect(within(rowOf("sell products")).queryByRole("button", { name: "Edit note for sell products" })).toBeNull();
  });

  it("a person whose own card cannot be made: the notes are still read, a typed note is refused with the reason, and nothing is written", async () => {
    stater.fail = true;
    show();
    const row = rowOf("nursing");
    await typeNote(row, "nursing", "ICU");
    expect((await within(row).findByText(/Your own card could not be made/)).textContent).toContain("Nothing was saved");
    expect(fake.createRecord).not.toHaveBeenCalled();
  });

  it("a free-text skill another app wrote gets no note (MyNet: catalogue skills only)", async () => {
    show({ served: { values: ["juggling"], meta: { skill: { type: "skill", label: "", order: 7, access: "private", valueIndex: 0 } } } });
    await waitFor(() => expect(screen.getAllByTestId("skill-row")).toHaveLength(1));
    expect(screen.queryByTestId("skill-depth-note")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Agent.Scaling Delta7 B1 (P3, P11) and B2 (P2), at N = 100 notes about other people in the vault, with
// every store request taking 1 ms (MOCK latency), as Scaling's probe measured them.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Delta7: overlapping acts on one note, at N = 100", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function slowStore() {
    const read = fake.readRecord.getMockImplementation()!;
    fake.readRecord.mockImplementation(async (...a: Parameters<typeof read>) => (await sleep(1), read(...a)));
    const find = fake.findByAttribute.getMockImplementation()!;
    fake.findByAttribute.mockImplementation(async (...a: Parameters<typeof find>) => (await sleep(1), find(...a)));
  }
  function crowd(n: number) {
    for (let i = 0; i < n; i++) {
      const other = fake.seed("t:Person", { "a:givenName": `P${i}` });
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(other) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": `n${i}` });
    }
  }
  const tomsNursing = () =>
    claims().filter(([, c]) => JSON.stringify(c.facts["a:heldParty"]) === JSON.stringify({ "@id": uriOf(tom) }) && JSON.stringify(c.facts["a:skill"]) === JSON.stringify({ "@id": NURSING }));

  it("P3: two saves of one note in flight together make ONE claim, holding the LAST text, and the card shows it", async () => {
    crowd(100);
    slowStore();
    show();
    const row = rowOf("nursing");
    await typeNote(row, "nursing", "Ward nurse");
    await sleep(3);
    await typeNote(row, "nursing", "Ward nurse, ICU");
    await waitFor(() => expect(within(row).queryByText("Saving…")).toBeNull(), { timeout: 5000 });
    await sleep(20);
    expect(tomsNursing()).toHaveLength(1);
    expect(tomsNursing()[0]![1].facts["a:skillDepthNote"]).toBe("Ward nurse, ICU");
    expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("Ward nurse, ICU");
    expect(within(row).queryByTestId("skill-depth-note-error")).toBeNull();
  });

  it("P11: removing the skill while its note is saving leaves NO note stored (the removal waits for the save)", async () => {
    crowd(100);
    slowStore();
    show();
    const row = rowOf("nursing");
    await typeNote(row, "nursing", "Ward nurse");
    await sleep(3);
    fireEvent.click(screen.getByRole("button", { name: "Remove Skill nursing" }));
    await waitFor(() => expect(store.get(tom)!.facts["a:skill"]).toEqual([{ "@id": SELL }]), { timeout: 5000 });
    await waitFor(() => expect(tomsNursing()).toHaveLength(0), { timeout: 5000 });
    await sleep(50);
    expect(tomsNursing()).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("P2: a first note at N = 100 costs 2 finds + 0 reads to plan, 1 write, 1 read back (Delta7 measured 11 lists + 201 reads + 1 write at 9f0de6a)", async () => {
    crowd(100);
    show();
    const row = rowOf("nursing");
    await within(row).findByRole("button", { name: "Edit note for nursing" });
    await waitFor(() => expect(fake.findByAttribute).toHaveBeenCalled());
    await sleep(10);
    fake.findByAttribute.mockClear();
    fake.readRecord.mockClear();
    fake.createRecord.mockClear();
    await typeNote(row, "nursing", "Ward nurse");
    await waitFor(() => expect(tomsNursing()).toHaveLength(1));
    await waitFor(() => expect(within(row).getByTestId("skill-depth-note-text").textContent).toBe("Ward nurse"));
    await sleep(10);
    expect(fake.requestCount()).toEqual({ find: 2, read: 1, list: 0, write: 1 });
  });
});

describe("SB1b-1 SkillRows — the 'who sees this' switch on a skill note the viewer added", () => {
  const seedNote = (statedBy: string, skill: string, extra: Record<string, unknown> = {}) =>
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": statedBy }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": skill }, "a:skillDepthNote": "n", ...extra });

  it("the viewer's note offers 'Make private to me only'; it goes private in one PATCH, shows 'Only you see this', and goes back with 'Everyone in this vault'; another adder's note has no switch", async () => {
    const mine = seedNote(stater.uri, NURSING);
    seedNote("https://other.gilb.com/base/e/vsc-other", SELL);
    show();
    await waitFor(() => expect(within(rowOf("nursing")).getByTestId("skill-depth-note-text").textContent).toBe("n"));
    await waitFor(() => expect(within(rowOf("nursing")).queryByRole("button", { name: /private to me only/ })).not.toBeNull());
    expect(within(rowOf("sell products")).queryByTestId("held-visibility")).toBeNull();
    fireEvent.click(within(rowOf("nursing")).getByRole("button", { name: /private to me only/ }));
    await waitFor(() => expect(store.get(mine)!.facts["a:visibilityTier"]).toBe("private"));
    expect(fake.patchRecord.mock.calls.filter((c) => c[0] === mine)).toHaveLength(1);
    expect((await within(rowOf("nursing")).findByTestId("held-private-label")).textContent).toBe("Only you see this");
    fireEvent.click(within(rowOf("nursing")).getByRole("button", { name: /to everyone in this vault/ }));
    await waitFor(() => expect("a:visibilityTier" in store.get(mine)!.facts).toBe(false));
    await waitFor(() => expect(within(rowOf("nursing")).queryByTestId("held-private-label")).toBeNull());
  });
});

describe("SB1b-2 SkillRows — 'Added by <name>' on a skill note", () => {
  const ANNA = "https://anna.gilb.com/base/e/vsc-anna";
  const seedNote = (statedBy: string, skill: string) =>
    fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": statedBy }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": skill }, "a:skillDepthNote": "n" });
  beforeEach(() => __resetAddedByForTest());

  it("another adder's note shows 'Added by Anna Berg' (a link to her card); the viewer's own shows 'Added by you', no link; one request, for hers only", async () => {
    seedNote(stater.uri, NURSING);
    const hers = seedNote(ANNA, SELL);
    const rig = installSourceName((items) => ({ [items[0]!]: { statedBy: ANNA, name: "Anna Berg" } }));
    try {
      show();
      await waitFor(() => expect(within(rowOf("sell products")).getByTestId("added-by").textContent).toBe("Added by Anna Berg"));
      expect(within(rowOf("sell products")).getByTestId("added-by-link").getAttribute("href")).toBe(ANNA);
      expect(within(rowOf("nursing")).getByTestId("added-by").textContent).toBe("Added by you");
      expect(within(rowOf("nursing")).queryByTestId("added-by-link")).toBeNull();
      await new Promise((r) => setTimeout(r, 60));
      expect(rig.calls).toEqual([[uriOf(hers)]]);
    } finally {
      rig.restore();
    }
  });

  it("not disclosed (null/null) and an older platform (404 on the route) show nothing for the note", async () => {
    seedNote(ANNA, SELL);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    for (const answer of [() => ({}), () => 404] as const) {
      __resetAddedByForTest();
      const rig = installSourceName(answer);
      try {
        const r = show();
        await waitFor(() => expect(within(rowOf("sell products")).getByTestId("skill-depth-note-text").textContent).toBe("n"));
        await waitFor(() => expect(rig.calls).toHaveLength(1));
        await new Promise((x) => setTimeout(x, 60));
        expect(screen.queryByTestId("added-by")).toBeNull();
        expect(screen.queryByText(/unknown|error|could not/i)).toBeNull();
        r.unmount();
      } finally {
        rig.restore();
      }
    }
    debug.mockRestore();
  });
});
