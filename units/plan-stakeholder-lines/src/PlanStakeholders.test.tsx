import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanStakeholders, StakeholderLinesHostContext } from "./index";
import {
  KINDS,
  PLAN_VAULT,
  REC_ID,
  REC_URI,
  VAULT,
  hit,
  link,
  makeFake,
  person,
  planRecord,
  relUri,
  served,
  uriOf,
  type FakeOptions,
} from "../test/fakeHost";

afterEach(cleanup);

const ST = "t:StakeholderOf" as const;
const AU = "t:AuthorityOf" as const;
const RO = "t:ResourceOwnerOf" as const;
const RESOURCE = "https://pv.example.test/base/t/Resource";
const PEOPLE = [person("ann", "Ann"), person("bob", "Bob"), person("org1", "Acme Org", { typeUri: "https://h.example.test/base/t/Organization" }), person("new1", "New One")];

type Props = Partial<Parameters<typeof PlanStakeholders>[0]>;
function draw(o: FakeOptions = {}, props: Props = {}) {
  const fake = makeFake({ records: PEOPLE, hits: [hit("ann", "Ann"), hit("bob", "Bob")], ...o });
  const onOpen = vi.fn();
  const onNotice = vi.fn();
  const onPicked = vi.fn();
  const ui = (p: Props = {}): ReactNode => (
    <PlanStakeholders record={planRecord()} vaultId={VAULT} planVault={PLAN_VAULT} editing={false} onOpen={onOpen} onNotice={onNotice} onPicked={onPicked} {...props} {...p} />
  );
  const view = render(ui(), { wrapper: fake.Frame });
  return { fake, onOpen, onNotice, onPicked, view, ui };
}
const search = () => screen.getByRole("textbox", { name: "Search" });
async function pick(name: string) {
  fireEvent.focus(search());
  const hits = await screen.findAllByTestId("org-record-hit");
  fireEvent.click(hits.find((h) => h.firstChild?.textContent === name)!);
}
const names = (fake: ReturnType<typeof makeFake>) => fake.log.map((c) => c.fn);
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("what the line shows", () => {
  it("shows a linked stakeholder as a chip, an Authority marked, and nothing for a Resource Owner on a Function", () => {
    draw({ relations: [link(ST, relUri(1), uriOf("ann")), link(AU, relUri(2), uriOf("bob")), link(RO, relUri(3), uriOf("org1"))] });
    const root = screen.getByTestId("plan-stakeholders");
    expect(within(root).getByRole("button", { name: "Ann" })).toBeTruthy();
    expect(within(root).getByRole("button", { name: "Bob" })).toBeTruthy();
    expect(within(root).queryByRole("button", { name: "Acme Org" })).toBeNull();
    expect(within(root).getAllByText("Authority")).toHaveLength(1);
    expect(within(root).getByText("Authority").previousElementSibling?.textContent).toContain("Bob");
    expect(within(root).queryByText("Resource Owner")).toBeNull();
  });

  it("is empty when there is nothing, says nothing about it, and says the read failed only when it did", () => {
    const a = draw();
    expect(screen.getByTestId("plan-stakeholders").children).toHaveLength(0);
    a.view.unmount();
    draw({ relationsError: true });
    expect(screen.getByText("Could not read stakeholders.")).toBeTruthy();
    cleanup();
    draw({ relationsError: true, relations: [link(ST, relUri(1), uriOf("ann"))] });
    expect(screen.queryByText("Could not read stakeholders.")).toBeNull();
  });

  it("shows a name that is not a record yet as text, each once, and a Link button only while editing", () => {
    const rec = planRecord({ served: served({ stakeholders: ["Acme", "Beta"] }) });
    const a = draw({}, { record: rec });
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Acme" })).toBeNull();
    a.view.unmount();
    draw({}, { record: rec, editing: true });
    expect(screen.getAllByRole("button", { name: "Link" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove Acme" })).toBeTruthy();
  });

  it("shows the @handle when the loaded record already carries one, and names the remove button by the record's name", () => {
    draw(
      { relations: [link(ST, relUri(1), uriOf("ann"))], recordRead: null, records: [person("ann", "Ann", { facts: { label: "Ann", tagString: "@@annie" } })] },
      { editing: true },
    );
    expect(screen.getByText("@annie")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Ann" })).toBeTruthy();
  });

  it("falls back to the read the host holds for the handle when the list has no such record", () => {
    draw(
      { relations: [link(ST, relUri(1), uriOf("zed"))], records: [], recordRead: { ...person("zed", "Zed"), facts: { name: "Zed Z", tagString: "zed" } } },
      { editing: true },
    );
    expect(screen.getByText("@zed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Zed Z" })).toBeTruthy();
  });

  it("takes the @handle from the served facts of the loaded record when its flat facts have none, and the list before the host's read", () => {
    const served = { facts: { tagString: "serv" }, context: null, etag: null };
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann"))], records: [person("ann", "Ann", { served })] }, { editing: true });
    expect(screen.getByText("@serv")).toBeTruthy();
    a.view.unmount();
    const fromRead = { ...person("ann", "Read Ann"), served };
    draw({ relations: [link(ST, relUri(1), uriOf("ann"))], records: [], recordRead: fromRead }, { editing: true });
    expect(screen.getByText("@serv")).toBeTruthy();
    cleanup();
    draw(
      { relations: [link(ST, relUri(1), uriOf("ann"))], records: [person("ann", "List Ann")], recordRead: person("ann", "Read Ann") },
      { editing: true },
    );
    expect(screen.getByRole("button", { name: "Remove List Ann" })).toBeTruthy();
  });

  it("marks a Resource Owner only on a t:Resource record that is not a substituted type", () => {
    const owners = [link(RO, relUri(3), uriOf("org1"))];
    const resource = planRecord({ typeUri: RESOURCE });
    const a = draw({ relations: owners }, { record: resource });
    expect(within(screen.getByTestId("plan-stakeholders")).getByText("Resource Owner")).toBeTruthy();
    expect(a.fake.calls("hasSubstitutedType")[0]!.args[0]).toBe(resource);
    a.view.unmount();
    const b = draw({ relations: owners, substituted: true }, { record: planRecord({ typeUri: RESOURCE, typeSubstituted: true }) });
    expect(screen.queryByText("Resource Owner")).toBeNull();
    expect(b.fake.calls("hasSubstitutedType")).toHaveLength(1);
    b.view.unmount();
    const c = draw({ relations: owners }, { record: planRecord({ typeUri: "t:Resource" }) });
    expect(screen.getByText("Resource Owner")).toBeTruthy();
    c.view.unmount();
    const d = draw({ relations: owners }, { record: planRecord({ typeUri: "https://pv.example.test/base/t/Solution" }) });
    expect(screen.queryByText("Resource Owner")).toBeNull();
    expect(d.fake.calls("hasSubstitutedType")).toHaveLength(0);
  });

  it("shows the older record-level Authority holder with the Authority mark, once, unless a relation already names that person", () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("bob") } }) });
    const a = draw({}, { record: rec });
    expect(screen.getByRole("button", { name: "Bob" })).toBeTruthy();
    expect(screen.getAllByText("Authority")).toHaveLength(1);
    a.view.unmount();
    draw({ relations: [link(AU, relUri(2), uriOf("bob"))] }, { record: rec });
    expect(screen.getAllByRole("button", { name: "Bob" })).toHaveLength(1);
    expect(screen.getAllByText("Authority")).toHaveLength(1);
  });
});

