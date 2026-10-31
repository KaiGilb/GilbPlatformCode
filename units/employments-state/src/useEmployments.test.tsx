// @vitest-environment jsdom
// New. The state of a person's employments, driven as a hook against an in-memory vault (the real peers over `fetch`): what it reads, what it
// writes and when, read off the wire. The ported GilbApp cases of this section drive the whole card and belong to the unit that draws it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { __resetEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";
import { __resetEmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";
import { EMPLOYMENT_READ_FAILED_TEXT } from "./index";
import { VAULT, factOf, factsOf, flight, hooks, patchesTo, requests, seed, store, storedA, uriOf, wireNulls, writes } from "../test/vault";
import { GEO, OSLO } from "../test/vocab";
import { setUp, tearDown } from "../test/support";
import { act, answerMaster, loaded, master, mountEditor, settled, waitFor } from "../test/mount";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => (await import("../test/master")).master);

beforeEach(() => {
  setUp();
  __resetEmploymentVocab();
  __resetEmploymentLinkVocab();
  answerMaster();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  tearDown();
});

const employment = (facts: Record<string, unknown>) => seed("t:Employment", facts);
const person = (...ids: string[]) => seed("t:Person", { givenName: "Bob", ...(ids.length ? { employment: ids.length === 1 ? { "@id": uriOf(ids[0]!) } : ids.map((i) => ({ "@id": uriOf(i) })) } : {}) });
const employmentsOf = () => [...store.entries()].filter(([, e]) => e.type === "t:Employment");
const ORG = `${VAULT}/e/org1`;

describe("what it reads", () => {
  it("each edge's entity, in the record's order, with titles, role and employer", async () => {
    const a = employment({ org: "Beta", jobTitle: ["CTO", "Founder"], claimSlotKey: "empx-b" });
    const b = employment({ org: "Acme", jobTitle: "CEO", startDate: "2019-03", ongoing: true, workLocation: { "@id": OSLO }, employer: { "@id": ORG } });
    const p = person(b, a);
    const m = mountEditor(p);
    const ed = await loaded(m);
    expect(ed.employments.map((e) => e.company)).toEqual(["Acme", "Beta"]);
    expect(ed.employments[0]!.titles.map((t) => t.value)).toEqual(["CEO"]);
    expect(ed.employments[1]!.titles.map((t) => t.value)).toEqual(["CTO", "Founder"]);
    expect(ed.employments[0]!.role).toMatchObject({ start: "2019-03", current: true, placeId: OSLO, placeLabel: "" });
    expect(ed.employments[0]!.employer).toBe(ORG);
    expect(ed.unresolved).toEqual([]);
    expect(ed.error).toBeNull();
  });
  it("an edge that does not read is unresolved and the others show", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a, "06gkgone");
    const ed = await loaded(mountEditor(p));
    expect(ed.employments.map((e) => e.company)).toEqual(["Acme"]);
    expect(ed.unresolved).toEqual([uriOf("06gkgone")]);
  });
  it("a plain text under the term is legacy text, not an edge", async () => {
    const p = seed("t:Person", { givenName: "Bob", employment: ["Acme (legacy text)"] });
    const ed = await loaded(mountEditor(p));
    expect(ed.legacyText).toEqual(["Acme (legacy text)"]);
    expect(ed.employments).toEqual([]);
    expect(requests.some((r) => r.path.startsWith("/lws/r/") && r.path !== `/lws/r/${p}`)).toBe(false);
  });
  it("a compact place reads as an address with the catalogue origin, and as none without it", async () => {
    const a = employment({ org: "Acme", startDate: "2019-03", workLocation: "base:e/osm-r-2775550" });
    const p = person(a);
    expect((await loaded(mountEditor(p, { catalogueOrigin: GEO }))).employments[0]!.role!.placeId).toBe(OSLO);
    cleanup();
    expect((await loaded(mountEditor(p))).employments[0]!.role!.placeId).toBe("");
  });
  it("a record served as a placeholder (servedReady false) reads nothing", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a);
    const m = mountEditor(p, { servedReady: false });
    await new Promise((r) => setTimeout(r, 30));
    expect(requests.filter((r) => r.path === `/lws/r/${a}`)).toHaveLength(0);
    expect(m.editor().employments).toEqual([]);
  });
  it("with no vault nothing is read and nothing is written", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a);
    const m = mountEditor(p, { vaultId: null });
    await waitFor(() => expect(m.editor().loading).toBe(false));
    expect(requests).toHaveLength(0);
  });
  it("a read that fails says one fixed sentence, with no term and no address in it", async () => {
    master.typeSpelling.mockImplementation(async () => null);
    const a = employment({ org: "Acme" });
    const p = person(a);
    const m = mountEditor(p);
    await waitFor(() => expect(m.editor().error).not.toBeNull());
    expect(m.editor().error).toBe(EMPLOYMENT_READ_FAILED_TEXT);
    expect(m.editor().error).not.toMatch(/:\/\/|a\/|t\//);
    expect(writes()).toHaveLength(0);
  });
});

