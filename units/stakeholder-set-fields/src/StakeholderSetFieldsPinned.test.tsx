// The unit pinned alone: every export, the read-only mode of a host with no writer, the remove through the host (looked up when it runs),
// the add through the card-references hook, the withheld-add words, the link picker and the channel picker over a seeded query cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { stakeholderReferenceReadingQueryKey } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as unit from "./index";
import { AddInformationSheet, addInformation } from "../test/chooser";
import { SetField, StakeholderSetFields, StakeholderSetFieldsHostProvider, isChannelField, setFieldHasContent, setFieldKind, useStakeholderSetFieldsHost } from "./index";

const add = vi.hoisted(() => ({ calls: [] as unknown[][], result: null as null | ((input: unknown) => Promise<unknown>), pending: false, sets: [] as unknown[] }));
vi.mock("@kaigilb/gilbplatformcode-card-references", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kaigilb/gilbplatformcode-card-references")>();
  return {
    ...actual,
    useAddCardReference: (fieldSets: unknown) => {
      add.sets.push(fieldSets);
      return { mutateAsync: (input: unknown) => (add.calls.push([input]), add.result ? add.result(input) : Promise.resolve({})), isPending: add.pending };
    },
  };
});

const ORIGIN = "https://ontology.example.test";
const VAULT = "https://v.example.test/vault";
const CARRIER = "https://v.example.test/base/e/p1";
const GROUP = "https://v.example.test/base/e/g1";
const OTHER = "https://v.example.test/base/e/g2";

beforeEach(() => {
  setTermOrigin(ORIGIN);
  add.calls.length = 0;
  add.sets.length = 0;
  add.result = null;
  add.pending = false;
});
afterEach(() => {
  cleanup();
  resetTermOrigin();
  vi.unstubAllGlobals();
});

type FieldProp = Parameters<typeof SetField>[0]["field"];
const field = (name: string, over: Partial<FieldProp> = {}): FieldProp => ({
  term: `${ORIGIN}/base/t/${name}`,
  label: name,
  factKeys: [name.charAt(0).toLowerCase() + name.slice(1)],
  slug: null,
  writeKey: `a:${name.charAt(0).toLowerCase() + name.slice(1)}`,
  mode: "reference-add",
  rule: "membership",
  shownBecause: null,
  many: true,
  ...over,
});
const MEMBER = field("MemberOf");
const CHANNEL = field("PreferredChannel", { rule: "contact-term", label: "Preferred channel", many: false });
const KIND = { kind: "k", name: "Person", label: null, ancestors: [], fields: [] } as never;
const READING = { relations: [{ playerNames: ["Person"], groupName: "Club" }], party: { names: ["Person"], roleRecordName: "r", complete: true }, contactTypes: { terms: [`${ORIGIN}/base/t/Email`], complete: true } };
const FIELD_SETS = { byKind: {} } as never;

function client() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  qc.setQueryData(stakeholderReferenceReadingQueryKey(), READING);
  return qc;
}
const targetsKey = ["gilb-stakeholders", "link-targets", VAULT, "membership", "Person", "Club"];
const candidates = [
  { record: CARRIER, vaultId: VAULT, type: "t:Club", label: "Itself" },
  { record: GROUP, vaultId: VAULT, type: "t:Club", label: "Club One" },
  { record: OTHER, vaultId: VAULT, type: "t:Club", label: "Club Two" },
];

