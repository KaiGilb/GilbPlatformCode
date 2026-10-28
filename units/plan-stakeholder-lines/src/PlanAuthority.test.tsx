import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { CONSTRAINT_AUTHORITY_WHY, CONSTRAINT_LAST_PERSON, type StakeholderTypeSet } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { PlanAuthority } from "./index";
import { PLAN_VAULT, REC_ID, REC_URI, VAULT, hit, link, makeFake, person, planRecord, relUri, served, uriOf, type FakeOptions } from "../test/fakeHost";

afterEach(cleanup);

const ST = "t:StakeholderOf" as const;
const AU = "t:AuthorityOf" as const;
const RO = "t:ResourceOwnerOf" as const;
const RESOURCE = "https://pv.example.test/base/t/Resource";
const ORG = "https://h.example.test/base/t/Organization";
const PEOPLE = [person("ann", "Ann"), person("bob", "Bob"), person("cy", "Cy"), person("org1", "Acme Org", { typeUri: ORG }), person("new1", "New One")];
const ANN_RELATION = [link(AU, relUri(2), uriOf("ann"))];
const ANN_DOC = { [relUri(2)]: { uri: relUri(2), extras: { "a:authorityActsFor": { "@id": uriOf("org1") } } } };

type Props = Partial<Parameters<typeof PlanAuthority>[0]>;
function draw(o: FakeOptions = {}, props: Props = {}) {
  const fake = makeFake({ records: PEOPLE, hits: [hit("ann", "Ann"), hit("bob", "Bob"), hit("org1", "Acme Org", "Organization")], anyHits: [hit("org1", "Acme Org", "Organization"), hit("cy", "Cy")], ...o });
  const onOpen = vi.fn();
  const onNotice = vi.fn();
  const onPicked = vi.fn();
  const ui = (p: Props = {}): ReactNode => (
    <PlanAuthority record={planRecord()} vaultId={VAULT} planVault={PLAN_VAULT} editing={false} onOpen={onOpen} onNotice={onNotice} onPicked={onPicked} {...props} {...p} />
  );
  const view = render(ui(), { wrapper: fake.Frame });
  return { fake, onOpen, onNotice, onPicked, view, ui };
}
const box = (name = "Authority") => screen.getByRole("textbox", { name });
async function pick(name: string, boxName = "Authority") {
  fireEvent.focus(box(boxName));
  const hits = await screen.findAllByTestId("org-record-hit");
  fireEvent.click(hits.find((h) => h.firstChild?.textContent === name)!);
}
const seq = (fake: ReturnType<typeof makeFake>, of: string[]) => fake.log.map((c) => c.fn).filter((n) => of.includes(n));
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};
const input = (stakeholder: string, more: Record<string, unknown> = {}) => ({ recordId: REC_ID, recordUri: REC_URI, stakeholderUri: stakeholder, vaultId: PLAN_VAULT, ...more });
const wrote = (relation: string, type: string, member: string) => ({ relation, role: "role:referenced-by", type, members: [{ member, role: "role:stakeholder" }] });

