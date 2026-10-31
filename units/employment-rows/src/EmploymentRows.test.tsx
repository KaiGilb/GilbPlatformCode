// @vitest-environment jsdom
// Ported from GilbApp `EmploymentRows.c214e7.test.tsx` (12) and `EmploymentRows.b4.c214e7fix.test.tsx` (5): the Employment section driven as the real
// component end to end (card, state, store, edges) against an in-memory vault behind `fetch`; every write is proved by what the VAULT holds afterwards.
// Re-based: the vault is the fetch-level fake of `test/vault.ts` (keys are stored bare), the finder is a prop, no place catalogue.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within, screen } from "@testing-library/react";
import { __resetEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";
import { __resetEmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";
import { VAULT, factOf, factsOf, hooks, requests, seed, store, storedA, uriOf } from "../test/vault";
import { setUp, tearDown } from "../test/support";
import { answerMaster, finder, show } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => (await import("../test/master")).master);

beforeEach(() => {
  setUp();
  __resetEmploymentVocab();
  __resetEmploymentLinkVocab();
  answerMaster();
  finder.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  tearDown();
});

const seedPerson = (facts: Record<string, unknown> = {}) => seed("t:Person", { "a:givenName": "Bob", ...facts });
const employments = () => [...store.entries()].filter(([, e]) => e.type === "t:Employment");
const deletes = () => requests.filter((r) => r.method === "DELETE");

/** The record's next PATCH answers 500 once. */
function failNextRecordPatch(person: string) {
  hooks.onPatch = (id, nth) => (id === person && nth === 1 ? 500 : undefined);
  return () => {
    hooks.onPatch = null;
  };
}

describe("a person's Employment section, MyNet's way", () => {
  it("is titled with the master's label and offers the company search on an empty card", async () => {
    const p = seedPerson();
    const { q } = show(p);
    expect(q.getByRole("heading", { name: "Employment" })).toBeTruthy();
    await waitFor(() => expect(q.getByTestId("employment-section-default")).toBeTruthy());
    expect(q.getByRole("button", { name: /add employment/ })).toBeTruthy();
  });

  it("ADD: a company named on the empty card mints one t:Employment and links it from the RECORD", async () => {
    const p = seedPerson();
    const { q, onSaved } = show(p);
    fireEvent.click(await q.findByLabelText("Edit Employment Company"));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Acme" } });
    fireEvent.click(await q.findByTestId("company-use-typed"));
    await waitFor(() => expect(factOf(p, "employment")).toBeTruthy());
    const [[id, e]] = employments();
    expect(storedA(id!)).toMatchObject({ "a:org": "Acme" });
    expect(String(e!.facts["claimSlotKey"])).toMatch(/^empx-/);
    expect(storedA(id!)).not.toHaveProperty("a:visibilityTier");
    expect(factOf(p, "employment")).toEqual({ "@id": uriOf(id!) });
    expect(factOf(p, "givenName")).toBe("Bob");
    expect(onSaved).toHaveBeenCalled();
    await waitFor(() => expect(q.getByTestId("company-search-closed").textContent).toBe("Acme"));
  });

  it("ADD a second: 'add employment' then a title mints a second entity, appended to the edges in order", async () => {
    const first = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(first) } });
    const { q } = show(p);
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(1));
    fireEvent.click(q.getByRole("button", { name: /add employment/ }));
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(2));
    expect(employments()).toHaveLength(1); // nothing written for an empty employment (MyNet)
    const row2 = within(q.getAllByTestId("employment-row")[1]!);
    fireEvent.click(row2.getByLabelText("Edit Employment Job title"));
    const box = row2.getByLabelText("Edit Employment Job title");
    fireEvent.change(box, { target: { value: "Advisor" } });
    fireEvent.blur(box);
    await waitFor(() => expect(employments()).toHaveLength(2));
    const second = employments().find(([id]) => id !== first)!;
    expect(second[1].facts["jobTitle"]).toBe("Advisor");
    await waitFor(() => expect(factOf(p, "employment")).toEqual([{ "@id": uriOf(first) }, { "@id": uriOf(second[0]) }]));
  });

  it("Kai 2026-10-14: 'add employment' opens the new company search with the cursor in it", async () => {
    const first = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(first) } });
    const { q } = show(p);
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(1));
    fireEvent.click(q.getByRole("button", { name: /add employment/ }));
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(2));
    const row2 = within(q.getAllByTestId("employment-row")[1]!);
    const box = await row2.findByLabelText("Edit Employment Company");
    expect(document.activeElement).toBe(box);
    // control: the first employment's company is not opened
    const row1 = within(q.getAllByTestId("employment-row")[0]!);
    expect(row1.queryByRole("textbox", { name: "Edit Employment Company" })).toBeNull();
  });

  it("CHANGE: a title edit patches only that employment's entity; the record and the other employment are untouched", async () => {
    const a = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO", "a:claimSlotKey": "empx-a", "a:visibilityTier": "private" });
    const b = seed("t:Employment", { "a:org": "Beta", "a:jobTitle": "CTO" });
    const p = seedPerson({ "a:employment": [{ "@id": uriOf(a) }, { "@id": uriOf(b) }] });
    const recordBefore = JSON.stringify(factsOf(p));
    const bBefore = JSON.stringify(factsOf(b));
    const { q } = show(p);
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(2));
    const row1 = within(q.getAllByTestId("employment-row")[0]!);
    fireEvent.click(row1.getByRole("button", { name: "Edit Employment Job title" }));
    const box = row1.getByLabelText("Edit Employment Job title");
    fireEvent.change(box, { target: { value: "Chair" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(factOf(a, "jobTitle")).toBe("Chair"));
    // MyNet's merge patch: company + titles named; the handle and the stored rung are left as they were.
    expect(storedA(a)).toEqual({ "a:org": "Acme", "a:jobTitle": "Chair", "a:claimSlotKey": "empx-a", "a:visibilityTier": "private" });
    expect(JSON.stringify(factsOf(b))).toBe(bBefore);
    expect(JSON.stringify(factsOf(p))).toBe(recordBefore);
  });

  it("CHANGE the role: 'Present' writes ongoing, and the date line reads as MyNet's", async () => {
    const a = seed("t:Employment", { "a:org": "Acme", "a:startDate": "2019-03" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(a) } });
    const { q } = show(p);
    const present = await waitFor(() => q.getByLabelText("Role is current"));
    fireEvent.click(present);
    await waitFor(() => expect(factOf(a, "ongoing")).toBe(true));
    expect(storedA(a)).not.toHaveProperty("a:endDate");
    expect(q.getByTestId("experience-role").textContent).toMatch(/2019 – Present/);
  });

  it("REMOVE: the (−) drops that employment's edge from the record; the entity and the sibling stay", async () => {
    const a = seed("t:Employment", { "a:org": "Acme" });
    const b = seed("t:Employment", { "a:org": "Beta" });
    const p = seedPerson({ "a:employment": [{ "@id": uriOf(a) }, { "@id": uriOf(b) }] });
    const { q } = show(p);
    fireEvent.click(await waitFor(() => q.getByRole("button", { name: "Remove employment Acme" })));
    await waitFor(() => expect(factOf(p, "employment")).toEqual({ "@id": uriOf(b) }));
    expect(q.queryByRole("button", { name: "Remove employment Acme" })).toBeNull();
    expect(q.getByRole("button", { name: "Remove employment Beta" })).toBeTruthy();
    // MyNet: "The entities themselves are never destroyed."
    expect(store.has(a)).toBe(true);
    expect(deletes()).toEqual([]);
  });

  it("S8: the employment's and the title's remove controls are MyNet's (−), first in their rows", async () => {
    const a = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(a) } });
    const { q, container } = show(p);
    for (const name of ["Remove employment Acme", "Remove Job title"]) {
      const btn = await waitFor(() => q.getByRole("button", { name }));
      expect(btn.getAttribute("data-remove-control")).toBe("minus-circle");
      expect(btn.textContent).toBe("");
      expect(btn.querySelector("svg")).not.toBeNull();
      expect(btn.parentElement!.firstElementChild).toBe(btn);
    }
    expect(container.textContent ?? "").not.toMatch(/[×✕]/);
  });

  it("REMOVE a title: the entity loses only that title (null when none remain)", async () => {
    const a = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(a) } });
    const { q } = show(p);
    fireEvent.click(await waitFor(() => q.getByRole("button", { name: "Remove Job title" })));
    await waitFor(() => expect(storedA(a)).not.toHaveProperty("a:jobTitle"));
    expect(factOf(a, "org")).toBe("Acme");
  });

  it("an edge that does not read is SAID and kept: removing another employment carries it", async () => {
    const a = seed("t:Employment", { "a:org": "Acme" });
    const p = seedPerson({ "a:employment": [{ "@id": uriOf("06gkunreadable") }, { "@id": uriOf(a) }] });
    const { q } = show(p);
    await waitFor(() => expect(q.getByTestId("employment-unresolved")).toBeTruthy());
    fireEvent.click(q.getByRole("button", { name: "Remove employment Acme" }));
    await waitFor(() => expect(factOf(p, "employment")).toEqual({ "@id": uriOf("06gkunreadable") }));
  });

  it("the card's re-read after a write (the record as stored now) neither duplicates nor drops a row", async () => {
    const a = seed("t:Employment", { "a:org": "Acme" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(a) } });
    const { q, reread } = show(p);
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(1));
    fireEvent.click(q.getByRole("button", { name: /add employment/ }));
    const row2 = within(q.getAllByTestId("employment-row")[1]!);
    fireEvent.click(row2.getByLabelText("Edit Employment Company"));
    fireEvent.change(row2.getByLabelText("Edit Employment Company"), { target: { value: "Beta" } });
    fireEvent.click(await row2.findByTestId("company-use-typed"));
    await waitFor(() => expect(Array.isArray(factOf(p, "employment"))).toBe(true));
    reread();
    await waitFor(() => expect(q.getAllByTestId("company-search-closed").map((b) => b.textContent)).toEqual(["Acme", "Beta"]));
  });

  it("READ-ONLY (the record may not be written): employments shown, no add, no remove, no editing", async () => {
    const a = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO", "a:startDate": "2019-03", "a:endDate": "2021-06" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(a) } });
    const { q } = show(p, { canEdit: false });
    await waitFor(() => expect(q.getByTestId("company-search-closed").textContent).toBe("Acme"));
    expect((q.getByTestId("company-search-closed") as HTMLButtonElement).disabled).toBe(true);
    expect(q.getByRole("button", { name: "Edit Employment Job title" }).textContent).toBe("CEO");
    expect((q.getByRole("button", { name: "Edit Employment Job title" }) as HTMLButtonElement).disabled).toBe(true);
    expect(q.getByTestId("experience-role").textContent).toMatch(/2019 – .*2021/);
    expect(q.queryByRole("button", { name: /add employment/ })).toBeNull();
    expect(q.queryByRole("button", { name: /Remove employment/ })).toBeNull();
    expect(q.queryByLabelText("Role start")).toBeNull();
    expect(screen.queryByTestId("employment-section-default")).toBeNull();
  });
});