type Props = Partial<Parameters<typeof SetField>[0]>;
function setField(props: Props = {}, opts: { qc?: QueryClient; host?: unknown; editing?: boolean; noCardMode?: boolean } = {}) {
  const qc = opts.qc ?? client();
  // Outside a card there is no mode: the field is always editing and the Escape key is the picker's alone.
  const Mode = ({ children }: { children: ReactNode }) => (opts.noCardMode ? <>{children}</> : <CardModeProvider canEdit startEditing={opts.editing ?? true}>{children}</CardModeProvider>);
  const ui = (p: Props, host: unknown) => (
    <QueryClientProvider client={qc}>
      <RefLabelContext.Provider value={(r) => (r ? `Label of ${r.id}` : null)}>
        <Mode>
          <CardModeBar />
          <AddInformationSheet />
          <StakeholderSetFieldsHostProvider host={(host ?? {}) as never}>
            <SetField
              field={MEMBER}
              values={["kept"]}
              facts={{}}
              fieldSets={FIELD_SETS}
              canEdit
              holdingVault={VAULT}
              agent="agent-1"
              carrier={CARRIER}
              vaultId="v"
              recordId="r1"
              carrierKind={KIND}
              {...p}
            />
          </StakeholderSetFieldsHostProvider>
        </Mode>
      </RefLabelContext.Provider>
    </QueryClientProvider>
  );
  const r = render(ui(props, opts.host));
  return { qc, ...r, again: (p: Props, host?: unknown) => r.rerender(ui({ ...props, ...p }, host ?? opts.host)) };
}
/** A group with nothing stored is not drawn until the chooser opens it, as a person does. */
const openGroup = (label: string) => addInformation(label);
/** A fake host writer: it runs the change on what it "stored" and records every call. */
function writer(stored: unknown[] = [GROUP, OTHER]) {
  const calls: unknown[][] = [];
  const changeRecordFactItems = vi.fn(async (...args: unknown[]) => {
    calls.push(args);
    const change = args[3] as (s: readonly unknown[]) => unknown[];
    return change(stored);
  });
  return { changeRecordFactItems: changeRecordFactItems as never, calls, fn: changeRecordFactItems };
}

describe("exports", () => {
  it("is exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual(["SetField", "StakeholderSetFields", "StakeholderSetFieldsHostProvider", "isChannelField", "setFieldHasContent", "setFieldKind", "useStakeholderSetFieldsHost"]);
  });
});

describe("the pure parts", () => {
  it("isChannelField is true only for the rule contact-term", () => {
    expect(isChannelField({ rule: "contact-term" })).toBe(true);
    expect(isChannelField({ rule: "membership" })).toBe(false);
    expect(isChannelField({ rule: null })).toBe(false);
    expect(isChannelField({})).toBe(false);
  });
  it("setFieldKind names a channel or a relation by the term's name", () => {
    expect(setFieldKind(field("MemberOf"))).toBe("relation-memberOf");
    expect(setFieldKind(CHANNEL)).toBe("channel-preferredChannel");
    expect(setFieldKind(field("X", { term: "no-name" }))).toBe("relation-field");
  });
  it("setFieldHasContent is true when a value is stored under a fact key", () => {
    expect(setFieldHasContent({ ...MEMBER, shownBecause: null }, { memberOf: "Club One" })).toBe(true);
    expect(setFieldHasContent({ ...MEMBER, shownBecause: null }, { memberOf: "  " })).toBe(false);
    expect(setFieldHasContent({ ...MEMBER, shownBecause: null }, {})).toBe(false);
  });
});

describe("the host", () => {
  it("is the empty object with no provider, and the provider's value inside one", () => {
    expect(renderHook(() => useStakeholderSetFieldsHost()).result.current).toEqual({});
    const host = writer();
    const wrapper = ({ children }: { children: ReactNode }) => <StakeholderSetFieldsHostProvider host={host}>{children}</StakeholderSetFieldsHostProvider>;
    expect(renderHook(() => useStakeholderSetFieldsHost(), { wrapper }).result.current).toBe(host);
  });
});