describe("mount, render and idle make zero writes", () => {
  it.each([
    ["no employment", () => person()],
    ["one", () => person(employment({ org: "Acme", jobTitle: "CEO" }))],
    ["two, one with a role and a place", () => person(employment({ org: "Acme" }), employment({ org: "Beta", startDate: "2019-03", workLocation: { "@id": OSLO } }))],
    ["one that does not read", () => person(employment({ org: "Acme" }), "06gkgone")],
    ["a legacy text", () => seed("t:Person", { givenName: "Bob", employment: ["text"] })],
  ])("%s", async (_n, make) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const p = make();
      const m = mountEditor(p);
      await loaded(m);
      for (let i = 0; i < 4; i++) m.rerender({ servedEdges: factOf(p, "employment") });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(writes()).toHaveLength(0);
      expect(m.onSaved).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("an unlinked entity in the vault is not linked by loading", async () => {
    const lonely = employment({ org: "Lonely" });
    const p = person(employment({ org: "Acme" }));
    await loaded(mountEditor(p));
    expect(factOf(p, "employment")).not.toContainEqual({ "@id": uriOf(lonely) });
    expect(writes()).toHaveLength(0);
  });
  it("add employment with nothing typed, and add job title, write nothing", async () => {
    const p = person(employment({ org: "Acme", jobTitle: "CEO" }));
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().addEmployment();
    });
    act(() => {
      m.editor().addJobTitle(ed.employments[0]!.key);
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(m.editor().employments).toHaveLength(2);
    expect(writes()).toHaveLength(0);
  });
  it("a served change from outside is adopted, and a re-read after its own write is not news", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a);
    const m = mountEditor(p);
    await loaded(m);
    const b = employment({ org: "Beta" });
    store.get(p)!.facts.employment = [{ "@id": uriOf(a) }, { "@id": uriOf(b) }];
    m.reread();
    await waitFor(() => expect(m.editor().employments.map((e) => e.company)).toEqual(["Acme", "Beta"]));
    expect(writes()).toHaveLength(0);
  });
});

describe("a re-read after its own write", () => {
  it("is not news: no entity is read again and the rows stay", async () => {
    const p = person();
    const m = mountEditor(p);
    await loaded(m);
    act(() => {
      m.editor().addEmployment({ company: "Acme" });
    });
    await settled(m);
    const id = employmentsOf()[0]![0];
    const readsBefore = requests.filter((r) => r.method === "GET" && r.path === `/lws/r/${id}`).length;
    m.reread();
    await new Promise((r) => setTimeout(r, 40));
    expect(requests.filter((r) => r.method === "GET" && r.path === `/lws/r/${id}`).length).toBe(readsBefore);
    expect(m.editor().employments.map((e) => e.company)).toEqual(["Acme"]);
  });
});