describe("what the Authority line shows", () => {
  it("shows each Authority as a chip with its acts-for read from the relation document", () => {
    const a = draw({ relations: [...ANN_RELATION, link(AU, relUri(4), uriOf("bob"))], docs: ANN_DOC });
    const root = screen.getByTestId("plan-authority");
    const annChip = root.querySelector(`[data-authority-for="${uriOf("ann")}"]`)!;
    expect(within(annChip as HTMLElement).getByRole("button", { name: "Ann" })).toBeTruthy();
    expect(within(annChip as HTMLElement).getByText("acts for")).toBeTruthy();
    expect(within(annChip as HTMLElement).getByRole("button", { name: "Acme Org" })).toBeTruthy();
    const bobChip = root.querySelector(`[data-authority-for="${uriOf("bob")}"]`)!;
    expect(within(bobChip as HTMLElement).queryByText("acts for")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    expect(a.fake.calls("liveRow")).toHaveLength(0);
  });

  it("reads the relation document of each relation, and nothing for the older holder", () => {
    const seen: unknown[][] = [];
    draw(
      { relations: ANN_RELATION, over: { useRelationDoc: (...args: [string | null, string]) => (seen.push(args), { data: null }) } },
      { record: planRecord({ served: served({ authorityHolder: { "@id": uriOf("cy") } }) }) },
    );
    expect(seen).toContainEqual([relUri(2), PLAN_VAULT]);
    expect(seen).toContainEqual([null, PLAN_VAULT]);
  });

  it("asks the host for the person Authorities with the record and the card's vault", () => {
    const rec = planRecord();
    const seen: unknown[][] = [];
    draw({ over: { usePersonAuthorities: (...args: [unknown, string]) => (seen.push(args), { people: [] }) } }, { record: rec });
    expect(seen[0]![0]).toBe(rec);
    expect(seen[0]![1]).toBe(VAULT);
  });

  it("opens an Authority's record, and the record it acts for", () => {
    const a = draw({ relations: ANN_RELATION, docs: ANN_DOC });
    fireEvent.click(screen.getByRole("button", { name: "Ann" }));
    fireEvent.click(screen.getByRole("button", { name: "Acme Org" }));
    expect(a.onOpen.mock.calls).toEqual([["ann"], ["org1"]]);
  });

  it("shows the older record-level holder with the acts-for it carries, unless a relation already names that person", () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("cy") }, authorityActsFor: { "@id": uriOf("org1") } }) });
    const a = draw({}, { record: rec });
    const chip = screen.getByTestId("plan-authority").querySelector(`[data-authority-for="${uriOf("cy")}"]`) as HTMLElement;
    expect(within(chip).getByRole("button", { name: "Cy" })).toBeTruthy();
    expect(within(chip).getByRole("button", { name: "Acme Org" })).toBeTruthy();
    a.view.unmount();
    draw({ relations: [link(AU, relUri(6), uriOf("cy"))] }, { record: rec });
    expect(screen.getAllByRole("button", { name: "Cy" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Acme Org" })).toBeNull();
  });

  it("shows the older Authority text, read-only unless the picker is shown, and says nothing when there is none", () => {
    const rec = planRecord({ served: served({ authority: "  The Board  " }) });
    const a = draw({}, { record: rec });
    expect(screen.getByText("The Board")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Edit Authority text" }) as HTMLButtonElement).disabled).toBe(true);
    a.view.unmount();
    const b = draw({}, { record: planRecord({ served: served({ authority: "   " }) }) });
    expect(screen.getByTestId("plan-authority").children).toHaveLength(0);
    b.view.unmount();
    draw({}, { record: planRecord({ served: served({ authority: 5 }) }) });
    expect(screen.getByTestId("plan-authority").children).toHaveLength(0);
  });

  it("says the read failed only when there is nothing to show", () => {
    const a = draw({ relationsError: true });
    expect(screen.getByText("Could not read stakeholders.")).toBeTruthy();
    a.view.unmount();
    draw({ relationsError: true, relations: ANN_RELATION });
    expect(screen.queryByText("Could not read stakeholders.")).toBeNull();
  });

  it("is a Resource Owner line when asked: its own test id, only the owners, no older holder or text", () => {
    const rec = planRecord({ typeUri: RESOURCE, served: served({ authorityHolder: { "@id": uriOf("cy") }, authority: "The Board" }) });
    draw({ relations: [...ANN_RELATION, link(RO, relUri(3), uriOf("bob"))] }, { record: rec, resourceOwner: true });
    const root = screen.getByTestId("plan-resource-owner");
    expect(screen.queryByTestId("plan-authority")).toBeNull();
    expect(within(root).getByRole("button", { name: "Bob" })).toBeTruthy();
    expect(within(root).queryByRole("button", { name: "Ann" })).toBeNull();
    expect(within(root).queryByRole("button", { name: "Cy" })).toBeNull();
    expect(within(root).queryByText("The Board")).toBeNull();
  });
});

describe("the picker", () => {
  it("is shown while editing or when offered, labelled with the word of the line", () => {
    const a = draw();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ New stakeholder" })).toBeNull();
    a.view.rerender(a.ui({ offer: true }));
    expect(box().getAttribute("placeholder")).toBe("Search stakeholders");
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
    a.view.rerender(a.ui({ editing: true, offer: false }));
    expect(screen.queryByRole("textbox")).toBeNull();
    a.view.rerender(a.ui({ editing: true, resourceOwner: true }));
    expect(box("Resource Owner")).toBeTruthy();
  });

  it("searches under the key of its role: authority, or owner", async () => {
    const a = draw({}, { editing: true });
    fireEvent.focus(box());
    await screen.findAllByTestId("org-record-hit");
    expect(a.fake.pickerKeys.at(-1)).toEqual(["stakeholder-search", "authority", "v1|v2", ""]);
    expect(a.fake.calls("findStakeholders")[0]!.args).toEqual([["v1", "v2"], ["Person", "Organization"], ""]);
    a.view.unmount();
    const b = draw({}, { editing: true, resourceOwner: true });
    fireEvent.focus(box("Resource Owner"));
    await screen.findAllByTestId("org-record-hit");
    expect(b.fake.pickerKeys.at(-1)).toEqual(["stakeholder-search", "owner", "v1|v2", ""]);
  });

  it("does not offer people already holding the line, nor the older holder", async () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("bob") } }) });
    draw({ relations: ANN_RELATION }, { editing: true, record: rec });
    fireEvent.focus(box());
    await screen.findAllByTestId("org-record-hit");
    const list = within(screen.getByTestId("org-record-hits"));
    expect(list.queryByRole("button", { name: "Ann" })).toBeNull();
    expect(list.queryByRole("button", { name: "Bob" })).toBeNull();
    expect(list.getByRole("button", { name: "Acme Org" })).toBeTruthy();
  });

  it("Try again drops the cached search of its role", async () => {
    const half = async () => ({ hits: [], complete: false, vaultsMissed: false });
    const a = draw({ over: { findStakeholders: half } }, { editing: true, resourceOwner: true });
    fireEvent.focus(box("Resource Owner"));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(a.fake.calls("invalidateSearch")[0]!.args).toEqual([{ queryKey: ["stakeholder-search", "owner", "v1|v2", ""] }]);
  });
});