describe("StakeholderSetFields: which fields are drawn", () => {
  const rows = [field("MemberOf"), CHANNEL];
  const draw = (only?: "relations" | "preferences", fields: never[] = rows as never[]) =>
    render(
      <QueryClientProvider client={client()}>
        <CardModeProvider canEdit startEditing>
          <StakeholderSetFields only={only} fields={fields} facts={{ memberOf: "Club One", preferredChannel: "x" }} fieldSets={FIELD_SETS} canEdit={false} holdingVault={null} agent={null} carrier={null} vaultId="v" />
        </CardModeProvider>
      </QueryClientProvider>,
    );
  it("draws both when `only` is not given, relations only, or preferences only", () => {
    draw();
    expect(screen.getAllByTestId("stakeholder-set-field")).toHaveLength(2);
    cleanup();
    draw("relations");
    expect(screen.getAllByTestId("stakeholder-set-field").map((e) => e.getAttribute("data-field-term"))).toEqual([`${ORIGIN}/base/t/MemberOf`]);
    cleanup();
    draw("preferences");
    expect(screen.getAllByTestId("stakeholder-set-field").map((e) => e.getAttribute("data-field-term"))).toEqual([`${ORIGIN}/base/t/PreferredChannel`]);
  });
  it("draws nothing at all when no field is left", () => {
    draw("preferences", [field("MemberOf")] as never[]);
    expect(screen.queryByTestId("stakeholder-set-fields")).toBeNull();
    cleanup();
    draw(undefined, [] as never[]);
    expect(screen.queryByTestId("stakeholder-set-fields")).toBeNull();
  });
  it("wraps them in a labelled group", () => {
    draw();
    const g = screen.getByTestId("stakeholder-set-fields");
    expect(g.getAttribute("aria-label")).toBe("More fields of this kind");
    expect(g.getAttribute("role")).toBe("group");
  });
  it("hands each field its stored values, the field mode and the term as data attributes", () => {
    draw();
    const g = screen.getAllByTestId("stakeholder-set-field")[0]!;
    expect(g.getAttribute("data-field-mode")).toBe("reference-add");
    expect(within(g).getAllByTestId("stakeholder-link")).toHaveLength(1);
  });
});

describe("a field that is shown, not edited", () => {
  const shown = { ...field("LegalRepresentative", { mode: "shown", rule: null, shownBecause: "the card does not write it" }) };
  it("says why, in edit, and says nothing in presentation", () => {
    setField({ field: shown, values: ["Ann"], canEdit: true });
    expect(screen.getByTestId("stakeholder-field-not-editable").textContent).toBe("Not edited on this card: the card does not write it.");
    cleanup();
    setField({ field: shown, values: ["Ann"] }, { editing: false });
    expect(screen.queryByTestId("stakeholder-field-not-editable")).toBeNull();
  });
  it("does not say it when there is no reason", () => {
    setField({ field: { ...shown, shownBecause: null }, values: ["Ann"] });
    expect(screen.queryByTestId("stakeholder-field-not-editable")).toBeNull();
  });
});

describe("why the add is withheld", () => {
  const text = () => screen.queryByTestId("stakeholder-reference-withheld")?.textContent ?? null;
  it("names the vault first, then the address, then the sign-in; nothing when all three are there", () => {
    setField({ holdingVault: null, carrier: null, agent: null });
    expect(text()).toBe("Which vault holds this record is not known yet, so no reference is written. Open the record from Stakeholders.");
    cleanup();
    setField({ carrier: null, agent: null });
    expect(text()).toBe("This record has no address yet, so no reference is written.");
    cleanup();
    setField({ agent: null });
    expect(text()).toBe("Not signed in, so no reference is written.");
    cleanup();
    setField();
    expect(text()).toBeNull();
  });
  it("says nothing for a field the card cannot write, or when the card cannot edit", () => {
    setField({ field: field("X", { mode: "shown", shownBecause: null }), holdingVault: null });
    expect(text()).toBeNull();
    cleanup();
    setField({ canEdit: false, holdingVault: null });
    expect(text()).toBeNull();
  });
  it("is not drawn in presentation", () => {
    setField({ holdingVault: null }, { editing: false });
    expect(text()).toBeNull();
  });
  it("offers no picker while withheld", () => {
    setField({ agent: null });
    expect(screen.queryByTestId("stakeholder-link-picker")).toBeNull();
    expect(screen.queryByTestId("stakeholder-channel-choices")).toBeNull();
  });
});

