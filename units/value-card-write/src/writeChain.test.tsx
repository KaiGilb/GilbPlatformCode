/**
 * The write chain from the Value graph down to the vault: the graph hands useValueLevels the whole new list, the hook writes the
 * smallest set of records, a tag a same-set level holds takes the .2 suffix, a row of three levels moves as one group that is put
 * back when a write fails, and a level added from the "+ New" menu onto a taken tag is created again with the next suffix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { PlanValueGraph } from "@kaigilb/gilbplatformcode-value-graph";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { EndpointPart, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueLevels } from "./index";
import { makeBrowser } from "../test/fakeHost";
import { renderWithGraph } from "../test/graph";
import { createServer, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type LevelEntry } from "../test/testkit";

const TODAY = "2026-10-27";
const server = createServer({ patchTagCheck: true });
beforeEach(() => server.reset());
afterEach(cleanup);

const part = (iri: string, label: string): EndpointPart => ({ typeIri: iri, typeLabel: label, words: "" });
const NONE = part("", "");
const mk = (levels: ValueLevel[], subject = NONE, reference = NONE, direction: "lower" | "target" = "lower"): ValueCardData => ({
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "", direction, source: {} },
  variables: [
    {
      name: "Country",
      definition: "",
      defaultOption: "Norway",
      options: [
        { name: "Norway", definition: "" },
        { name: "Sweden", definition: "" },
      ],
      source: {},
    },
  ],
  endpoint: { subject, reference, text: "", source: {} },
  meters: [],
  levels,
});

const P = "https://p.example.test/vault";
const HOST = "https://h.example.test";
const VALUE: BaseRecord = {
  id: "val1",
  entityUri: `${HOST}/base/e/val1`,
  typeUri: "t:Value",
  facts: { unitTag: "Speed" },
  opaqueFacts: [],
  etag: '"sha256:0"',
  updatedAt: 1,
  servedKeys: ["unitTag"],
  served: { facts: { unitTag: "Speed" }, context: undefined, etag: '"sha256:0"' },
} as BaseRecord;

type Write = { id: string; body: Record<string, unknown> };
/** The patches that reached the vault, in order, as the transport spells them (`a:<slug>`). */
const writes: Write[] = server.wire;
/** id -> the tag the vault holds. */
const tags = { get: (id: string) => server.get(id)?.served.unitTag };

/** The card's chain: records -> useValueLevels.items -> the graph -> commit. Tags carry the date, as the app builds them. */
function chain(entries: LevelEntry[]) {
  const b = makeBrowser(server);
  const PV = planVaultOf(VALUE, P);
  const rows = seedValueParts(b.qc, P, VALUE, { levels: entries });
  rows.forEach((r, i) => {
    const when = String(entries[i]!["a:levelWhen"] ?? "");
    const tag = when ? `${r.facts.unitTag}.${when}` : r.facts.unitTag!;
    r.facts.unitTag = tag;
    (r.served!.facts as Record<string, unknown>).unitTag = tag;
    server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
  });
  const notices: (string | null)[] = [];
  function Harness() {
    const host = useValueLevels({ enabled: true, record: VALUE, vaultId: P, planVault: PV, rows, variableOrder: [], onNotice: (n) => notices.push(n) });
    return <PlanValueGraph data={mk(host.items)} editing onChangeLevels={host.commit} />;
  }
  const r = renderWithGraph(<Harness />, b);
  return { ...r, notices };
}
const tagOf = (w: Write) => (w.body["a:unitTag"] ?? w.body["unitTag"]) as string | undefined;