describe("it7 fix: a failed write is never reported as saved, and nothing disappears silently", () => {
  it("B4: the mint lands, the record's first link write answers 500; retry LINKS it, and a later edit keeps it linked", async () => {
    const p = seedPerson();
    const restore = failNextRecordPatch(p);
    try {
      const { q } = show(p);
      fireEvent.click(await q.findByLabelText("Edit Employment Company"));
      fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Delta" } });
      fireEvent.click(await q.findByTestId("company-use-typed"));
      // The entity was minted, the link was not: the row says so.
      await waitFor(() => expect(employments()).toHaveLength(1));
      const retry = await q.findByRole("button", { name: "Not saved — retry" });
      expect(factOf(p, "employment")).toBeUndefined();
      fireEvent.click(retry);
      const [[id]] = employments();
      await waitFor(() => expect(factOf(p, "employment")).toEqual({ "@id": uriOf(id!) }));
      await waitFor(() => expect(q.queryByRole("button", { name: "Not saved — retry" })).toBeNull());
      // A later title edit: the entity is patched, the link stays (written once, not duplicated).
      const box = q.getAllByLabelText("Edit Employment Job title")[0]!;
      fireEvent.click(box);
      fireEvent.change(q.getAllByLabelText("Edit Employment Job title")[0]!, { target: { value: "Partner" } });
      fireEvent.blur(q.getAllByLabelText("Edit Employment Job title")[0]!);
      await waitFor(() => expect(factOf(id!, "jobTitle")).toBe("Partner"));
      expect(factOf(p, "employment")).toEqual({ "@id": uriOf(id!) });
      expect(employments()).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it("B4: an edit of an already linked employment writes no link (the record is not patched)", async () => {
    const a = seed("t:Employment", { "a:org": "Acme", "a:jobTitle": "CEO" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(a) } });
    const { q } = show(p);
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(1));
    fireEvent.click(q.getByLabelText("Edit Employment Job title"));
    fireEvent.change(q.getByLabelText("Edit Employment Job title"), { target: { value: "Chair" } });
    fireEvent.blur(q.getByLabelText("Edit Employment Job title"));
    await waitFor(() => expect(factOf(a, "jobTitle")).toBe("Chair"));
    expect(requests.filter((r) => r.method === "PATCH" && r.path === `/lws/r/${p}`)).toHaveLength(0);
  });

  it("F22: a remove whose write fails brings the row back with 'not saved · retry'; retry removes it", async () => {
    const a = seed("t:Employment", { "a:org": "Acme" });
    const p = seedPerson({ "a:employment": { "@id": uriOf(a) } });
    const restore = failNextRecordPatch(p);
    try {
      const { q } = show(p);
      fireEvent.click(await waitFor(() => q.getByRole("button", { name: "Remove employment Acme" })));
      const retry = await q.findByRole("button", { name: "Not saved — retry" });
      expect(q.getAllByTestId("employment-row")).toHaveLength(1);
      expect(factOf(p, "employment")).toEqual({ "@id": uriOf(a) });
      fireEvent.click(retry);
      await waitFor(() => expect(factsOf(p)).not.toHaveProperty("employment"));
      await waitFor(() => expect(q.queryAllByTestId("employment-row")).toHaveLength(0));
      expect(store.has(a)).toBe(true); // the entity is never destroyed (MyNet)
    } finally {
      restore();
    }
  });

  it("F23: a plain-text value under the term is shown as legacy text, not as an unread link, and is carried", async () => {
    const a = seed("t:Employment", { "a:org": "Acme" });
    const p = seedPerson({ "a:employment": ["Old Firm AS", { "@id": uriOf(a) }] });
    const { q } = show(p);
    await waitFor(() => expect(q.getByTestId("employment-legacy-text").textContent).toBe("Old Firm AS"));
    expect(q.queryByTestId("employment-unresolved")).toBeNull();
    fireEvent.click(q.getByRole("button", { name: "Remove employment Acme" }));
    await waitFor(() => expect(factOf(p, "employment")).toEqual("Old Firm AS"));
  });

  it("F23: before the record's own document arrives (a grid placeholder), nothing is read as an edge", async () => {
    const p = seedPerson();
    const { q } = show(p, { servedEdges: `${VAULT}/e/u1, ${VAULT}/e/u2`, servedReady: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(q.queryByTestId("employment-unresolved")).toBeNull();
    expect(q.queryAllByTestId("employment-row")).toHaveLength(0);
  });
});