describe("the remove, through the host", () => {
  const link = (v: string) => within(screen.getAllByTestId("stakeholder-link").find((e) => e.textContent!.includes(v))!);
  it("draws a remove control per link only when the host has the writer", () => {
    setField({ values: [GROUP, OTHER] }, { host: writer() });
    expect(screen.getAllByTestId("stakeholder-link-remove")).toHaveLength(2);
    cleanup();
    setField({ values: [GROUP, OTHER] }, { host: {} });
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
    expect(screen.getAllByTestId("stakeholder-link")).toHaveLength(2);
  });
  it("draws none without a provider at all, and none without the record id", () => {
    const qc = client();
    render(
      <QueryClientProvider client={qc}>
        <RefLabelContext.Provider value={() => "x"}>
          <CardModeProvider canEdit startEditing>
            <SetField field={MEMBER} values={[GROUP]} facts={{}} fieldSets={FIELD_SETS} canEdit holdingVault={VAULT} agent="a" carrier={CARRIER} vaultId="v" recordId="r1" carrierKind={KIND} />
          </CardModeProvider>
        </RefLabelContext.Provider>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
    cleanup();
    setField({ values: [GROUP], recordId: null }, { host: writer() });
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
  });
  it("draws none when the card cannot add (no vault) or in presentation", () => {
    setField({ values: [GROUP], holdingVault: null }, { host: writer() });
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
    cleanup();
    setField({ values: [GROUP] }, { host: writer(), editing: false });
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
  });
  it("names the thing removed by the relation's words", () => {
    setField({ field: field("ActsOnBehalfOf", { rule: "party" }), values: [GROUP] }, { host: writer() });
    expect(screen.getByRole("button", { name: "Remove from Represents" })).toBeTruthy();
  });
  it("calls the host's writer with the record, its address, the fact key, a change and the notice, then says Removed.", async () => {
    const host = writer([GROUP, OTHER]);
    setField({ values: [GROUP, OTHER] }, { host });
    fireEvent.click(link("g1").getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Removed."));
    expect(host.calls).toHaveLength(1);
    const [recordId, carrier, key, change, notice] = host.calls[0]!;
    expect([recordId, carrier, key, notice]).toEqual(["r1", CARRIER, "memberOf", "the MemberOf link was not removed"]);
    expect((change as (s: unknown[]) => unknown[])([GROUP, OTHER, "text"])).toEqual([OTHER, "text"]);
  });
  it("writes once per spelling of the field, in order", async () => {
    const host = writer([GROUP]);
    setField({ field: field("MemberOf", { factKeys: ["memberOf", "member_of"] }), values: [GROUP] }, { host });
    fireEvent.click(screen.getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(host.calls).toHaveLength(2));
    expect(host.calls.map((c) => c[2])).toEqual(["memberOf", "member_of"]);
  });
  it("shows the host's error as an alert, and says nothing is removed when no spelling held the link", async () => {
    const failing = { changeRecordFactItems: vi.fn(async () => { throw new Error("412 gone"); }) as never };
    setField({ values: [GROUP] }, { host: failing });
    fireEvent.click(screen.getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("412 gone"));
    cleanup();
    setField({ values: [GROUP] }, { host: writer(["unrelated"]) });
    fireEvent.click(screen.getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/does not hold this link/));
    cleanup();
    const odd = { changeRecordFactItems: vi.fn(async () => { throw "plain"; }) as never };
    setField({ values: [GROUP] }, { host: odd });
    fireEvent.click(screen.getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("plain"));
  });
  it("looks the writer up when the remove runs: a host given at a later render is the one used", async () => {
    const first = writer([GROUP]);
    const second = writer([GROUP]);
    const r = setField({ values: [GROUP] }, { host: first });
    r.again({}, second);
    fireEvent.click(screen.getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(second.calls).toHaveLength(1));
    expect(first.calls).toHaveLength(0);
  });
  it("disables the remove controls while a remove is under way, and the answer goes when the card is back in presentation", async () => {
    let release!: () => void;
    const slow = { changeRecordFactItems: vi.fn(() => new Promise<unknown[]>((res) => { release = () => res([]); })) as never };
    setField({ values: [GROUP] }, { host: slow });
    const btn = screen.getByTestId("stakeholder-link-remove") as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect((screen.getByTestId("stakeholder-link-remove") as HTMLButtonElement).disabled).toBe(true));
    await act(async () => release());
  });
  it("shows the answer only in edit: back in presentation it is gone", async () => {
    const host = writer([GROUP]);
    const qc = client();
    const App = ({ edit }: { edit: boolean }) => (
      <QueryClientProvider client={qc}>
        <RefLabelContext.Provider value={() => "x"}>
          <CardModeProvider canEdit startEditing={edit}>
            <CardModeBar />
            <StakeholderSetFieldsHostProvider host={host}>
              <SetField field={MEMBER} values={[GROUP]} facts={{}} fieldSets={FIELD_SETS} canEdit holdingVault={VAULT} agent="a" carrier={CARRIER} vaultId="v" recordId="r1" carrierKind={KIND} />
            </StakeholderSetFieldsHostProvider>
          </CardModeProvider>
        </RefLabelContext.Provider>
      </QueryClientProvider>
    );
    render(<App edit />);
    fireEvent.click(screen.getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Removed."));
    expect(screen.getByTestId("stakeholder-reference-answer").textContent).toBe("Removed.");
    fireEvent.click(screen.getByTestId("card-done"));
    expect(screen.queryByTestId("stakeholder-reference-answer")).toBeNull();
    fireEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByTestId("stakeholder-reference-answer")).toBeNull();
  });
});