describe("opening a record", () => {
  it("opens by id through onOpen when the app cannot open it in its own vault", () => {
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann")), link(AU, relUri(2), uriOf("bob"))] });
    fireEvent.click(screen.getByRole("button", { name: "Ann" }));
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    expect(a.onOpen.mock.calls).toEqual([["ann"], ["bob"]]);
  });

  it("opens in the vault its address names, pushing, when the app can", () => {
    const openInVault = vi.fn();
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann")), link(ST, relUri(2), "https://p.example.test/vault/e/cy")], openInVault });
    fireEvent.click(screen.getByRole("button", { name: "Ann" }));
    fireEvent.click(screen.getByRole("button", { name: "cy" }));
    expect(openInVault.mock.calls).toEqual([
      ["https://h.example.test/base", "ann", { push: true }],
      ["https://p.example.test/vault", "cy", { push: true }],
    ]);
    expect(a.onOpen).not.toHaveBeenCalled();
  });

  it("draws a stakeholder whose address is not a record address as plain text, with nothing to open", () => {
    const a = draw({ relations: [link(ST, relUri(1), "https://h.example.test/e/odd")] });
    expect(screen.getByText("https://h.example.test/e/odd").tagName).toBe("SPAN");
    expect(screen.queryByRole("button", { name: /odd/ })).toBeNull();
    expect(a.onOpen).not.toHaveBeenCalled();
  });
});