describe("adding an Authority", () => {
  it("writes ONE Authority relation, then sets the relations with it added", async () => {
    const a = draw({ relations: [link(AU, relUri(9), uriOf("cy"))] }, { editing: true });
    await pick("Ann");
    await waitFor(() => expect(a.onNotice).toHaveBeenLastCalledWith(null));
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1);
    expect(a.fake.calls("writeAuthorityRelation")[0]!.args[0]).toStrictEqual(input(uriOf("ann")));
    expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(0);
    expect(seq(a.fake, ["liveRow", "getRelations", "writeAuthorityRelation", "setRelations"])).toEqual(["liveRow", "getRelations", "writeAuthorityRelation", "setRelations"]);
    expect(a.fake.relationsNow()).toEqual([link(AU, relUri(9), uriOf("cy")), wrote(relUri("a1"), "t:AuthorityOf", uriOf("ann"))]);
    expect(a.onPicked).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Ann" })).toBeTruthy();
  });

  it("writes the Resource Owner type for a Resource Owner line, and the owners show", async () => {
    const a = draw({}, { editing: true, resourceOwner: true, record: planRecord({ typeUri: RESOURCE }) });
    await pick("Ann", "Resource Owner");
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
    expect(a.fake.calls("writeAuthorityRelation")[0]!.args[0]).toStrictEqual(input(uriOf("ann"), { relationType: "t:ResourceOwnerOf" }));
    expect(a.fake.relationsNow()).toEqual([wrote(relUri("a1"), "t:ResourceOwnerOf", uriOf("ann"))]);
    expect(await screen.findByRole("button", { name: "Ann" })).toBeTruthy();
  });

  it("ends the plain stakeholder link of the same person first, then writes the Authority, and drops the plain one", async () => {
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann")), link(ST, relUri(5), uriOf("bob"))] }, { editing: true });
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(1));
    expect(a.fake.calls("endThenWriteAuthority")[0]!.args).toStrictEqual([relUri(1), input(uriOf("ann"))]);
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(0);
    expect(a.fake.relationsNow()).toEqual([link(ST, relUri(5), uriOf("bob")), wrote(relUri("a1"), "t:AuthorityOf", uriOf("ann"))]);
  });

  it("does the same on a Resource Owner line, with the Resource Owner type", async () => {
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann"))] }, { editing: true, resourceOwner: true });
    await pick("Ann", "Resource Owner");
    await waitFor(() => expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(1));
    expect(a.fake.calls("endThenWriteAuthority")[0]!.args).toStrictEqual([relUri(1), input(uriOf("ann"), { relationType: "t:ResourceOwnerOf" })]);
  });

  it("reads the relations the app holds now, falling back to the ones drawn", async () => {
    const a = draw({ relations: [link(ST, relUri(1), uriOf("ann"))], over: { getRelations: () => undefined } }, { editing: true });
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(1));
    cleanup();
    const b = draw({}, { editing: true });
    fireEvent.focus(box());
    const hits = await screen.findAllByTestId("org-record-hit");
    b.fake.store.set(`${REC_ID}|${REC_URI}`, [link(ST, relUri(7), uriOf("ann"))]);
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Ann")!);
    await waitFor(() => expect(b.fake.calls("endThenWriteAuthority")).toHaveLength(1));
    expect(b.fake.calls("endThenWriteAuthority")[0]!.args[0]).toBe(relUri(7));
  });

  it("picking the same person twice before the first write answers writes once", async () => {
    const gate = deferred<ReturnType<typeof wrote>>();
    const a = draw({ over: { writeAuthorityRelation: () => gate.promise } }, { editing: true });
    fireEvent.focus(box());
    const button = (await screen.findAllByTestId("org-record-hit")).find((h) => h.firstChild?.textContent === "Ann")!;
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1);
    await act(async () => gate.resolve(wrote(relUri("a9"), "t:AuthorityOf", uriOf("ann"))));
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1);
    expect(a.fake.relationsNow()).toHaveLength(1);
  });

  it("writes nothing for a person who already holds the line, and does not complain", async () => {
    const made = (id: string) => ({
      renderCreateStakeholder: (p: { onCreated: (id: string) => void }) => (
        <button type="button" onClick={() => p.onCreated(id)}>
          made
        </button>
      ),
    });
    const a = draw({ relations: ANN_RELATION, over: made(uriOf("ann")) }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "made" }));
    await waitFor(() => expect(a.onNotice).toHaveBeenLastCalledWith(null));
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(0);
    expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(0);
    expect(a.fake.calls("patchRecord")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("bob") } }) });
    const b = draw({ over: made(uriOf("bob")) }, { editing: true, record: rec });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "made" }));
    await waitFor(() => expect(b.onNotice).toHaveBeenLastCalledWith(null));
    expect(b.fake.calls("writeAuthorityRelation")).toHaveLength(0);
  });

  it("counts a Resource Owner line's own holders only: an Authority of the same person does not block an owner", async () => {
    const a = draw({ relations: ANN_RELATION }, { editing: true, resourceOwner: true });
    await pick("Ann", "Resource Owner");
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
  });

  it("does not count the older holder on a Resource Owner line", async () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("ann") } }) });
    const a = draw({}, { editing: true, resourceOwner: true, record: rec });
    await pick("Ann", "Resource Owner");
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
  });

  it("shows a failed write's sentence and tells the card", async () => {
    const a = draw({ over: { writeAuthorityRelation: async () => Promise.reject(new Error("HTTP 500 down")) } }, { editing: true });
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("HTTP 500 down");
    expect(a.onNotice).toHaveBeenLastCalledWith("HTTP 500 down");
    expect(a.fake.relationsNow()).toBeUndefined();
  });
});