describe("values", () => {
  it("shows a record address by name, and anything else as text", () => {
    setField({ values: [GROUP, "plain text"] });
    const links = screen.getAllByTestId("stakeholder-link");
    expect(links[0]!.textContent).toContain("Label of g1");
    expect(links[1]!.textContent).toBe("plain text");
  });
  it("says None yet. for a group opened with nothing stored, and draws nothing in presentation", async () => {
    setField({ values: [] }, { editing: false });
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    setField({ values: [] });
    expect(screen.queryByRole("region")).toBeNull();
    await openGroup("Member of");
    expect(screen.getByTestId("stakeholder-set-none").textContent).toBe("None yet.");
  });
  it("opens a record through onOpenRef with its id", () => {
    const onOpenRef = vi.fn();
    setField({ values: [GROUP], onOpenRef });
    fireEvent.click(screen.getByRole("button", { name: "Label of g1" }));
    expect(onOpenRef).toHaveBeenCalledWith("g1");
  });
  it("in presentation shows the name only (the address is not drawn under it)", () => {
    setField({ values: [GROUP] }, { editing: false });
    expect(screen.getAllByTestId("stakeholder-link")[0]!.textContent).toBe("Label of g1");
  });
  it("keeps the master's label for a relation with no human copy, and the human copy for one that has it", () => {
    setField({ field: field("LegalRepresentative", { label: "Legal Representative" }), values: ["a"] });
    expect(screen.getByRole("region", { name: "Legal Representative" })).toBeTruthy();
    cleanup();
    setField({ field: field("MemberOf", { label: "Member-Of" }), values: ["a"] });
    expect(screen.getByRole("region", { name: "Member of" })).toBeTruthy();
  });
});