describe("add, edit and remove", () => {
  it("a company picked on the empty card mints one t:Employment and links it from the record", async () => {
    const p = person();
    const m = mountEditor(p);
    await loaded(m);
    act(() => {
      m.editor().addEmployment({ company: "Acme" });
    });
    await settled(m);
    const es = employmentsOf();
    expect(es).toHaveLength(1);
    expect(storedA(es[0]![0])).toMatchObject({ "a:org": "Acme" });
    expect(factOf(p, "employment")).toEqual({ "@id": uriOf(es[0]![0]) });
    expect(m.onSaved).toHaveBeenCalled();
    expect(wireNulls()).toEqual([]);
  });
  it("a title typed on a new row mints it once, with a blank company; the next title edit patches that entity", async () => {
    const p = person();
    const m = mountEditor(p);
    await loaded(m);
    let key = "";
    act(() => {
      key = m.editor().addEmployment();
    });
    act(() => {
      m.editor().editJobTitle(key, "t0", "CEO");
    });
    await settled(m);
    expect(employmentsOf()).toHaveLength(1);
    const id = employmentsOf()[0]![0];
    expect(storedA(id)["a:jobTitle"]).toBe("CEO");
    act(() => {
      m.editor().addJobTitle(key);
    });
    act(() => {
      m.editor().editJobTitle(key, "t1", "Founder");
    });
    await settled(m);
    expect(employmentsOf()).toHaveLength(1);
    expect(storedA(id)["a:jobTitle"]).toEqual(["CEO", "Founder"]);
  });
  it("picking an organization record writes the name and both links on one employment", async () => {
    const org = seed("t:Organization", { name: "Butikk AS" });
    const p = person();
    const m = mountEditor(p);
    await loaded(m);
    act(() => {
      m.editor().addEmployment({ company: "Butikk AS", employer: { uri: uriOf(org) } });
    });
    await settled(m);
    const [[id]] = employmentsOf() as [[string, unknown]];
    expect(storedA(id)).toMatchObject({ "a:org": "Butikk AS", "a:employer": { "@id": uriOf(org) }, "a:employee": { "@id": uriOf(p) } });
  });
  it("retyping the company as plain text nulls exactly the two links", async () => {
    const org = seed("t:Organization", { name: "Butikk AS" });
    const e = employment({ org: "Butikk AS", employer: { "@id": uriOf(org) }, employee: { "@id": "https://x.example.test/base/e/p" } });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().editEmploymentCompany(ed.employments[0]!.key, "Gamma");
    });
    await settled(m);
    expect(patchesTo(e)).toEqual([{ "a:org": "Gamma", "a:employer": null, "a:employee": null }]);
    expect(wireNulls()).toEqual(["a:employee", "a:employer"]);
  });
  it("a company edit on an employment that has no title names no title key (NN1)", async () => {
    const e = employment({ org: "Acme" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().editEmploymentCompany(ed.employments[0]!.key, "Acme AS");
    });
    await settled(m);
    expect(patchesTo(e)).toEqual([{ "a:org": "Acme AS" }]);
  });
  it("a title another writer left in a form this reader cannot read survives a company edit (NN1)", async () => {
    const e = employment({ org: "Acme", jobTitle: { "@id": "https://x.example.test/base/e/role1" } });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().editEmploymentCompany(ed.employments[0]!.key, "Acme AS");
    });
    await settled(m);
    expect(storedA(e)["a:jobTitle"]).toEqual({ "@id": "https://x.example.test/base/e/role1" });
    expect(wireNulls()).toEqual([]);
  });
  it("removing the last stored title is the one null, a:jobTitle (NN1)", async () => {
    const e = employment({ org: "Acme", jobTitle: "CEO" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().deleteJobTitle(ed.employments[0]!.key, "t0");
    });
    await settled(m);
    expect(patchesTo(e)).toEqual([{ "a:org": "Acme", "a:jobTitle": null }]);
    expect(factsOf(e)).not.toHaveProperty("jobTitle");
  });
  it("a title removed from two leaves the other as a scalar and nulls nothing", async () => {
    const e = employment({ org: "Acme", jobTitle: ["CEO", "Founder"] });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().deleteJobTitle(ed.employments[0]!.key, "t0");
    });
    await settled(m);
    expect(storedA(e)["a:jobTitle"]).toBe("Founder");
    expect(wireNulls()).toEqual([]);
  });
  it("a title added in this session and then removed is a null: the row remembers what its own write stored", async () => {
    const e = employment({ org: "Acme" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    const key = ed.employments[0]!.key;
    act(() => {
      m.editor().editJobTitle(key, "t0", "CEO");
    });
    await settled(m);
    expect(patchesTo(e)).toEqual([{ "a:org": "Acme", "a:jobTitle": "CEO" }]);
    act(() => {
      m.editor().deleteJobTitle(key, "t0");
    });
    await settled(m);
    expect(patchesTo(e)[1]).toEqual({ "a:org": "Acme", "a:jobTitle": null });
    expect(wireNulls()).toEqual(["a:jobTitle"]);
  });
  it("a blank title that was never stored writes nothing when removed", async () => {
    const e = employment({ org: "Acme", jobTitle: "CEO" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().addJobTitle(ed.employments[0]!.key);
    });
    act(() => {
      m.editor().deleteJobTitle(ed.employments[0]!.key, "t1");
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(writes()).toHaveLength(0);
  });
});

describe("a role edit names only what it changed (NN2), and the stored place is carried", () => {
  const roleOf = (e: { role?: { start: string; end: string; current: boolean | null; placeId: string; placeLabel: string } }) => ({ start: "", end: "", current: null as boolean | null, placeId: "", placeLabel: "", ...(e.role ?? {}) });
  it("picking only a start month: the company and a:startDate, nothing else", async () => {
    const e = employment({ org: "Acme", workLocation: { "@id": OSLO } });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().editEmploymentRole(ed.employments[0]!.key, { ...roleOf(ed.employments[0]!), start: "2020-01" });
    });
    await settled(m);
    expect(patchesTo(e)).toEqual([{ "a:org": "Acme", "a:startDate": "2020-01" }]);
    expect(storedA(e)["a:workLocation"]).toEqual({ "@id": OSLO });
  });
  it("a role never said current: ending a date writes no a:ongoing true or false", async () => {
    const e = employment({ org: "Acme", startDate: "2019-03", workLocation: { "@id": OSLO } });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().editEmploymentRole(ed.employments[0]!.key, { ...roleOf(ed.employments[0]!), start: "2019-04" });
    });
    await settled(m);
    expect(JSON.stringify(patchesTo(e))).not.toContain("ongoing");
  });
  it("a start that did not read and a place that is not an address survive picking an end month", async () => {
    const e = employment({ org: "Acme", startDate: "2019-03-01", workLocation: "Oslo" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().editEmploymentRole(ed.employments[0]!.key, { ...roleOf(ed.employments[0]!), end: "2023-06" });
    });
    await settled(m);
    expect(patchesTo(e)).toEqual([{ "a:org": "Acme", "a:endDate": "2023-06", "a:ongoing": null }]);
    expect(storedA(e)["a:startDate"]).toBe("2019-03-01");
    expect(storedA(e)["a:workLocation"]).toBe("Oslo");
  });
  it("Present on, with a stored end: ongoing true and the end cleared", async () => {
    const e = employment({ org: "Acme", startDate: "2019-03", endDate: "2023-06" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().editEmploymentRole(ed.employments[0]!.key, { ...roleOf(ed.employments[0]!), end: "", current: true });
    });
    await settled(m);
    expect(patchesTo(e)).toEqual([{ "a:org": "Acme", "a:ongoing": true, "a:endDate": null }]);
  });
  it("two role edits in a row: the second is relative to what the first wrote", async () => {
    const e = employment({ org: "Acme", startDate: "2019-03" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    const key = ed.employments[0]!.key;
    act(() => {
      m.editor().editEmploymentRole(key, { ...roleOf(ed.employments[0]!), end: "2023-06" });
    });
    await settled(m);
    act(() => {
      m.editor().editEmploymentRole(key, { ...roleOf(m.editor().employments[0]!), end: "2023-06", placeId: OSLO });
    });
    await settled(m);
    expect(patchesTo(e)[1]).toEqual({ "a:org": "Acme", "a:workLocation": { "@id": OSLO } });
  });
  it("editing the company or a title leaves every role key and the place exactly as stored", async () => {
    const e = employment({ org: "Acme", startDate: "2019-03", ongoing: true, workLocation: { "@id": OSLO } });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    const key = ed.employments[0]!.key;
    act(() => {
      m.editor().editEmploymentCompany(key, "Acme AS");
    });
    await settled(m);
    act(() => {
      m.editor().editJobTitle(key, "t0", "CEO");
    });
    await settled(m);
    expect(storedA(e)).toMatchObject({ "a:startDate": "2019-03", "a:ongoing": true, "a:workLocation": { "@id": OSLO } });
    expect(patchesTo(e).every((b) => !("a:workLocation" in b) && !("a:ongoing" in b))).toBe(true);
  });
});