describe("the older Authority text", () => {
  const rec = () => planRecord({ served: served({ authority: "The Board" }) });

  it("Link opens the box with the text; linking a person writes the relation, then clears the text with the version check", async () => {
    const a = draw({}, { editing: true, record: rec() });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect((box() as HTMLInputElement).value).toBe("The Board");
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(seq(a.fake, ["writeAuthorityRelation", "setRelations", "ensureEtagUnchanged", "patchRecord"])).toEqual(["writeAuthorityRelation", "setRelations", "ensureEtagUnchanged", "patchRecord"]);
    const args = a.fake.calls("patchRecord")[0]!.args;
    expect(args.slice(0, 3)).toEqual([REC_ID, { authority: null }, REC_URI]);
    expect(args[3]).toBeUndefined();
    expect(args[4]).toEqual({ ifMatch: '"e1"' });
  });

  it("clears the text once: the next person linked does not clear it again", async () => {
    const a = draw({}, { editing: true, record: rec() });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await pick("Ann");
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    await pick("Bob");
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(2));
    expect(a.fake.calls("patchRecord")).toHaveLength(1);
  });

  it("clears the text, and writes no relation, when the person already holds the line", async () => {
    const over = {
      renderCreateStakeholder: (p: { onCreated: (id: string) => void }) => (
        <button type="button" onClick={() => p.onCreated(uriOf("ann"))}>
          made
        </button>
      ),
    };
    const a = draw({ relations: ANN_RELATION, over }, { editing: true, record: rec() });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "made" }));
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(0);
    expect(a.fake.calls("patchRecord")[0]!.args[1]).toEqual({ authority: null });
  });

  it("keeps the new relation and shows the failure when clearing the text fails", async () => {
    const a = draw({ over: { patchRecord: async () => Promise.reject(new Error("boom")) } }, { editing: true, record: rec() });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await pick("Ann");
    expect((await screen.findByRole("alert")).textContent).toBe("boom");
    expect(a.fake.calls("endRelation")).toHaveLength(0);
    expect(a.fake.relationsNow()).toHaveLength(1);
    expect(a.onNotice).toHaveBeenLastCalledWith("boom");
  });

  it("is removed on its own, and edited in place: a new text is saved trimmed, an empty one clears", async () => {
    const a = draw({}, { editing: true, record: rec() });
    fireEvent.click(screen.getByRole("button", { name: "Remove The Board" }));
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("patchRecord")[0]!.args[1]).toEqual({ authority: null });
    expect(a.onNotice).toHaveBeenLastCalledWith(null);
    cleanup();
    const b = draw({}, { editing: true, record: rec() });
    fireEvent.click(screen.getByRole("button", { name: "Edit Authority text" }));
    const field = screen.getByRole("textbox", { name: "Edit Authority text" });
    fireEvent.change(field, { target: { value: "  The Council  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(b.fake.calls("patchRecord")).toHaveLength(1));
    expect(b.fake.calls("patchRecord")[0]!.args[1]).toEqual({ authority: "The Council" });
    cleanup();
    const c = draw({}, { editing: true, record: rec() });
    fireEvent.click(screen.getByRole("button", { name: "Edit Authority text" }));
    const emptied = screen.getByRole("textbox", { name: "Edit Authority text" });
    fireEvent.change(emptied, { target: { value: "" } });
    fireEvent.keyDown(emptied, { key: "Enter" });
    await waitFor(() => expect(c.fake.calls("patchRecord")).toHaveLength(1));
    expect(c.fake.calls("patchRecord")[0]!.args[1]).toEqual({ authority: null });
  });

  it("shows the text as a plain value, not editable, when only the picker is offered or the card is read-only", () => {
    draw({}, { editing: false, record: rec() });
    expect((screen.getByRole("button", { name: "Edit Authority text" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove The Board" })).toBeNull();
    cleanup();
    draw({}, { editing: false, offer: true, record: rec() });
    expect((screen.getByRole("button", { name: "Edit Authority text" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Remove The Board" })).toBeNull();
  });

  it("in a card in presentation mode, reads as text with no control", () => {
    const fake = makeFake({ records: PEOPLE });
    render(
      <CardModeProvider canEdit>
        <PlanAuthority record={rec()} vaultId={VAULT} planVault={PLAN_VAULT} editing={false} onOpen={() => {}} onNotice={() => {}} />
      </CardModeProvider>,
      { wrapper: fake.Frame },
    );
    expect(screen.getByText("The Board")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove|Link/ })).toBeNull();
  });
});

describe("acts for", () => {
  it("is searched across every kind of record, under its own key, and the one already chosen is not offered", async () => {
    const a = draw({ relations: ANN_RELATION, docs: ANN_DOC }, { editing: true });
    fireEvent.focus(screen.getByRole("textbox", { name: "Acts for Ann" }));
    await waitFor(() => expect(a.fake.calls("findAnyRecords")).toHaveLength(1));
    expect(a.fake.calls("findAnyRecords")[0]!.args).toEqual([["v1", "v2"], ""]);
    expect(a.fake.pickerKeys.some((k) => JSON.stringify(k) === JSON.stringify(["stakeholder-search", "acts", "v1|v2", ""]))).toBe(true);
    await screen.findByRole("button", { name: "Cy" });
    expect(within(screen.getAllByTestId("org-record-hits")[0]!).queryByRole("button", { name: "Acme Org" })).toBeNull();
  });

  it("is set by ending the relation and writing it again with the acts-for, then swapping them in the relations", async () => {
    const a = draw({ relations: [...ANN_RELATION, link(AU, relUri(4), uriOf("bob"))], over: {} }, { editing: true });
    fireEvent.focus(screen.getByRole("textbox", { name: "Acts for Ann" }));
    const hits = await screen.findAllByTestId("org-record-hit");
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Cy")!);
    await waitFor(() => expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(1));
    expect(a.fake.calls("endThenWriteAuthority")[0]!.args).toStrictEqual([relUri(2), input(uriOf("ann"), { actsFor: uriOf("cy") })]);
    expect(a.fake.relationsNow()).toEqual([link(AU, relUri(4), uriOf("bob")), wrote(relUri("a1"), "t:AuthorityOf", uriOf("ann"))]);
    expect(a.onPicked).toHaveBeenCalledTimes(1);
    expect(a.onNotice).toHaveBeenLastCalledWith(null);
  });

  it("is removed with its own control, writing the Authority again with acts-for null", async () => {
    const a = draw({ relations: ANN_RELATION, docs: ANN_DOC }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove acts for Ann" }));
    await waitFor(() => expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(1));
    expect(a.fake.calls("endThenWriteAuthority")[0]!.args).toStrictEqual([relUri(2), input(uriOf("ann"), { actsFor: null })]);
  });

  it("keeps the Resource Owner type when a Resource Owner's acts-for changes", async () => {
    const a = draw({ relations: [link(RO, relUri(3), uriOf("bob"))] }, { editing: true, resourceOwner: true });
    fireEvent.focus(screen.getByRole("textbox", { name: "Acts for Bob" }));
    const hits = await screen.findAllByTestId("org-record-hit");
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Cy")!);
    await waitFor(() => expect(a.fake.calls("endThenWriteAuthority")).toHaveLength(1));
    expect(a.fake.calls("endThenWriteAuthority")[0]!.args).toStrictEqual([relUri(3), input(uriOf("bob"), { actsFor: uriOf("cy"), relationType: "t:ResourceOwnerOf" })]);
  });

  it("shows the acts-for row only when there is one or the picker is shown, and the picker only then", () => {
    const a = draw({ relations: ANN_RELATION });
    expect(screen.queryByText("acts for")).toBeNull();
    a.view.rerender(a.ui({ offer: true }));
    expect(screen.getByText("acts for")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Acts for Ann" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Ann" })).toBeNull();
  });

  it("is changed on the older holder by writing a relation, then clearing both record keys", async () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("cy") }, authorityActsFor: { "@id": uriOf("org1") } }) });
    const a = draw({ anyHits: [hit("org1", "Acme Org", "Organization"), hit("bob", "Bob")] }, { editing: true, record: rec });
    fireEvent.focus(screen.getByRole("textbox", { name: "Acts for Cy" }));
    const hits = await screen.findAllByTestId("org-record-hit");
    expect(hits.map((h) => h.firstChild?.textContent)).toEqual(["Bob"]);
    fireEvent.click(hits[0]!);
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("writeAuthorityRelation")[0]!.args[0]).toStrictEqual(input(uriOf("cy"), { actsFor: uriOf("bob") }));
    expect(a.fake.calls("patchRecord")[0]!.args[1]).toEqual({ authorityHolder: null, authorityActsFor: null });
    expect(seq(a.fake, ["writeAuthorityRelation", "setRelations", "patchRecord"])).toEqual(["writeAuthorityRelation", "setRelations", "patchRecord"]);
    expect(a.fake.relationsNow()).toEqual([wrote(relUri("a1"), "t:AuthorityOf", uriOf("cy"))]);
  });

  it("is removed from the older holder by clearing the record's acts-for key only", async () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("cy") }, authorityActsFor: { "@id": uriOf("org1") } }) });
    const a = draw({}, { editing: true, record: rec });
    fireEvent.click(screen.getByRole("button", { name: "Remove acts for Cy" }));
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("patchRecord")[0]!.args[1]).toEqual({ authorityActsFor: null });
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(0);
  });

  it("does nothing for the older holder when the live record no longer has one", async () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("cy") } }) });
    const a = draw({ row: { served: served({}) } }, { editing: true, record: rec });
    fireEvent.focus(screen.getByRole("textbox", { name: "Acts for Cy" }));
    const hits = await screen.findAllByTestId("org-record-hit");
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Acme Org")!);
    await waitFor(() => expect(a.onNotice).toHaveBeenLastCalledWith(null));
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(0);
    expect(a.fake.calls("patchRecord")).toHaveLength(0);
  });

  it("shows the failure of an acts-for change", async () => {
    const a = draw({ relations: ANN_RELATION, over: { endThenWriteAuthority: async () => Promise.reject(new Error("HTTP 403")) } }, { editing: true });
    fireEvent.focus(screen.getByRole("textbox", { name: "Acts for Ann" }));
    const hits = await screen.findAllByTestId("org-record-hit");
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Cy")!);
    expect((await screen.findByRole("alert")).textContent).toBe("You cannot write to this vault.");
    expect(a.fake.relationsNow()).toEqual(ANN_RELATION);
  });
});