describe("a preferred channel", () => {
  const stored = `${ORIGIN}/base/a/email`;
  const kind = { ...(KIND as object), fields: [{ term: `${ORIGIN}/base/t/Email`, label: "Email", readKeys: ["a:email"], writeKey: "a:email" }, { term: `${ORIGIN}/base/t/Phone`, label: "Phone", readKeys: ["a:phone"], writeKey: "a:phone" }] } as never;
  it("shows the chosen one as a selected chip named by the kind's field, with its remove control in edit", () => {
    setField({ field: CHANNEL, values: [stored], carrierKind: kind }, { host: writer() });
    const chip = screen.getByTestId("stakeholder-link");
    expect(chip.getAttribute("data-chip")).toBe("selected");
    expect(chip.textContent).toBe("Email");
    expect(screen.getByRole("button", { name: "Remove from Preferred channel" })).toBeTruthy();
    expect(screen.getByTestId("stakeholder-channel-selected")).toBeTruthy();
  });
  it("shows an address it cannot name as it is stored", () => {
    setField({ field: CHANNEL, values: ["elsewhere"], carrierKind: kind });
    expect(screen.getByTestId("stakeholder-link").textContent).toBe("elsewhere");
  });
  it("says None chosen yet. for a channel group opened with nothing chosen", async () => {
    setField({ field: CHANNEL, values: [], carrierKind: kind });
    await openGroup("Preferred channel");
    expect(screen.getByTestId("stakeholder-set-none").textContent).toBe("None chosen yet.");
  });
  it("has the contact-preference helper under the field's own name as its title", () => {
    setField({ field: CHANNEL, values: [stored], carrierKind: kind });
    expect(screen.getByRole("region", { name: "Preferred channel" })).toBeTruthy();
    expect(screen.getByText("Which of this record's contact values to try first.")).toBeTruthy();
  });
  it("offers the contact values the record holds, and adds the one chosen through the hook", async () => {
    setField({ field: CHANNEL, values: ["elsewhere"], carrierKind: kind, facts: { email: "ann@example.test", phone: "" } });
    const box = screen.getByTestId("stakeholder-channel-choices");
    const buttons = within(box).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Email"]);
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Added."));
    expect(add.calls).toEqual([[{ vaultId: VAULT, agent: "agent-1", carrier: CARRIER, field: CHANNEL, target: stored }]]);
    expect(add.sets[0]).toBe(FIELD_SETS);
  });
  it("leaves out the one already chosen, and says so when no other is held", () => {
    setField({ field: CHANNEL, values: [stored], carrierKind: kind, facts: { email: "ann@example.test" } });
    expect(screen.getByTestId("stakeholder-channel-none").textContent).toBe("This record holds no other contact value to choose as its channel.");
  });
  it("says it is reading the kinds while the reading is not there, and why when it cannot be read", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
    setField({ field: CHANNEL, values: ["elsewhere"], carrierKind: kind }, { qc });
    expect(screen.getByText("Reading the contact kinds…")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^The contact kinds could not be read \(/));
  });
  it("says it is reading when the carrier's kind is not known", () => {
    setField({ field: CHANNEL, values: ["elsewhere"], carrierKind: null });
    expect(screen.getByText("Reading the contact kinds…")).toBeTruthy();
  });
  it("shows an add error as an alert, with the thrown message or the thrown value", async () => {
    add.result = () => Promise.reject(new Error("refused: no such vault"));
    setField({ field: CHANNEL, values: ["elsewhere"], carrierKind: kind, facts: { email: "x" } });
    fireEvent.click(within(screen.getByTestId("stakeholder-channel-choices")).getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("refused: no such vault"));
    cleanup();
    add.result = () => Promise.reject("odd");
    setField({ field: CHANNEL, values: ["elsewhere"], carrierKind: kind, facts: { email: "x" } });
    fireEvent.click(within(screen.getByTestId("stakeholder-channel-choices")).getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("odd"));
  });
  it("draws no remove control on the chosen chip when the card cannot add (no vault)", () => {
    setField({ field: CHANNEL, values: [stored], carrierKind: kind, holdingVault: null }, { host: writer() });
    expect(screen.getByTestId("stakeholder-link").textContent).toBe("Email");
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
  });
  it("draws no remove control on the chosen chip in presentation, or without the record id", () => {
    setField({ field: CHANNEL, values: [stored], carrierKind: kind }, { host: writer(), editing: false });
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
    cleanup();
    setField({ field: CHANNEL, values: [stored], carrierKind: kind, recordId: null }, { host: writer() });
    expect(screen.queryByTestId("stakeholder-link-remove")).toBeNull();
  });
  it("removes the chosen channel through the host", async () => {
    const host = writer([stored]);
    setField({ field: CHANNEL, values: [stored], carrierKind: kind }, { host });
    fireEvent.click(screen.getByTestId("stakeholder-link-remove"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Removed."));
    expect(host.calls[0]!.slice(0, 3)).toEqual(["r1", CARRIER, "preferredChannel"]);
    expect(host.calls[0]![4]).toBe("the Preferred channel link was not removed");
  });
  it("disables the choices while an add is pending", () => {
    add.pending = true;
    setField({ field: CHANNEL, values: ["elsewhere"], carrierKind: kind, facts: { email: "x" } });
    expect((within(screen.getByTestId("stakeholder-channel-choices")).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the record link picker", () => {
  const seeded = (age = 0) => {
    const qc = client();
    qc.setQueryData(targetsKey, { candidates, complete: true }, { updatedAt: Date.now() - age });
    return qc;
  };
  const box = () => screen.getByRole("textbox") as HTMLInputElement;
  it("opens on focus, lists the vault's records the field may point at, and not the record itself or one already stored", async () => {
    setField({ values: [OTHER] }, { qc: seeded() });
    expect(screen.queryByTestId("stakeholder-link-hits")).toBeNull();
    fireEvent.focus(box());
    await waitFor(() => expect(screen.getByTestId("stakeholder-link-hits")).toBeTruthy());
    expect(within(screen.getByTestId("stakeholder-link-hits")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Club One"]);
  });
  it("labels the box with the field's words", () => {
    setField({ field: field("ActsOnBehalfOf", { rule: "party" }) }, { qc: seeded() });
    expect(box().getAttribute("aria-label")).toBe("Add to Represents: find a record in this vault by name");
    expect(box().placeholder).toBe("Add to Represents: find a record by name");
    expect(box().getAttribute("autocomplete")).toBe("off");
  });
  it("narrows by the typed name and says so when none matches", async () => {
    setField({}, { qc: seeded() });
    fireEvent.change(box(), { target: { value: "two" } });
    await waitFor(() => expect(within(screen.getByTestId("stakeholder-link-hits")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Club Two"]));
    fireEvent.change(box(), { target: { value: "zzz" } });
    await waitFor(() => expect(screen.getByTestId("stakeholder-link-none").textContent).toBe("No record named “zzz” in this vault that Member of may point at."));
    fireEvent.change(box(), { target: { value: "  " } });
    fireEvent.change(box(), { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId("stakeholder-link-hits")).toBeTruthy());
  });
  it("says the list was not read to its end when it was not", async () => {
    const qc = client();
    qc.setQueryData(targetsKey, { candidates: [], complete: false });
    setField({}, { qc });
    fireEvent.focus(box());
    await waitFor(() => expect(screen.getByTestId("stakeholder-link-none").textContent).toBe("No record in this vault that Member of may point at. The vault's list was not read to its end, so this is not the whole answer."));
  });
  it("Escape clears the box and closes the list", async () => {
    setField({}, { qc: seeded(), noCardMode: true });
    fireEvent.change(box(), { target: { value: "club" } });
    await waitFor(() => expect(screen.getByTestId("stakeholder-link-hits")).toBeTruthy());
    const input = box();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(screen.queryByTestId("stakeholder-link-hits")).toBeNull();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "a" });
    expect(input.value).toBe("");
  });
  it("a pick clears and closes the box and adds the record through the hook with the vault, agent, carrier and field", async () => {
    setField({}, { qc: seeded() });
    fireEvent.focus(box());
    await waitFor(() => screen.getByTestId("stakeholder-link-hits"));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Club One" }));
    fireEvent.click(screen.getByRole("button", { name: "Club One" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Added."));
    expect(add.calls).toEqual([[{ vaultId: VAULT, agent: "agent-1", carrier: CARRIER, field: MEMBER, target: GROUP }]]);
    expect(box().value).toBe("");
    expect(screen.queryByTestId("stakeholder-link-hits")).toBeNull();
  });
  it("shows at most 20 records", async () => {
    const qc = client();
    qc.setQueryData(targetsKey, { candidates: Array.from({ length: 25 }, (_, i) => ({ record: `https://v.example.test/base/e/c${i}`, vaultId: VAULT, type: "t:Club", label: `Club ${i}` })), complete: true });
    setField({}, { qc });
    fireEvent.focus(box());
    await waitFor(() => expect(within(screen.getByTestId("stakeholder-link-hits")).getAllByRole("button")).toHaveLength(20));
  });
  it("shows a record by its address when the list gives it no label", async () => {
    const qc = client();
    qc.setQueryData(targetsKey, { candidates: [{ record: GROUP, vaultId: VAULT, type: "t:Club", label: null }], complete: true });
    setField({}, { qc });
    fireEvent.focus(box());
    await waitFor(() => expect(within(screen.getByTestId("stakeholder-link-hits")).getByRole("button").textContent).toBe(GROUP));
  });
  it("disables the box and the choices while an add is pending", async () => {
    add.pending = true;
    setField({}, { qc: seeded() });
    expect(box().disabled).toBe(true);
  });
  it("reads the vault's list once and keeps it for a minute: data 30 s old is not asked for again, data 90 s old is", async () => {
    const fresh = seeded(30_000);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
    setField({}, { qc: fresh });
    fireEvent.focus(box());
    await waitFor(() => screen.getByTestId("stakeholder-link-hits"));
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(fresh.getQueryState(targetsKey)!.fetchStatus).toBe("idle");
    expect(fresh.getQueryState(targetsKey)!.error).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    const stale = seeded(90_000);
    setField({}, { qc: stale });
    fireEvent.focus(box());
    await waitFor(() => expect(stale.getQueryState(targetsKey)!.error).not.toBeNull());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/^Could not list this vault's records \(/);
    expect(screen.getByRole("alert").textContent).toMatch(/That is not a statement that the\s+record does not exist\.$/);
  });
  it("says it is searching while the vault is read, and why when the reference reading cannot be read", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
    setField({}, { qc });
    fireEvent.focus(box());
    expect(screen.getByText("Searching this vault…")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^Could not list this vault's records \(/));
    expect(screen.queryByText("Searching this vault…")).toBeNull();
  });
  it("does not read anything before the box is focused", () => {
    const fetchSpy = vi.fn(async () => { throw new Error("no network"); });
    vi.stubGlobal("fetch", fetchSpy);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setField({}, { qc });
    expect(qc.getQueryState(stakeholderReferenceReadingQueryKey())?.fetchStatus ?? "idle").toBe("idle");
    expect(qc.getQueryState(targetsKey)?.fetchStatus ?? "idle").toBe("idle");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("offers no picker for a field with no rule or no carrier kind (nothing admitted, nothing listed)", async () => {
    const qc = seeded();
    setField({ carrierKind: null }, { qc });
    fireEvent.focus(box());
    expect(screen.queryByTestId("stakeholder-link-hits")).toBeNull();
    expect(screen.queryByTestId("stakeholder-link-none")).toBeNull();
  });
});

describe("the add is a no-op when the card cannot add", () => {
  it("draws no picker and never calls the hook's write when the card cannot edit", () => {
    setField({ canEdit: false });
    expect(screen.queryByTestId("stakeholder-link-picker")).toBeNull();
    expect(add.calls).toHaveLength(0);
  });
  it("draws no picker for a field that is shown only", () => {
    setField({ field: field("X", { mode: "shown" }) });
    expect(screen.queryByTestId("stakeholder-link-picker")).toBeNull();
  });
});

describe("hook order", () => {
  it("passes the field sets to the add hook on every render, and renders the same hooks with and without a host writer", () => {
    const r = setField({}, { host: {} });
    expect(add.sets.every((s) => s === FIELD_SETS)).toBe(true);
    r.again({}, writer());
    r.again({}, {});
    expect(add.sets.length).toBeGreaterThan(2);
  });
});