describe("the picker", () => {
  it("is shown while editing, or when offered, and not otherwise; Offer false hides it in Edit", () => {
    const a = draw();
    expect(screen.queryByRole("textbox", { name: "Search" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ New stakeholder" })).toBeNull();
    a.view.rerender(a.ui({ offer: true }));
    expect(search().getAttribute("placeholder")).toBe("Search stakeholders");
    expect(screen.getByRole("button", { name: "+ New stakeholder" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    a.view.rerender(a.ui({ editing: true }));
    expect(search()).toBeTruthy();
    a.view.rerender(a.ui({ editing: true, offer: false }));
    expect(screen.queryByRole("textbox", { name: "Search" })).toBeNull();
  });

  it("asks the kinds hook for the kinds only while the picker is shown", () => {
    const seen: boolean[] = [];
    const over = { useStakeholderKinds: (enabled: boolean) => (seen.push(enabled), { data: KINDS }) };
    const a = draw({ over });
    expect(new Set(seen)).toEqual(new Set([false]));
    seen.length = 0;
    a.view.rerender(a.ui({ editing: true }));
    expect(new Set(seen)).toEqual(new Set([true]));
  });

  it("searches the held vaults for the master's kind names with the typed text, under the line's own key", async () => {
    const a = draw({}, { editing: true });
    fireEvent.focus(search());
    await screen.findByRole("button", { name: "Ann" });
    expect(a.fake.calls("findStakeholders")[0]!.args).toEqual([["v1", "v2"], ["Person", "Organization"], ""]);
    expect(a.fake.pickerKeys.at(-1)).toEqual(["stakeholder-search", "line", "v1|v2", ""]);
    fireEvent.change(search(), { target: { value: " Bo " } });
    await waitFor(() => expect(a.fake.calls("findStakeholders").at(-1)!.args).toEqual([["v1", "v2"], ["Person", "Organization"], "Bo"]));
    expect(a.fake.pickerKeys.at(-1)).toEqual(["stakeholder-search", "line", "v1|v2", "Bo"]);
  });

  it("does not search while the master's kinds are not known", async () => {
    const a = draw({ kinds: undefined }, { editing: true });
    fireEvent.focus(search());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(a.fake.calls("findStakeholders")).toHaveLength(0);
  });

  it("does not offer a person already linked as a stakeholder", async () => {
    draw({ relations: [link(ST, relUri(1), uriOf("ann"))] }, { editing: true });
    fireEvent.focus(search());
    await screen.findByRole("button", { name: "Bob" });
    const list = screen.getByTestId("org-record-hits");
    expect(within(list).queryByRole("button", { name: "Ann" })).toBeNull();
  });

  it("says the search was not whole, and Try again drops this text's cached search", async () => {
    const half = async () => ({ hits: [], complete: false, vaultsMissed: false });
    const a = draw({ over: { findStakeholders: half } }, { editing: true });
    fireEvent.focus(search());
    expect(await screen.findByText("Not every record could be searched. Try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(a.fake.calls("invalidateSearch")).toEqual([{ fn: "invalidateSearch", args: [{ queryKey: ["stakeholder-search", "line", "v1|v2", ""] }] }]);
  });

  it("says some records could not be searched under hits that are not whole", async () => {
    const part = async () => ({ hits: [hit("ann", "Ann")], complete: false, vaultsMissed: false });
    draw({ over: { findStakeholders: part } }, { editing: true });
    fireEvent.focus(search());
    expect(await screen.findByText("Some records could not be searched.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ann" })).toBeTruthy();
  });
});

describe("linking a picked record", () => {
  it("writes ONE relation, then reads the relations again and sets them, in that order", async () => {
    const a = draw({ relations: [link(AU, relUri(2), uriOf("bob"))] }, { editing: true });
    await pick("Ann");
    await waitFor(() => expect(a.onPicked).toHaveBeenCalledTimes(1));
    expect(a.fake.calls("writePairRelation")).toHaveLength(1);
    expect(a.fake.calls("writePairRelation")[0]!.args[0]).toStrictEqual({
      sourceId: REC_ID,
      targetId: uriOf("ann"),
      sourceEntityUri: REC_URI,
      targetEntityUri: uriOf("ann"),
      typeCurie: "t:StakeholderOf",
      roles: { source: "role:referenced-by", target: "role:stakeholder" },
      extraFacts: { "a:relationType": "stakeholder" },
      vaultNamespace: PLAN_VAULT,
    });
    expect(names(a.fake).filter((n) => ["getRelations", "liveRow", "writePairRelation", "setRelations", "patchRecord", "endRelation"].includes(n))).toEqual([
      "getRelations",
      "liveRow",
      "liveRow",
      "writePairRelation",
      "getRelations",
      "setRelations",
    ]);
    expect(a.fake.calls("getRelations").map((c) => c.args)).toEqual([[REC_ID, REC_URI], [REC_ID, REC_URI]]);
    expect(a.fake.calls("liveRow").map((c) => c.args[0])).toEqual([PLAN_VAULT, PLAN_VAULT]);
    expect(a.fake.relationsNow()).toStrictEqual([
      link(AU, relUri(2), uriOf("bob")),
      { relation: relUri("w1"), role: "role:referenced-by", type: "t:StakeholderOf", members: [{ member: uriOf("ann"), role: "role:stakeholder" }] },
    ]);
    expect(a.onNotice).toHaveBeenLastCalledWith(null);
    expect(await screen.findAllByRole("button", { name: "Ann" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses the relation address the writer gave, or the person's address when it gave none", async () => {
    const a = draw({ over: { writePairRelation: async () => ({ id: "x" }) } }, { editing: true });
    await pick("Ann");
    await waitFor(() => expect(a.fake.relationsNow()).toHaveLength(1));
    expect(a.fake.relationsNow()![0]!.relation).toBe(uriOf("ann"));
  });

  it("picking the same person twice before the first write answers writes once", async () => {
    const gate = deferred<{ id: string; uri: string }>();
    const a = draw({ over: { writePairRelation: () => gate.promise } }, { editing: true });
    fireEvent.focus(search());
    const button = await screen.findByRole("button", { name: "Ann" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(a.fake.calls("writePairRelation")).toHaveLength(1);
    await act(async () => gate.resolve({ id: "r", uri: relUri("w9") }));
    expect(a.fake.calls("writePairRelation")).toHaveLength(1);
    expect(a.fake.relationsNow()).toHaveLength(1);
  });

  it("holds the controls while a write runs and frees them after", async () => {
    const gate = deferred<{ id: string; uri: string }>();
    const rec = planRecord({ served: served({ stakeholders: ["Acme"] }) });
    const a = draw({ relations: [link(ST, relUri(1), uriOf("bob"))], over: { writePairRelation: () => gate.promise } }, { editing: true, record: rec });
    await pick("Ann");
    await waitFor(() => expect((screen.getByRole("button", { name: "Remove Bob" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Remove Acme" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "+ New stakeholder" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "Link" })[0] as HTMLButtonElement).disabled).toBe(true);
    await act(async () => gate.resolve({ id: "r", uri: relUri("w9") }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Remove Bob" }) as HTMLButtonElement).disabled).toBe(false));
    expect(a.fake.relationsNow()).toHaveLength(2);
  });

  it("refuses a person who is already an Authority here, writes nothing, and keeps the sentence on screen", async () => {
    const a = draw({ relations: [link(AU, relUri(2), uriOf("ann"))] }, { editing: true });
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("Already an Authority here.");
    expect(a.fake.calls("writePairRelation")).toHaveLength(0);
    expect(a.onNotice).toHaveBeenLastCalledWith(null);
    expect(a.onPicked).toHaveBeenCalledTimes(1);
  });

  it("refuses a person who is the older record-level Authority holder", async () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("ann") } }) });
    const a = draw({}, { editing: true, record: rec });
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("Already an Authority here.");
    expect(a.fake.calls("writePairRelation")).toHaveLength(0);
  });

  it("reads the Authority test from the relations the app holds now, not the ones drawn", async () => {
    const a = draw({}, { editing: true });
    fireEvent.focus(search());
    const button = await screen.findByRole("button", { name: "Ann" });
    a.fake.store.set(`${REC_ID}|${REC_URI}`, [link(AU, relUri(5), uriOf("ann"))]);
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toBe("Already an Authority here.");
    expect(a.fake.calls("writePairRelation")).toHaveLength(0);
  });

  it("refuses a person who is already a Resource Owner here, only on a card that shows owners", async () => {
    const relations = [link(RO, relUri(3), uriOf("ann"))];
    const a = draw({ relations }, { editing: true, record: planRecord({ typeUri: RESOURCE }) });
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("Already a Resource Owner here.");
    expect(a.fake.calls("writePairRelation")).toHaveLength(0);
    cleanup();
    const b = draw({ relations }, { editing: true });
    await pick("Ann");
    await waitFor(() => expect(b.fake.calls("writePairRelation")).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does nothing, silently, for a person already linked as a stakeholder", async () => {
    const over = {
      renderCreateStakeholder: (p: { onCreated: (id: string) => void }) => (
        <button type="button" onClick={() => p.onCreated(uriOf("ann"))}>
          made
        </button>
      ),
    };
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann"))], over }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "made" }));
    await waitFor(() => expect(a.onPicked).toHaveBeenCalledTimes(1));
    expect(a.fake.calls("writePairRelation")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(a.onNotice).toHaveBeenLastCalledWith(null);
  });

  it("shows a failed write's sentence, tells the card, and does not call onPicked", async () => {
    const a = draw({ over: { writePairRelation: async () => Promise.reject(new Error("HTTP 500 down")) } }, { editing: true });
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("HTTP 500 down");
    expect(a.onNotice).toHaveBeenLastCalledWith("HTTP 500 down");
    expect(a.onPicked).not.toHaveBeenCalled();
    expect(a.fake.relationsNow()).toBeUndefined();
  });
});

describe("a name that is not a record yet", () => {
  const withTag = (extra: FakeOptions = {}) => draw({ ...extra }, { editing: true, record: planRecord({ served: served({ stakeholders: ["Ann"] }) }) });

  it("is cleared after it is linked: the box opens with the name, the relation is written, then the name is removed with the version check", async () => {
    const a = withTag();
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect((search() as HTMLInputElement).value).toBe("Ann");
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(names(a.fake).filter((n) => ["writePairRelation", "setRelations", "patchRecord", "ensureEtagUnchanged"].includes(n))).toEqual([
      "writePairRelation",
      "setRelations",
      "ensureEtagUnchanged",
      "patchRecord",
    ]);
    const args = a.fake.calls("patchRecord")[0]!.args;
    expect(args).toHaveLength(5);
    expect(args.slice(0, 3)).toEqual([REC_ID, { stakeholders: null }, REC_URI]);
    expect(args[3]).toBeUndefined();
    expect(args[4]).toEqual({ ifMatch: '"e1"' });
    expect(a.onPicked).toHaveBeenCalledTimes(1);
    expect(a.fake.relationsNow()).toHaveLength(1);
  });

  it("passes the served source when the record carries served keys, and stores the saved row in both caches", async () => {
    const rec = planRecord({ served: served({ stakeholders: ["Ann"] }), servedKeys: ["stakeholders"] });
    const a = draw({}, { editing: true, record: rec });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("setRecordRead")).toHaveLength(1));
    expect(a.fake.calls("patchRecord")[0]!.args[3]).toEqual({ at: REC_URI, servedKeys: ["stakeholders"] });
    const [id, patch, etag, opts] = a.fake.calls("applyPatch")[0]!.args as [string, unknown, string, unknown];
    expect(a.fake.calls("applyPatch")[0]!.args[0]).toMatchObject({ id: REC_ID });
    expect([patch, etag, opts]).toEqual([{ stakeholders: null }, '"e2"', { keepOpaque: true }]);
    expect(id).toBeTruthy();
    const stored = a.fake.calls("storePlanRow")[0]!;
    expect(stored.args[0]).toBe(PLAN_VAULT);
    expect((stored.args[1] as GridRecord).updatedAt).toBeTypeOf("number");
    expect((stored.args[1] as GridRecord).updatedAt).toBeGreaterThan(1000);
    expect(a.fake.calls("setRecordRead")[0]!.args.slice(0, 2)).toEqual([REC_ID, REC_URI]);
    expect(a.fake.calls("setRecordRead")[0]!.args[2]).toBe(stored.args[1]);
  });

  it("keeps the other names when one is linked", async () => {
    const rec = planRecord({ served: served({ stakeholders: ["Ann", "Cy"] }) });
    const a = draw({}, { editing: true, record: rec });
    fireEvent.click(screen.getAllByRole("button", { name: "Link" })[0]!);
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("patchRecord")[0]!.args[1]).toEqual({ stakeholders: ["Cy"] });
  });

  it("on a failed clearing, ends the new relation, drops it from the relations, and shows the failure", async () => {
    const a = withTag({ over: { patchRecord: async () => Promise.reject(new Error("boom")) } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
    expect(a.fake.calls("endRelation")).toEqual([{ fn: "endRelation", args: [relUri("w1"), PLAN_VAULT] }]);
    expect(a.fake.relationsNow()).toEqual([]);
    expect(names(a.fake).filter((n) => ["writePairRelation", "setRelations", "patchRecord", "endRelation"].includes(n))).toEqual([
      "writePairRelation",
      "setRelations",
      "patchRecord",
      "endRelation",
      "setRelations",
    ]);
    expect(a.onNotice).toHaveBeenLastCalledWith("boom");
    expect(a.onPicked).not.toHaveBeenCalled();
  });

  it("still shows the failure when ending the new relation fails too", async () => {
    const a = withTag({ over: { patchRecord: async () => Promise.reject(new Error("boom")), endRelation: async () => Promise.reject(new Error("also")) } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
    expect(a.fake.relationsNow()).toEqual([]);
  });

  it("is removed on its own, with the version check, and the card is told nothing is wrong", async () => {
    const rec = planRecord({ served: served({ stakeholders: ["Acme", "Beta"] }) });
    const a = draw({}, { editing: true, record: rec });
    fireEvent.click(screen.getByRole("button", { name: "Remove Acme" }));
    await waitFor(() => expect(a.onNotice).toHaveBeenCalledWith(null));
    expect(a.fake.calls("patchRecord")[0]!.args.slice(0, 3)).toEqual([REC_ID, { stakeholders: ["Beta"] }, REC_URI]);
  });

  it("is cleared once: the next person linked does not clear it again", async () => {
    const rec = planRecord({ served: served({ stakeholders: ["Ann"] }) });
    const a = draw({}, { editing: true, record: rec });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    await pick("Bob");
    await waitFor(() => expect(a.fake.calls("writePairRelation")).toHaveLength(2));
    expect(a.fake.calls("patchRecord")).toHaveLength(1);
  });

  it("is not touched by a link made without it: a later pick does not clear the earlier name", async () => {
    const rec = planRecord({ served: served({ stakeholders: ["Ann"] }) });
    const a = draw({}, { editing: true, record: rec });
    await pick("Bob");
    await waitFor(() => expect(a.onPicked).toHaveBeenCalled());
    expect(a.fake.calls("patchRecord")).toHaveLength(0);
  });
});

describe("removing a link", () => {
  it("ends the relation in the record's vault, drops it from the relations and tells the card nothing is wrong", async () => {
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann")), link(ST, relUri(2), uriOf("bob"))] }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    await waitFor(() => expect(a.onNotice).toHaveBeenCalledWith(null));
    expect(a.fake.calls("endRelation")).toEqual([{ fn: "endRelation", args: [relUri(1), PLAN_VAULT] }]);
    expect(a.fake.relationsNow()).toEqual([link(ST, relUri(2), uriOf("bob"))]);
    expect(screen.queryByRole("button", { name: "Ann" })).toBeNull();
    expect(names(a.fake).filter((n) => ["endRelation", "setRelations"].includes(n))).toEqual(["endRelation", "setRelations"]);
  });

  it("has no remove control when the card is not in Edit", () => {
    draw({ relations: [link(ST, relUri(1), uriOf("ann"))] });
    expect(screen.queryByRole("button", { name: "Remove Ann" })).toBeNull();
  });

  it("shows the failure and keeps the relation when the end fails", async () => {
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann"))], over: { endRelation: async () => Promise.reject(new Error("403 forbidden")) } }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You cannot write to this vault.");
    expect(a.onNotice).toHaveBeenLastCalledWith("You cannot write to this vault.");
    expect(a.fake.calls("setRelations")).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Remove Ann" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("creating a new stakeholder", () => {
  it("opens the host's dialog over this record's vault and the card's vault, and closes it", () => {
    const a = draw({}, { editing: true });
    expect(screen.queryByTestId("create-dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    expect(a.fake.calls("renderCreateStakeholder")[0]!.args[0]).toMatchObject({ open: true, stakeholders: true, source: null, drawnVaultIds: [VAULT, PLAN_VAULT] });
    fireEvent.click(screen.getByRole("button", { name: "close dialog" }));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
  });

  it("links the record made, found by its id in the record's vault; drops the cached searches first", async () => {
    const a = draw({}, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "created id" }));
    await waitFor(() => expect(a.fake.calls("writePairRelation")).toHaveLength(1));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
    expect(a.fake.calls("invalidateSearch")[0]!.args).toEqual([{ queryKey: ["stakeholder-search", "line"], refetchType: "active" }]);
    expect(a.fake.calls("readRecord")[0]!.args).toEqual(["new1", PLAN_VAULT]);
    expect((a.fake.calls("writePairRelation")[0]!.args[0] as { targetId: string }).targetId).toBe(uriOf("new1"));
    expect(names(a.fake).indexOf("invalidateSearch")).toBeLessThan(names(a.fake).indexOf("readRecord"));
    expect(a.onPicked).toHaveBeenCalledTimes(1);
  });

  it("builds the address from the id when the record cannot be read", async () => {
    const a = draw({ over: { readRecord: async () => Promise.reject(new Error("gone")) } }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "created id" }));
    await waitFor(() => expect(a.fake.calls("writePairRelation")).toHaveLength(1));
    expect(a.fake.calls("memberEntityUri").map((c) => c.args)).toContainEqual(["new1", null, PLAN_VAULT]);
    expect((a.fake.calls("writePairRelation")[0]!.args[0] as { targetId: string }).targetId).toBe(`${PLAN_VAULT}/e/new1`);
  });

  it("links an address as it is, without reading the record", async () => {
    const a = draw({}, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "created address" }));
    await waitFor(() => expect(a.fake.calls("writePairRelation")).toHaveLength(1));
    expect(a.fake.calls("readRecord")).toHaveLength(0);
    expect((a.fake.calls("writePairRelation")[0]!.args[0] as { targetId: string }).targetId).toBe(uriOf("new2"));
  });

  it("names an id that is not an address with the card's vault when the picker gave one", async () => {
    const a = draw({ hits: [{ uri: "bare1", label: "Bare" }] }, { editing: true });
    await pick("Bare");
    await waitFor(() => expect(a.fake.calls("writePairRelation")).toHaveLength(1));
    expect(a.fake.calls("memberEntityUri").map((c) => c.args)).toContainEqual(["bare1", null, VAULT]);
    expect((a.fake.calls("writePairRelation")[0]!.args[0] as { targetId: string }).targetId).toBe(`${VAULT}/e/bare1`);
  });
});

describe("a host without writers", () => {
  it("is read-only: Edit and Offer show chips and names, and no control that would write", () => {
    const rec = planRecord({ served: served({ stakeholders: ["Acme"] }) });
    const a = draw({ readOnly: true, relations: [link(ST, relUri(1), uriOf("ann"))] }, { editing: true, offer: true, record: rec });
    expect(screen.getByRole("button", { name: "Ann" })).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Search" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ New stakeholder" })).toBeNull();
    expect(a.fake.calls("renderCreateStakeholder")).toHaveLength(0);
  });

  it("is read-only when only one of the writers is left out", () => {
    for (const left of ["writePairRelation", "endRelation", "patchRecord", "renderCreateStakeholder"] as const) {
      const a = draw({ over: { [left]: undefined } }, { editing: true });
      expect(screen.queryByRole("textbox", { name: "Search" }), left).toBeNull();
      a.view.unmount();
    }
  });

  it("does not need the Authority writers", () => {
    draw({ over: { writeAuthorityRelation: undefined, endThenWriteAuthority: undefined } }, { editing: true });
    expect(search()).toBeTruthy();
  });
});

describe("the sentences", () => {
  const rec = planRecord({ served: served({ stakeholders: ["Acme", "Beta"] }) });
  const remove = () => fireEvent.click(screen.getByRole("button", { name: "Remove Acme" }));

  it("says the version could not be read when the check cannot read it", async () => {
    const a = draw({ over: { ensureEtagUnchanged: async () => ({ unreadable: true }) } }, { editing: true, record: rec });
    remove();
    const text = "This record's version could not be read, so the list was not saved. Reload and try again.";
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(a.onNotice).toHaveBeenLastCalledWith(text);
    expect(a.fake.calls("patchRecord")).toHaveLength(0);
  });

  it("says the record changed elsewhere when the check finds a conflict", async () => {
    const a = draw({ over: { ensureEtagUnchanged: async () => ({ conflict: true }) } }, { editing: true, record: rec });
    remove();
    const text = "This changed elsewhere. The card now shows the latest; your change was not saved.";
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(a.onNotice).toHaveBeenLastCalledWith(text);
    expect(a.fake.calls("patchRecord")).toHaveLength(0);
  });

  it("maps a failure to its words: 403 to the vault sentence, any other message as it is, none to the rolled-back sentence", async () => {
    const cases: [unknown, string][] = [
      [new Error("PATCH failed: 403"), "You cannot write to this vault."],
      [new Error("code 4030 here"), "code 4030 here"],
      [new Error("Nope"), "Nope"],
      [new Error(""), "Couldn't save — your change was rolled back. Try again."],
      ["plain string", "Couldn't save — your change was rolled back. Try again."],
      [undefined, "Couldn't save — your change was rolled back. Try again."],
    ];
    for (const [thrown, words] of cases) {
      const a = draw({ over: { patchRecord: async () => Promise.reject(thrown) } }, { editing: true, record: rec });
      remove();
      expect((await screen.findByRole("alert")).textContent, String(words)).toBe(words);
      expect(a.onNotice).toHaveBeenLastCalledWith(words);
      cleanup();
    }
  });

  it("clears an old failure when the next action starts", async () => {
    let fail = true;
    const a = draw({ over: { patchRecord: async () => (fail ? Promise.reject(new Error("first")) : { etag: '"e2"' }) } }, { editing: true, record: rec });
    remove();
    expect((await screen.findByRole("alert")).textContent).toBe("first");
    fail = false;
    remove();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(a.fake.calls("patchRecord")).toHaveLength(2);
  });

  it("builds the patch from the fresh row and writes nothing when the fresh row differs in the field it touches", async () => {
    const fresh = (names: unknown) => ({ ...planRecord({ served: served({ stakeholders: names }) }), updatedAt: 2 }) as GridRecord;
    const check = (freshRow: GridRecord) => async (_pv: string, row: GridRecord, same: (f: GridRecord) => boolean) => (same(freshRow) ? { row: { ...row, etag: '"e9"' } } : { conflict: true as const });
    const a = draw({ over: { ensureEtagUnchanged: check(fresh(["Acme", "Beta"])) } }, { editing: true, record: rec });
    remove();
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("patchRecord")[0]!.args[4]).toEqual({ ifMatch: '"e9"' });
    cleanup();
    const b = draw({ over: { ensureEtagUnchanged: check(fresh(["Acme", "Gamma"])) } }, { editing: true, record: rec });
    remove();
    expect((await screen.findByRole("alert")).textContent).toContain("This changed elsewhere.");
    expect(b.fake.calls("patchRecord")).toHaveLength(0);
  });

  it("counts the same names written another way as the same, and a changed name as a change", async () => {
    const run = async (before: unknown, after: unknown) => {
      const base = planRecord({ served: served({ stakeholders: before }) });
      const fresh = { ...planRecord({ served: served({ stakeholders: after }) }), updatedAt: 2 } as GridRecord;
      const a = draw({ over: { ensureEtagUnchanged: async (_p: string, row: GridRecord, same: (f: GridRecord) => boolean) => (same(fresh) ? { row } : { conflict: true as const }) } }, { editing: true, record: base });
      fireEvent.click(screen.getAllByRole("button", { name: /^Remove / })[0]!);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      const wrote = a.fake.calls("patchRecord").length === 1;
      cleanup();
      return wrote;
    };
    expect(await run(["Acme"], ["Acme"])).toBe(true);
    expect(await run(["Acme"], ["Zed"])).toBe(false);
    expect(await run(["Acme", "Beta"], ["Beta", "Acme"])).toBe(false);
  });
});

describe("the host is required", () => {
  it("throws, naming the context, when there is no provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PlanStakeholders record={planRecord()} vaultId={VAULT} editing={false} onOpen={() => {}} onNotice={() => {}} />)).toThrow(
      "plan-stakeholder-lines: wrap the app in <StakeholderLinesHostContext.Provider value={host}>",
    );
    quiet.mockRestore();
  });

  it("reads the context object the unit exports", () => {
    const fake = makeFake();
    render(
      <StakeholderLinesHostContext.Provider value={fake.host}>
        <fake.Frame>
          <PlanStakeholders record={planRecord()} vaultId={VAULT} editing={false} onOpen={() => {}} onNotice={() => {}} />
        </fake.Frame>
      </StakeholderLinesHostContext.Provider>,
    );
    expect(screen.getByTestId("plan-stakeholders")).toBeTruthy();
  });

  it("uses the card's vault for the record's vault when none is given", async () => {
    const fake = makeFake({ records: PEOPLE, hits: [hit("ann", "Ann")] });
    render(<PlanStakeholders record={planRecord()} vaultId={VAULT} editing onOpen={() => {}} onNotice={() => {}} />, { wrapper: fake.Frame });
    fireEvent.focus(search());
    fireEvent.click(await screen.findByRole("button", { name: "Ann" }));
    await waitFor(() => expect(fake.calls("writePairRelation")).toHaveLength(1));
    expect((fake.calls("writePairRelation")[0]!.args[0] as { vaultNamespace: string }).vaultNamespace).toBe(VAULT);
  });
});