describe("removing an Authority", () => {
  it("ends the relation in the record's vault and drops it from the relations", async () => {
    const a = draw({ relations: [...ANN_RELATION, link(AU, relUri(4), uriOf("bob"))] }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    await waitFor(() => expect(a.fake.relationsNow()).toEqual([link(AU, relUri(4), uriOf("bob"))]));
    expect(a.fake.calls("endRelation")).toEqual([{ fn: "endRelation", args: [relUri(2), PLAN_VAULT] }]);
    expect(a.onNotice).toHaveBeenLastCalledWith(null);
    expect(a.fake.calls("getKindSet")).toHaveLength(0);
  });

  it("removes the older holder by clearing both record keys", async () => {
    const rec = planRecord({ served: served({ authorityHolder: { "@id": uriOf("cy") } }) });
    const a = draw({}, { editing: true, record: rec });
    fireEvent.click(screen.getByRole("button", { name: "Remove Cy" }));
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("patchRecord")[0]!.args[1]).toEqual({ authorityHolder: null, authorityActsFor: null });
  });

  it("holds the controls while a change runs", async () => {
    const gate = deferred<unknown>();
    draw({ relations: ANN_RELATION, over: { endRelation: () => gate.promise } }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Remove Ann" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "+ New stakeholder" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => gate.resolve(undefined));
  });
});

describe("a constraint: only a person may be chosen", () => {
  const TYPES: StakeholderTypeSet = {
    names: ["Person", "Organization"],
    complete: true,
    types: [
      { term: "term:person", name: "Person", label: "Person" },
      { term: "term:org", name: "Organization", label: "Organization" },
    ],
  };
  const UNDER: StakeholderTypeSet = { ...TYPES, types: [TYPES.types[0]!, { term: "term:org", name: "Organization", label: "Organization", parents: ["term:person"] }] };

  it("marks every hit that is not a person and refuses it on the pick, with the sentence and no write", async () => {
    const a = draw({ kinds: TYPES }, { editing: true, personOnly: true });
    fireEvent.focus(box());
    const hits = await screen.findAllByTestId("org-record-hit");
    expect(hits).toHaveLength(3);
    const acme = hits.find((h) => h.firstChild?.textContent === "Acme Org")!;
    expect(acme.textContent).toContain("not a person");
    expect(hits.find((h) => h.firstChild?.textContent === "Ann")!.textContent).not.toContain("not a person");
    fireEvent.click(acme);
    expect((await screen.findByRole("alert")).textContent).toBe(CONSTRAINT_AUTHORITY_WHY);
    expect(a.onNotice).toHaveBeenLastCalledWith(CONSTRAINT_AUTHORITY_WHY);
    expect(a.onPicked).not.toHaveBeenCalled();
    expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(0);
  });

  it("marks a hit with no type as not a person, and lets a person through", async () => {
    const a = draw({ kinds: TYPES, hits: [{ uri: uriOf("ann"), label: "Ann", typeName: "Person" }, { uri: uriOf("zed"), label: "Zed" }] }, { editing: true, personOnly: true });
    fireEvent.focus(box());
    const hits = await screen.findAllByTestId("org-record-hit");
    expect(hits.find((h) => h.firstChild?.textContent === "Zed")!.textContent).toContain("not a person");
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Ann")!);
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
    expect(a.onPicked).toHaveBeenCalledTimes(1);
  });

  it("without the flag the hits are as the search gave them and any record may be chosen", async () => {
    const a = draw({ kinds: TYPES }, { editing: true });
    fireEvent.focus(box());
    const hits = await screen.findAllByTestId("org-record-hit");
    expect(hits.every((h) => !h.textContent!.includes("not a person"))).toBe(true);
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Acme Org")!);
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
    expect(a.fake.calls("getKindSet")).toHaveLength(0);
  });

  it("judges the pick by the kinds the app holds at click time, not those drawn", async () => {
    const a = draw({ kinds: TYPES, over: { getKindSet: () => UNDER } }, { editing: true, personOnly: true });
    fireEvent.focus(box());
    const hits = await screen.findAllByTestId("org-record-hit");
    const acme = hits.find((h) => h.firstChild?.textContent === "Acme Org")!;
    expect(acme.textContent).toContain("not a person");
    fireEvent.click(acme);
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
    expect(a.fake.calls("getKindSet")).toHaveLength(1);
  });

  it("falls back to the drawn kinds when the app holds none at click time", async () => {
    const a = draw({ kinds: UNDER, over: { getKindSet: () => undefined } }, { editing: true, personOnly: true });
    fireEvent.focus(box());
    const hits = await screen.findAllByTestId("org-record-hit");
    fireEvent.click(hits.find((h) => h.firstChild?.textContent === "Acme Org")!);
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
  });

  it("refuses to remove the last person Authority, and removes one of several or one who is not a person", async () => {
    const relations = [link(AU, relUri(2), uriOf("ann")), link(AU, relUri(4), uriOf("org1"))];
    const a = draw({ relations, people: [{ uri: uriOf("ann") }] }, { editing: true, personOnly: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    const shown = (await screen.findByRole("alert")).textContent!;
    expect(shown).toBe(a.onNotice.mock.calls.at(-1)![0]);
    expect(shown).toBe(CONSTRAINT_LAST_PERSON);
    expect(a.fake.calls("endRelation")).toHaveLength(0);
    expect(a.fake.relationsNow()).toEqual(relations);
    fireEvent.click(screen.getByRole("button", { name: "Remove Acme Org" }));
    await waitFor(() => expect(a.fake.calls("endRelation")).toHaveLength(1));
    expect(a.fake.calls("endRelation")[0]!.args[0]).toBe(relUri(4));
  });

  it("removes one of two person Authorities, and removes the last one when the line is not a constraint's", async () => {
    const two = draw({ relations: [link(AU, relUri(2), uriOf("ann")), link(AU, relUri(4), uriOf("bob"))], people: [{ uri: uriOf("ann") }, { uri: uriOf("bob") }] }, { editing: true, personOnly: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    await waitFor(() => expect(two.fake.calls("endRelation")).toHaveLength(1));
    cleanup();
    const last = draw({ relations: ANN_RELATION, people: [{ uri: uriOf("ann") }] }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann" }));
    await waitFor(() => expect(last.fake.calls("endRelation")).toHaveLength(1));
  });

  it("judges a record made in the dialog by its type: an id is read in the record's vault, an address in itself, only for a constraint", async () => {
    const made = (id: string) => ({
      renderCreateStakeholder: (p: { onCreated: (id: string) => void }) => (
        <button type="button" onClick={() => p.onCreated(id)}>
          made
        </button>
      ),
    });
    const run = async (id: string, personOnly: boolean, over: FakeOptions["over"] = {}) => {
      const a = draw({ kinds: TYPES, over: { ...made(id), ...over } }, { editing: true, personOnly });
      fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
      fireEvent.click(screen.getByRole("button", { name: "made" }));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
      return a;
    };
    const person1 = await run("new1", true);
    expect(person1.fake.calls("readRecord")[0]!.args).toEqual(["new1", PLAN_VAULT]);
    expect(person1.fake.calls("writeAuthorityRelation")).toHaveLength(1);
    expect(person1.fake.calls("writeAuthorityRelation")[0]!.args[0]).toMatchObject({ stakeholderUri: uriOf("new1") });
    cleanup();
    const org = await run("org1", true);
    expect(org.fake.calls("writeAuthorityRelation")).toHaveLength(0);
    expect(org.onNotice).toHaveBeenLastCalledWith(CONSTRAINT_AUTHORITY_WHY);
    expect(org.onPicked).not.toHaveBeenCalled();
    cleanup();
    const addr = await run(uriOf("org1"), true, { readRecord: async (id: string) => PEOPLE.find((r) => r.entityUri === id) ?? null });
    expect(addr.fake.calls("readRecord")[0]!.args).toEqual([uriOf("org1"), uriOf("org1")]);
    expect(addr.fake.calls("writeAuthorityRelation")).toHaveLength(0);
    cleanup();
    const addrPerson = await run(uriOf("ann"), true, { readRecord: async (id: string) => PEOPLE.find((r) => r.entityUri === id) ?? null });
    expect(addrPerson.fake.calls("writeAuthorityRelation")).toHaveLength(1);
    cleanup();
    const free = await run(uriOf("org1"), false);
    expect(free.fake.calls("readRecord")).toHaveLength(0);
    expect(free.fake.calls("writeAuthorityRelation")).toHaveLength(1);
  });
});

describe("creating a new stakeholder", () => {
  it("drops the cached Authority searches, also on a Resource Owner line, and links the record made", async () => {
    const a = draw({}, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    expect(a.fake.calls("renderCreateStakeholder")[0]!.args[0]).toMatchObject({ open: true, stakeholders: true, source: null, drawnVaultIds: [VAULT, PLAN_VAULT] });
    fireEvent.click(screen.getByRole("button", { name: "created id" }));
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
    expect(a.fake.calls("invalidateSearch")[0]!.args).toEqual([{ queryKey: ["stakeholder-search", "authority"], refetchType: "active" }]);
    expect(a.fake.calls("writeAuthorityRelation")[0]!.args[0]).toMatchObject({ stakeholderUri: uriOf("new1") });
    cleanup();
    const b = draw({}, { editing: true, resourceOwner: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "created address" }));
    await waitFor(() => expect(b.fake.calls("writeAuthorityRelation")).toHaveLength(1));
    expect(b.fake.calls("invalidateSearch")[0]!.args).toEqual([{ queryKey: ["stakeholder-search", "authority"], refetchType: "active" }]);
    expect(b.fake.calls("writeAuthorityRelation")[0]!.args[0]).toMatchObject({ relationType: "t:ResourceOwnerOf", stakeholderUri: uriOf("new2") });
  });

  it("closes without linking", () => {
    draw({}, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "close dialog" }));
    expect(screen.queryByTestId("create-dialog")).toBeNull();
  });

  it("builds the address from the id and the record's vault when the record cannot be read", async () => {
    const a = draw({ over: { readRecord: async () => null } }, { editing: true });
    fireEvent.click(screen.getByRole("button", { name: "+ New stakeholder" }));
    fireEvent.click(screen.getByRole("button", { name: "created id" }));
    await waitFor(() => expect(a.fake.calls("writeAuthorityRelation")).toHaveLength(1));
    expect(a.fake.calls("writeAuthorityRelation")[0]!.args[0]).toMatchObject({ stakeholderUri: `${PLAN_VAULT}/e/new1` });
  });
});

describe("a host without writers", () => {
  it("is read-only: Edit and Offer show the Authorities and text, and no control that would write", () => {
    const rec = planRecord({ served: served({ authority: "The Board", authorityHolder: { "@id": uriOf("cy") } }) });
    const a = draw({ readOnly: true, relations: ANN_RELATION, docs: ANN_DOC }, { editing: true, offer: true, record: rec });
    expect(screen.getByRole("button", { name: "Ann" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cy" })).toBeTruthy();
    expect(screen.getByText("The Board")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove |Link|New stakeholder/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Edit Authority text" }) as HTMLButtonElement).disabled).toBe(true);
    expect(a.fake.calls("renderCreateStakeholder")).toHaveLength(0);
  });

  it("is read-only when only one of the writers is left out", () => {
    for (const left of ["endRelation", "writeAuthorityRelation", "endThenWriteAuthority", "patchRecord", "renderCreateStakeholder"] as const) {
      const a = draw({ over: { [left]: undefined } }, { editing: true });
      expect(screen.queryByRole("textbox"), left).toBeNull();
      a.view.unmount();
    }
  });

  it("does not need the stakeholder writer", () => {
    draw({ over: { writePairRelation: undefined } }, { editing: true });
    expect(box()).toBeTruthy();
  });
});

describe("the sentences", () => {
  const rec = planRecord({ served: served({ authority: "The Board" }) });
  const remove = () => fireEvent.click(screen.getByRole("button", { name: "Remove The Board" }));

  it("says the version could not be read, and that the record changed elsewhere", async () => {
    const a = draw({ over: { ensureEtagUnchanged: async () => ({ unreadable: true }) } }, { editing: true, record: rec });
    remove();
    const text = "This record's version could not be read, so the list was not saved. Reload and try again.";
    expect((await screen.findByRole("alert")).textContent).toBe(text);
    expect(a.onNotice).toHaveBeenLastCalledWith(text);
    cleanup();
    const b = draw({ over: { ensureEtagUnchanged: async () => ({ conflict: true }) } }, { editing: true, record: rec });
    remove();
    const other = "This changed elsewhere. The card now shows the latest; your change was not saved.";
    expect((await screen.findByRole("alert")).textContent).toBe(other);
    expect(b.onNotice).toHaveBeenLastCalledWith(other);
    expect(b.fake.calls("patchRecord")).toHaveLength(0);
  });

  it("maps a failure to its words", async () => {
    const cases: [unknown, string][] = [
      [new Error("PATCH failed: 403"), "You cannot write to this vault."],
      [new Error("Nope"), "Nope"],
      [new Error(""), "Couldn't save — your change was rolled back. Try again."],
      [42, "Couldn't save — your change was rolled back. Try again."],
    ];
    for (const [thrown, words] of cases) {
      const a = draw({ over: { patchRecord: async () => Promise.reject(thrown) } }, { editing: true, record: rec });
      remove();
      expect((await screen.findByRole("alert")).textContent, String(words)).toBe(words);
      expect(a.onNotice).toHaveBeenLastCalledWith(words);
      cleanup();
    }
  });

  it("sends the served source with the patch when the live record carries served keys", async () => {
    const a = draw({ row: { servedKeys: ["authority"] } }, { editing: true, record: rec });
    remove();
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("patchRecord")[0]!.args[3]).toEqual({ at: REC_URI, servedKeys: ["authority"] });
    const stored = a.fake.calls("storePlanRow")[0]!.args[1] as GridRecord;
    expect(stored.etag).toBe('"e2"');
  });

  it("builds the patch from the live row of the app, not the record drawn", async () => {
    const a = draw({ row: { etag: '"live"' } }, { editing: true, record: rec });
    remove();
    await waitFor(() => expect(a.fake.calls("patchRecord")).toHaveLength(1));
    expect(a.fake.calls("liveRow")[0]!.args[0]).toBe(PLAN_VAULT);
    expect(a.fake.calls("liveRow")[0]!.args[1]).toBe(REC_ID);
    expect(a.fake.calls("patchRecord")[0]!.args[4]).toEqual({ ifMatch: '"live"' });
  });
});
