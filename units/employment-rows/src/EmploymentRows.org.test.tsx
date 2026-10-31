// @vitest-environment jsdom
// Ported from GilbApp `EmploymentRows.s8org.test.tsx` (7): an employment that names an organization RECORD writes `a:employer` and `a:employee` TOGETHER
// with `a:org` (the name) and the person's `a:employment` edge; the chooser offers organization RECORDS, not the org-vault finder. Re-based on the
// fetch-level vault of `test/vault.ts` and the finder given as a prop.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { __resetEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";
import { __resetEmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";
import { factOf, requests, seed, store, storedA, uriOf } from "../test/vault";
import { setUp, tearDown } from "../test/support";
import { answerMaster, finder, show } from "../test/world";
import { master } from "../test/master";

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

const employments = () => [...store.entries()].filter(([, e]) => e.type === "t:Employment");

async function chooseOrg(q: ReturnType<typeof show>["q"], typed: string, hitName: string) {
  fireEvent.click(await q.findByLabelText("Edit Employment Company"));
  fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: typed } });
  fireEvent.click(await q.findByRole("button", { name: hitName }));
}

describe("the company chooser offers organization RECORDS", () => {
  it("lists the holder's Organization records that match, never an organization vault, and makes no request to the org-vault finder", async () => {
    seed("t:Organization", { "a:name": "Butikk AS" });
    seed("t:Person", { "a:name": "Butikk Person" });
    const p = seed("t:Person", { "a:givenName": "Bob" });
    const { q } = show(p);
    fireEvent.click(await q.findByLabelText("Edit Employment Company"));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Buti" } });
    const hits = await q.findByTestId("company-search-hits");
    expect(within(hits).getAllByRole("button").map((b) => b.textContent)).toEqual(["Butikk AS"]);
    expect(requests.filter((r) => r.url.includes("org-find"))).toEqual([]);
  });
});

describe("naming an organization record writes the links together with the name", () => {
  it("ADD: a:org (the name), a:employer (the organization) and a:employee (this person) on ONE employment, and the person's edge", async () => {
    const org = seed("t:Organization", { "a:name": "Butikk AS" });
    const p = seed("t:Person", { "a:givenName": "Bob" });
    const { q } = show(p);
    await chooseOrg(q, "Buti", "Butikk AS");
    await waitFor(() => expect(employments()).toHaveLength(1));
    const [[id]] = employments();
    expect(storedA(id!)).toMatchObject({ "a:org": "Butikk AS", "a:employer": { "@id": uriOf(org) }, "a:employee": { "@id": uriOf(p) } });
    expect(storedA(id!)).not.toHaveProperty("a:visibilityTier");
    expect(storedA(id!)).not.toHaveProperty("a:claimSubject");
    await waitFor(() => expect(factOf(p, "employment")).toEqual({ "@id": uriOf(id!) }));
  });

  it("a company typed that matches no record is the name only: no employer, no employee", async () => {
    const p = seed("t:Person", { "a:givenName": "Bob" });
    const { q } = show(p);
    fireEvent.click(await q.findByLabelText("Edit Employment Company"));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Zeta Corp" } });
    fireEvent.click(await q.findByTestId("company-use-typed"));
    await waitFor(() => expect(employments()).toHaveLength(1));
    expect(storedA(employments()[0]![0])).toEqual(expect.objectContaining({ "a:org": "Zeta Corp" }));
    expect(Object.keys(storedA(employments()[0]![0]))).not.toContain("a:employer");
    expect(Object.keys(storedA(employments()[0]![0]))).not.toContain("a:employee");
  });

  it("a title edit afterwards keeps the links (they are re-asserted, never dropped)", async () => {
    const org = seed("t:Organization", { "a:name": "Butikk AS" });
    const p = seed("t:Person", { "a:givenName": "Bob" });
    const { q } = show(p);
    await chooseOrg(q, "Buti", "Butikk AS");
    await waitFor(() => expect(employments()).toHaveLength(1));
    fireEvent.click(await q.findByRole("button", { name: "Edit Employment Job title" }));
    const box = q.getByLabelText("Edit Employment Job title");
    fireEvent.change(box, { target: { value: "CEO" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(factOf(employments()[0]![0], "jobTitle")).toBe("CEO"));
    expect(storedA(employments()[0]![0])).toMatchObject({ "a:employer": { "@id": uriOf(org) }, "a:employee": { "@id": uriOf(p) } });
  });

  it("an employment already linked: re-typing the company as plain text RETRACTS both links (the holder's own act)", async () => {
    const org = seed("t:Organization", { "a:name": "Butikk AS" });
    const emp = seed("t:Employment", { "a:org": "Butikk AS", "a:claimSlotKey": "empx-a", "a:employer": { "@id": uriOf(org) } });
    const p = seed("t:Person", { "a:givenName": "Bob", "a:employment": { "@id": uriOf(emp) } });
    store.get(emp)!.facts["employee"] = { "@id": uriOf(p) };
    const { q } = show(p);
    fireEvent.click(await q.findByRole("button", { name: "Edit Employment Company" }));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Gamma Ltd" } });
    fireEvent.click(await q.findByTestId("company-use-typed"));
    await waitFor(() => expect(factOf(emp, "org")).toBe("Gamma Ltd"));
    expect(Object.keys(storedA(emp))).not.toContain("a:employer");
    expect(Object.keys(storedA(emp))).not.toContain("a:employee");
  });

  it("an older, name-only employment is left alone by an edit of its title (no link is invented for it)", async () => {
    seed("t:Organization", { "a:name": "Butikk AS" });
    const emp = seed("t:Employment", { "a:org": "Butikk AS", "a:jobTitle": "CEO", "a:claimSlotKey": "empx-a" });
    const p = seed("t:Person", { "a:givenName": "Bob", "a:employment": { "@id": uriOf(emp) } });
    const { q } = show(p);
    fireEvent.click(await q.findByRole("button", { name: "Edit Employment Job title" }));
    const box = q.getByLabelText("Edit Employment Job title");
    fireEvent.change(box, { target: { value: "Chair" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(factOf(emp, "jobTitle")).toBe("Chair"));
    expect(Object.keys(storedA(emp))).not.toContain("a:employer");
  });

  it("a master that does not name the link terms makes the write FAIL loud: nothing is minted under a guessed key", async () => {
    seed("t:Organization", { "a:name": "Butikk AS" });
    const p = seed("t:Person", { "a:givenName": "Bob" });
    master.attributeSpelling.mockImplementation(async (name: string) => (name === "employer" || name === "employee" ? null : name) as never);
    const { q } = show(p);
    await chooseOrg(q, "Buti", "Butikk AS");
    await waitFor(() => expect(q.getByRole("button", { name: /retry/i })).toBeTruthy());
    expect(employments()).toHaveLength(0);
    master.attributeSpelling.mockImplementation(async (name: string) => name);
  });
});
