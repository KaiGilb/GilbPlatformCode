// @vitest-environment jsdom
// New. The Employment section end to end over an in-memory vault behind `fetch`: what it writes (and when), read off the wire. A null goes on the wire
// only for a value the user removed; mount, render, idle and a change of `canEdit` write nothing; an employment entity is never deleted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { __resetEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";
import { __resetEmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";
import { EmploymentRows } from "./index";
import { VAULT, factOf, flight, patchesTo, requests, seed, store, uriOf, wireNulls, writes } from "../test/vault";
import { setUp, tearDown } from "../test/support";
import { answerMaster, finder, show } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => (await import("../test/master")).master);

const PLACE = "https://geo.platform.example.test/base/e/osm-r-2775550";

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
  // Over every scenario below: no entity is ever deleted, and the organization-vault finder is never asked.
  expect(requests.filter((r) => r.method === "DELETE")).toEqual([]);
  expect(requests.filter((r) => r.url.includes("org-find"))).toEqual([]);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  tearDown();
});

const person = (...ids: string[]) => seed("t:Person", { givenName: "Bob", ...(ids.length ? { employment: ids.length === 1 ? { "@id": uriOf(ids[0]!) } : ids.map((i) => ({ "@id": uriOf(i) })) } : {}) });
const employment = (facts: Record<string, unknown>) => seed("t:Employment", facts);
const employmentsOf = () => [...store.entries()].filter(([, e]) => e.type === "t:Employment");
const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
};

describe("zero writes: mount, render, idle, a change of canEdit", () => {
  const worlds: [string, () => string][] = [
    ["no employment", () => person()],
    ["one", () => person(employment({ org: "Acme", jobTitle: "CEO", startDate: "2019-03", ongoing: true }))],
    ["two", () => person(employment({ org: "Acme" }), employment({ org: "Beta", jobTitle: ["CTO", "Founder"], workLocation: { "@id": PLACE } }))],
    ["an employment minted but not linked", () => { employment({ org: "Orphan" }); return person(); }],
    ["an edge that does not read", () => person(employment({ org: "Acme" }), "06gkgone")],
    ["a legacy text", () => seed("t:Person", { givenName: "Bob", employment: ["Old Firm AS"] })],
  ];
  for (const [name, make] of worlds) {
    it(`${name}: nothing is written over mount, 2 s idle, re-renders and canEdit flipped (managed card and plain)`, async () => {
      const p = make();
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const tree = (canEdit: boolean, managed: boolean) => {
        const rows = (
          <EmploymentRows title="Employment" recordId={p} recordEntityUri={uriOf(p)} vaultId={VAULT} edgeKey="employment" servedEdges={factOf(p, "employment")} canEdit={canEdit} onSaved={() => undefined} find={finder} vaultName="Hytta" />
        );
        return <QueryClientProvider client={qc}>{managed ? <CardModeProvider canEdit={canEdit}>{rows}</CardModeProvider> : rows}</QueryClientProvider>;
      };
      const view = render(tree(true, true));
      await settle();
      vi.useFakeTimers();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      for (const c of [false, true, false, true]) view.rerender(tree(c, true));
      view.rerender(tree(true, false));
      view.rerender(tree(false, false));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      vi.useRealTimers();
      await settle();
      expect(writes()).toEqual([]);
    });
  }

  it("opening the company box, typing and leaving it, and focusing and leaving a title without a change, write nothing", async () => {
    const a = employment({ org: "Acme", jobTitle: "CEO" });
    const p = person(a);
    const { q } = show(p);
    fireEvent.click(await waitFor(() => q.getByTestId("company-search-closed")));
    const box = q.getByLabelText("Edit Employment Company");
    fireEvent.change(box, { target: { value: "Acm" } });
    fireEvent.blur(box);
    fireEvent.keyDown(box, { key: "Escape" });
    fireEvent.click(q.getByLabelText("Edit Employment Job title"));
    fireEvent.blur(q.getByLabelText("Edit Employment Job title"));
    fireEvent.click(q.getByRole("button", { name: /add employment/ }));
    await settle();
    expect(writes()).toEqual([]);
    expect(employmentsOf()).toHaveLength(1);
  });
});