describe("removing an employment drops the record's edge and deletes no entity", () => {
  it("only the edge goes; the entity and the sibling stay; nothing is deleted", async () => {
    const a = employment({ org: "Acme" });
    const b = employment({ org: "Beta" });
    const p = person(a, b);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().deleteEmployment(ed.employments[0]!.key);
    });
    await settled(m);
    expect(factOf(p, "employment")).toEqual({ "@id": uriOf(b) });
    expect(store.has(a)).toBe(true);
    expect(store.has(b)).toBe(true);
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(0);
    expect(m.editor().employments.map((e) => e.company)).toEqual(["Beta"]);
  });
  it("the last one removed retracts the key, the only null", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a);
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().deleteEmployment(ed.employments[0]!.key);
    });
    await settled(m);
    expect(wireNulls()).toEqual(["a:employment"]);
  });
  it("a row that was never minted is dropped with no request", async () => {
    const p = person();
    const m = mountEditor(p);
    await loaded(m);
    let key = "";
    act(() => {
      key = m.editor().addEmployment();
    });
    act(() => {
      m.editor().deleteEmployment(key);
    });
    expect(m.editor().employments).toEqual([]);
    expect(writes()).toHaveLength(0);
  });
  it("a remove that fails brings the row back with 'failed', and retry removes it", async () => {
    const a = employment({ org: "Acme" });
    const b = employment({ org: "Beta" });
    const p = person(a, b);
    const m = mountEditor(p);
    const ed = await loaded(m);
    hooks.onPatch = (id, nth) => (id === p && nth === 1 ? 500 : undefined);
    const key = ed.employments[0]!.key;
    act(() => {
      m.editor().deleteEmployment(key);
    });
    await waitFor(() => expect(m.editor().status[`emp:${key}`]).toBe("failed"));
    expect(m.editor().employments.map((e) => e.company)).toEqual(["Acme", "Beta"]);
    act(() => {
      m.editor().retryOutbox();
    });
    await settled(m);
    expect(m.editor().employments.map((e) => e.company)).toEqual(["Beta"]);
    expect(factOf(p, "employment")).toEqual({ "@id": uriOf(b) });
  });
  it("an edge that did not read is carried when another employment is removed", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a, "06gkgone");
    const m = mountEditor(p);
    const ed = await loaded(m);
    act(() => {
      m.editor().deleteEmployment(ed.employments[0]!.key);
    });
    await settled(m);
    expect(factOf(p, "employment")).toEqual({ "@id": uriOf("06gkgone") });
  });
});