describe("the graph to the vault", () => {
  const setDate = (from: string, to: string) => {
    // The date is changed on the level (its popover), not on the Arrow row.
    const m = screen.getByRole("slider", { name: new RegExp(`^Goal, ${from}`) });
    fireEvent.pointerDown(m, { clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(m, { clientX: 100, clientY: 20, pointerId: 1 });
    const input = screen.getByLabelText("Date");
    fireEvent.change(input, { target: { value: to } });
    fireEvent.blur(input);
  };

  it("a level date (popover) onto a date a same-set Goal holds: the tag takes .2 and the other Goal is not touched", async () => {
    chain([
      { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-01-01", levelVariables: { Country: "Norway" } },
      { levelKind: "Goal", levelValue: 9, "a:levelWhen": "2027-06-30", levelVariables: { Country: "Norway" } },
    ]);
    setDate("2027-06-30", "2027-01-01");
    await waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(2));
    expect(writes.map(tagOf)).toEqual(["Speed.Goal.Norway.2027-01-01", "Speed.Goal.Norway.2027-01-01.2"]);
    expect(writes.every((w) => w.id === "lvl2")).toBe(true);
    expect(tags.get("lvl1")).toBe("Speed.Goal.Norway.2027-01-01");
    expect(tags.get("lvl2")).toBe("Speed.Goal.Norway.2027-01-01.2");
  });

  const three: LevelEntry[] = [
    { levelKind: "Past", levelValue: 14, levelVariables: { Country: "Norway" } },
    { levelKind: "Status", levelValue: 9, "a:levelWhen": TODAY, levelVariables: { Country: "Norway" } },
    { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-06-30", levelVariables: { Country: "Norway" } },
  ];
  const moveToSweden = () => {
    fireEvent.click(screen.getByRole("button", { name: /^Change Country, Norway,/ }));
    const group = screen.getByRole("group", { name: /^Choose Country for/ });
    fireEvent.click(within(group).getByRole("checkbox", { name: /Norway$/ }));
    fireEvent.click(within(group).getByRole("checkbox", { name: /Sweden$/ }));
    fireEvent.click(within(group).getByRole("button", { name: "Done" }));
  };

  it("all three levels of a row move: three patches in order, each renamed", async () => {
    chain(three);
    moveToSweden();
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes.map((w) => w.id)).toEqual(["lvl1", "lvl2", "lvl3"]);
    expect(writes.map(tagOf)).toEqual(["Speed.Past.Sweden", `Speed.Status.Sweden.${TODAY}`, "Speed.Goal.Sweden.2027-06-30"]);
  });

  it("the 2nd of 3 patches fails: the 3rd is not sent, the 1st is patched back, and the notice says nothing moved", async () => {
    const { notices } = chain(three);
    server.failPatch = new Set([2]);
    moveToSweden();
    await waitFor(() => expect(notices.filter(Boolean).length).toBeGreaterThan(0));
    // patch 1 (moved), patch 2 (500), patch 3 = lvl1 put back. lvl3 never written.
    expect(writes.map((w) => w.id)).toEqual(["lvl1", "lvl2", "lvl1"]);
    expect(writes.map(tagOf)).toEqual(["Speed.Past.Sweden", `Speed.Status.Sweden.${TODAY}`, "Speed.Past.Norway"]);
    expect(tags.get("lvl1")).toBe("Speed.Past.Norway");
    expect(tags.get("lvl2")).toBe(`Speed.Status.Norway.${TODAY}`);
    expect(tags.get("lvl3")).toBe("Speed.Goal.Norway.2027-06-30");
    expect(notices.filter(Boolean).join(" ")).toMatch(/None of the 3 levels moved/);
  });

  it("the put-back also fails: the notice names the levels that moved and those that did not", async () => {
    const { notices } = chain(three);
    server.failPatch = new Set([2, 3]);
    moveToSweden();
    await waitFor(() => expect(notices.filter(Boolean).length).toBeGreaterThan(0));
    expect(writes.map((w) => w.id)).toEqual(["lvl1", "lvl2", "lvl1"]);
    const n = notices.filter(Boolean).join(" ");
    expect(n).toMatch(/Only some levels moved/);
    expect(n).toMatch(/could not be put back: Speed\.Past\.Norway/);
    expect(n).toMatch(/Not moved: Speed\.Status\.Norway/);
    expect(n).toMatch(/Speed\.Goal\.Norway/);
  });
});

// ---- a level added from the "+ New" menu

const mkMenu = (levels: ValueLevel[], withVars = true): ValueCardData => ({
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "in [Country]", direction: "lower", source: {} },
  variables: withVars
    ? [
        {
          name: "Country",
          definition: "",
          defaultOption: "Norway",
          options: [
            { name: "Norway", definition: "" },
            { name: "Sweden", definition: "" },
          ],
          source: {},
        },
      ]
    : [],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels,
});

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "+ New" }));
const kindBtn = (set: number, kind: string) => document.querySelector(`[data-newmenu-set="${set}"] [data-kind-btn="${kind}"]`) as HTMLElement;

describe("a level added from the menu: a taken tag gives .2", () => {
  it("a Past added from the menu onto a taken tag: one add, POST Speed.Past (409) then Speed.Past.2", async () => {
    const b = makeBrowser(server);
    const PV = planVaultOf(VALUE, P);
    const rows = seedValueParts(b.qc, P, VALUE, {
      levels: [
        { levelKind: "Past", levelValue: 14 },
        { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-06-30" },
      ],
    });
    for (const r of rows) server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
    const host = renderHook(
      () => useValueLevels({ enabled: true, record: VALUE, vaultId: P, planVault: PV, rows, variableOrder: [], onNotice: () => {} }),
      { wrapper: b.Frame },
    );
    const writes = vi.fn();
    function Harness() {
      const h = useValueLevels({ enabled: true, record: VALUE, vaultId: P, planVault: PV, rows, variableOrder: [], onNotice: () => {} });
      return (
        <PlanValueGraph
          data={mkMenu(h.items, false)}
          editing
          onChangeLevels={(n) => {
            writes(n);
            h.commit(n);
          }}
        />
      );
    }
    renderWithGraph(<Harness />, b);
    openMenu();
    fireEvent.click(kindBtn(0, "Past"));
    expect(writes).toHaveBeenCalledTimes(1);
    const posts = () => b.host.createRecord.mock.calls.map(([, type, facts]) => ({ type, tag: facts.unitTag }));
    await waitFor(() => expect(posts().length).toBe(2));
    expect(posts().map((p) => p.tag)).toEqual(["Speed.Past", "Speed.Past.2"]);
    expect(posts().every((p) => p.type === "t:Past")).toBe(true);
    void host;
  });
});