describe("a null only for the key the user removed (exact bodies)", () => {
  it("(i) removing the last title: the company and a null title, nothing else", async () => {
    const a = employment({ org: "Acme", jobTitle: "CEO" });
    const { q } = show(person(a));
    fireEvent.click(await waitFor(() => q.getByRole("button", { name: "Remove Job title" })));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Acme", "a:jobTitle": null }]);
    expect(wireNulls()).toEqual(["a:jobTitle"]);
  });

  it("(ii) a company edit on an employment with no title names no title and sends no null", async () => {
    const a = employment({ org: "Acme", startDate: "2019-03" });
    const { q } = show(person(a));
    fireEvent.click(await waitFor(() => q.getByTestId("company-search-closed")));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Gamma Ltd" } });
    fireEvent.click(await q.findByTestId("company-use-typed"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Gamma Ltd" }]);
    expect(wireNulls()).toEqual([]);
  });

  it("(iii) a title that did not read (an object another writer left) is not deleted by a company edit", async () => {
    const a = employment({ org: "Acme", jobTitle: { nested: "x" } });
    const { q } = show(person(a));
    fireEvent.click(await waitFor(() => q.getByTestId("company-search-closed")));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Gamma Ltd" } });
    fireEvent.click(await q.findByTestId("company-use-typed"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Gamma Ltd" }]);
    expect(factOf(a, "jobTitle")).toEqual({ nested: "x" });
  });

  it("(iv) retyping a linked company as plain text nulls the two links and nothing else", async () => {
    const org = seed("t:Organization", { name: "Butikk AS" });
    const a = employment({ org: "Butikk AS", jobTitle: "CEO", employer: { "@id": uriOf(org) } });
    const p = person(a);
    store.get(a)!.facts["employee"] = { "@id": uriOf(p) };
    const { q } = show(p);
    fireEvent.click(await waitFor(() => q.getByTestId("company-search-closed")));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Gamma Ltd" } });
    fireEvent.click(await q.findByTestId("company-use-typed"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Gamma Ltd", "a:jobTitle": "CEO", "a:employer": null, "a:employee": null }]);
    expect(wireNulls()).toEqual(["a:employee", "a:employer"]);
  });

  it("(v) picking only a start month names the start and no other date, no ongoing, no null", async () => {
    const a = employment({ org: "Acme", jobTitle: "CEO" });
    const { q } = show(person(a));
    fireEvent.change(await waitFor(() => q.getByLabelText("Role start")), { target: { value: "2019-03" } });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Acme", "a:jobTitle": "CEO", "a:startDate": "2019-03" }]);
    expect(wireNulls()).toEqual([]);
  });

  it("(vi) a stored start that does not read (a full date) is not named when an end month is picked; the end is, and the ongoing mark is cleared", async () => {
    const a = employment({ org: "Acme", jobTitle: "CEO", startDate: "2019-03-01" });
    const { q } = show(person(a));
    fireEvent.change(await waitFor(() => q.getByLabelText("Role end")), { target: { value: "2022-05" } });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Acme", "a:jobTitle": "CEO", "a:endDate": "2022-05", "a:ongoing": null }]);
    expect(factOf(a, "startDate")).toBe("2019-03-01");
  });

  it("(vii) Present on a role with a stored end: ongoing true and the end null", async () => {
    const a = employment({ org: "Acme", jobTitle: "CEO", startDate: "2019-03", endDate: "2021-06" });
    const { q } = show(person(a));
    fireEvent.click(await waitFor(() => q.getByLabelText("Role is current")));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Acme", "a:jobTitle": "CEO", "a:ongoing": true, "a:endDate": null }]);
    expect(wireNulls()).toEqual(["a:endDate"]);
  });

  it("(viii) with no place slot, a date edit never names the place: a stored place stays, and a stored place that does not read stays too", async () => {
    const a = employment({ org: "Acme", startDate: "2019-03", workLocation: { "@id": PLACE } });
    const b = employment({ org: "Beta", startDate: "2019-03", workLocation: "just a name, not an address" });
    const { q } = show(person(a, b));
    await waitFor(() => expect(q.getAllByLabelText("Role start")).toHaveLength(2));
    fireEvent.change(q.getAllByLabelText("Role start")[0]!, { target: { value: "2020-01" } });
    await waitFor(() => expect(patchesTo(a)).toHaveLength(1));
    fireEvent.change(q.getAllByLabelText("Role start")[1]!, { target: { value: "2020-02" } });
    await waitFor(() => expect(patchesTo(b)).toHaveLength(1));
    expect(patchesTo(a)).toEqual([{ "a:org": "Acme", "a:startDate": "2020-01" }]);
    expect(patchesTo(b)).toEqual([{ "a:org": "Beta", "a:startDate": "2020-02" }]);
    expect(factOf(a, "workLocation")).toEqual({ "@id": PLACE });
    expect(factOf(b, "workLocation")).toBe("just a name, not an address");
    expect(wireNulls()).toEqual([]);
  });

  it("(ix) removing the last employment: the record's edge key is null and nothing else is written; the entity stays", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a);
    const { q } = show(p);
    fireEvent.click(await waitFor(() => q.getByRole("button", { name: "Remove employment Acme" })));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toEqual({ "a:employment": null });
    expect(writes()[0]!.path).toBe(`/lws/r/${p}`);
    expect(store.has(a)).toBe(true);
  });

  it("(ix) removing one of two: the other edge and a non-edge item are carried, in order", async () => {
    const a = employment({ org: "Acme" });
    const b = employment({ org: "Beta" });
    const p = seed("t:Person", { givenName: "Bob", employment: [{ "@id": uriOf(a) }, "Old Firm AS", { "@id": uriOf(b) }] });
    const { q } = show(p);
    fireEvent.click(await waitFor(() => q.getByRole("button", { name: "Remove employment Acme" })));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toEqual({ "a:employment": ["Old Firm AS", { "@id": uriOf(b) }] });
    expect(wireNulls()).toEqual([]);
  });

  it("(x) removing an employment that another session already unlinked writes nothing to the record (the list as stored now is the base)", async () => {
    const a = employment({ org: "Acme" });
    const p = person(a);
    const { q } = show(p);
    const remove = await waitFor(() => q.getByRole("button", { name: "Remove employment Acme" }));
    delete store.get(p)!.facts["employment"];
    fireEvent.click(remove);
    await settle();
    expect(writes()).toEqual([]);
    expect(factOf(p, "employment")).toBeUndefined();
    expect(q.queryByRole("button", { name: "Not saved — retry" })).toBeNull();
  });

  it("a company named on the empty card: one create, one record patch with the one edge, and no null anywhere", async () => {
    const p = person();
    const { q } = show(p);
    fireEvent.click(await q.findByLabelText("Edit Employment Company"));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Acme" } });
    fireEvent.click(await q.findByTestId("company-use-typed"));
    await waitFor(() => expect(factOf(p, "employment")).toBeTruthy());
    expect(writes().map((w) => w.method)).toEqual(["POST", "PATCH"]);
    expect(wireNulls()).toEqual([]);
    expect(flight.max).toBe(1);
  });

  it("no body of any write carries an empty string, over a full session of edits", async () => {
    const a = employment({ org: "Acme", jobTitle: "CEO", startDate: "2019-03" });
    const { q } = show(person(a));
    await waitFor(() => q.getByLabelText("Role start"));
    fireEvent.change(q.getByLabelText("Role end"), { target: { value: "2021-01" } });
    await waitFor(() => expect(writes().length).toBe(1));
    fireEvent.change(q.getByLabelText("Role end"), { target: { value: "" } });
    await waitFor(() => expect(writes().length).toBe(2));
    const hasEmpty = writes().some((w) => Object.values(w.body ?? {}).some((v) => v === ""));
    expect(hasEmpty).toBe(false);
    expect(patchesTo(a)[1]).toEqual({ "a:org": "Acme", "a:jobTitle": "CEO", "a:endDate": null });
  });
});