describe("writes", () => {
  it("run one at a time, in the order asked", async () => {
    const e = employment({ org: "Acme", jobTitle: "CEO" });
    const p = person(e);
    const m = mountEditor(p);
    const ed = await loaded(m);
    const key = ed.employments[0]!.key;
    hooks.delayMs = 15;
    act(() => {
      m.editor().editEmploymentCompany(key, "One");
      m.editor().editEmploymentCompany(key, "Two");
      m.editor().editEmploymentCompany(key, "Three");
    });
    await settled(m);
    // Each write reads the row as it is when its turn comes, so the last word is the last edit.
    expect(patchesTo(e)).toHaveLength(3);
    expect(storedA(e)["a:org"]).toBe("Three");
    expect(flight.max).toBe(1);
  });
  it("B4: a mint whose link write failed is linked by the retry, and a later edit writes no link", async () => {
    const p = person();
    const m = mountEditor(p);
    await loaded(m);
    hooks.onPatch = (id, nth) => (id === p && nth === 1 ? 500 : undefined);
    let key = "";
    act(() => {
      key = m.editor().addEmployment({ company: "Acme" });
    });
    await waitFor(() => expect(m.editor().status[`emp:${key}`]).toBe("failed"));
    expect(employmentsOf()).toHaveLength(1);
    expect(factOf(p, "employment")).toBeUndefined();
    act(() => {
      m.editor().retryOutbox();
    });
    await settled(m);
    expect(factOf(p, "employment")).toEqual({ "@id": uriOf(employmentsOf()[0]![0]) });
    const before = writes().filter((w) => w.path === `/lws/r/${p}`).length;
    act(() => {
      m.editor().editEmploymentCompany(key, "Acme AS");
    });
    await settled(m);
    expect(writes().filter((w) => w.path === `/lws/r/${p}`).length).toBe(before);
    expect(employmentsOf()).toHaveLength(1);
  });
  it("a create that is refused marks the row failed and writes no edge", async () => {
    const p = person();
    const m = mountEditor(p);
    await loaded(m);
    hooks.failCreate = true;
    let key = "";
    act(() => {
      key = m.editor().addEmployment({ company: "Acme" });
    });
    await waitFor(() => expect(m.editor().status[`emp:${key}`]).toBe("failed"));
    expect(factOf(p, "employment")).toBeUndefined();
  });
});

describe("no URI text in the names it exposes", () => {
  it("company, titles, role label and the error carry no address", async () => {
    const e = employment({ org: "Acme", jobTitle: ["CEO", "Founder"], startDate: "2019-03", workLocation: { "@id": OSLO }, employer: { "@id": ORG } });
    const p = person(e, "06gkgone");
    const ed = await loaded(mountEditor(p));
    const row = ed.employments[0]!;
    const names = [row.company, ...row.titles.map((t) => t.value), row.role!.placeLabel, ed.error ?? "", ...ed.legacyText];
    expect(names.join("\n")).not.toMatch(/https?:\/\/|osm-r|empx-/);
  });
});
