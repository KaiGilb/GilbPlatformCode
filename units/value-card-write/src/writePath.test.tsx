/**
 * The write path of a date change (no screen): a date drag on the Timeline hands useValueLevels a level whose qualifier.when
 * changed; this proves what is written: one PATCH with the new a:levelWhen and the renamed tag, the .2 rule on a tag collision,
 * one write for value + date together, and the "changed elsewhere" notice on a 412. The last case puts the Value graph on top.
 * What reached the vault is `server.wire`: the patches as the transport spells them (`a:<slug>`).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { PlanValueGraph } from "@kaigilb/gilbplatformcode-value-graph";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { carryRaw, LEVEL_TERMS, type ValueCardData, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueLevels } from "./index";
import { makeBrowser } from "../test/fakeHost";
import { renderWithGraph } from "../test/graph";
import { createServer, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type LevelEntry } from "../test/testkit";

const P = "https://p.example.test/vault";
const HOST = "https://h.example.test";

type Write = { id: string; body: Record<string, unknown> };
const server = createServer({ patchTagCheck: true });
/** The patches that reached the vault, in order. */
const writes: Write[] = server.wire;
/** id -> the tag the vault holds. */
const tags = { get: (id: string) => server.get(id)?.served.unitTag };

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

/** The vault holds the seeded records; their stored tags carry the date, as the app builds them (the testkit leaves it off). */
function seed(b: ReturnType<typeof makeBrowser>, entries: LevelEntry[]) {
  const PV = planVaultOf(VALUE, P);
  const rows = seedValueParts(b.qc, P, VALUE, { levels: entries });
  rows.forEach((r, i) => {
    const when = String(entries[i]!["a:levelWhen"] ?? "");
    const tag = when ? `${r.facts.unitTag}.${when}` : r.facts.unitTag!;
    r.facts.unitTag = tag;
    (r.served!.facts as Record<string, unknown>).unitTag = tag;
    server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
  });
  return { PV, rows };
}

function setup(entries: LevelEntry[]) {
  const b = makeBrowser(server);
  const { PV, rows } = seed(b, entries);
  const notices: (string | null)[] = [];
  const hook = renderHook(
    () =>
      useValueLevels({
        enabled: true,
        record: VALUE,
        vaultId: P,
        planVault: PV,
        rows,
        variableOrder: [],
        onNotice: (n) => notices.push(n),
      }),
    { wrapper: b.Frame },
  );
  return { hook, notices, rows };
}

/** What the graph does on a drop: the same level with a new value and/or date, carrying its record. */
function change(items: ValueLevel[], i: number, to: { value?: number; when?: string }): ValueLevel[] {
  return items.map((l, n) =>
    n === i ? carryRaw({ ...l, value: to.value ?? l.value, qualifier: { ...l.qualifier, when: to.when ?? l.qualifier.when } }, l) : l,
  );
}

const tagOf = (w: Write) => (w.body["a:unitTag"] ?? w.body["unitTag"]) as string | undefined;
const whenOf = (w: Write) => ("a:levelWhen" in w.body ? w.body["a:levelWhen"] : w.body["levelWhen"]) as string | null | undefined;
const valueOf = (w: Write) => w.body[LEVEL_TERMS.value] as number | undefined;

/** Older names of level facts (read-only). Bare slugs, so no prefixed old term appears as a literal here. */
const OLD_SLUGS = ["levelValue", "levelKind", "levelVariables", "levelConditions", "valueLevels", "measurementValue"];
/** Every key in a write body that is an older name (prefixed or bare, any case) holding a non-null value. */
function oldKeysWritten(w: Write): string[] {
  const old = new Set(OLD_SLUGS.map((k) => k.toLowerCase()));
  return Object.entries(w.body)
    .filter(([k, v]) => v !== null && v !== undefined && old.has(k.replace(/^[a-z]+:/i, "").toLowerCase()))
    .map(([k]) => k);
}
/** No write, in any test, carries an older key. */
const expectNoOldKeyWritten = () => {
  for (const w of writes) expect(oldKeysWritten(w), `write to ${w.id} used an older key`).toEqual([]);
};

beforeEach(() => server.reset());
afterEach(() => {
  expectNoOldKeyWritten();
  cleanup();
});

describe("the write path of a date change", () => {
  it("a. date only: one patch with the new a:levelWhen, the tag renamed to the new date, the value untouched", async () => {
    // A number stored as text is not rewritten by a date edit.
    const { hook } = setup([{ levelKind: "Goal", levelValue: 5.2, "a:levelWhen": "2027-01-01" }]);
    expect(hook.result.current.items[0]!.qualifier.when).toBe("2027-01-01");
    act(() => hook.result.current.commit(change(hook.result.current.items, 0, { when: "2027-06-30" })));
    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.id).toBe("lvl1");
    expect(whenOf(writes[0]!)).toBe("2027-06-30");
    expect(tagOf(writes[0]!)).toBe("Speed.Goal.2027-06-30");
    expect(valueOf(writes[0]!)).toBeUndefined();
  });

  it("a2. a number held as a JSON number is rewritten as text by the next edit of that level", async () => {
    const { hook } = setup([{ levelKind: "Goal", levelValue: 5.2, __numberAsJson: true, "a:levelWhen": "2027-01-01" }]);
    act(() => hook.result.current.commit(change(hook.result.current.items, 0, { when: "2027-06-30" })));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(writes).toHaveLength(1);
    expect(valueOf(writes[0]!)).toBe("5.2");
  });

  it("b. date onto a date a same-set Goal holds: the rename takes .2; neither record is lost or overwritten", async () => {
    const { hook } = setup([
      { levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-01-01" },
      { levelKind: "Goal", levelValue: 9, "a:levelWhen": "2027-06-30" },
    ]);
    act(() => hook.result.current.commit(change(hook.result.current.items, 1, { when: "2027-01-01" })));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    // First try took the plain tag and got 409; the second took .2.
    expect(writes.map(tagOf)).toEqual(["Speed.Goal.2027-01-01", "Speed.Goal.2027-01-01.2"]);
    expect(writes.every((w) => w.id === "lvl2")).toBe(true);
    expect(whenOf(writes[1]!)).toBe("2027-01-01");
    // The other Goal was never written to: it keeps its tag and its date.
    expect(writes.some((w) => w.id === "lvl1")).toBe(false);
    expect(tags.get("lvl1")).toBe("Speed.Goal.2027-01-01");
    expect(tags.get("lvl2")).toBe("Speed.Goal.2027-01-01.2");
  });

  it("c. value and date together: ONE patch carries both (never two that can half-fail)", async () => {
    const { hook } = setup([{ levelKind: "Goal", levelValue: 5.2, "a:levelWhen": "2027-01-01" }]);
    act(() => hook.result.current.commit(change(hook.result.current.items, 0, { value: 7, when: "2027-06-30" })));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(writes).toHaveLength(1);
    expect(whenOf(writes[0]!)).toBe("2027-06-30");
    expect(valueOf(writes[0]!)).toBe("7");
    expect(tagOf(writes[0]!)).toBe("Speed.Goal.2027-06-30");
  });

  it("c. a failed write (500) writes nothing half-way: the single patch failed, no second call, the notice says so", async () => {
    const { hook, notices } = setup([{ levelKind: "Goal", levelValue: 5.2, "a:levelWhen": "2027-01-01" }]);
    server.failPatch.add(1);
    act(() => hook.result.current.commit(change(hook.result.current.items, 0, { value: 7, when: "2027-06-30" })));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(writes).toHaveLength(1);
    expect(notices.filter(Boolean).length).toBeGreaterThan(0);
    // Back on the stored level: the shown item is the record again.
    expect(hook.result.current.items[0]!.value).toBe(5.2);
    expect(hook.result.current.items[0]!.qualifier.when).toBe("2027-01-01");
  });

  it("d. a 412 shows the 'changed elsewhere' notice and the shown item snaps back to the stored level", async () => {
    const { hook, notices } = setup([{ levelKind: "Goal", levelValue: 5.2, "a:levelWhen": "2027-01-01" }]);
    server.stale.add("lvl1");
    act(() => hook.result.current.commit(change(hook.result.current.items, 0, { when: "2027-06-30" })));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(writes).toHaveLength(1);
    expect(notices.some((n) => !!n && /changed elsewhere/i.test(n))).toBe(true);
    expect(hook.result.current.items[0]!.qualifier.when).toBe("2027-01-01");
  });

  it("clearing the date (drag into the no-date lane): a:levelWhen cleared, the tag loses its date", async () => {
    const { hook } = setup([{ levelKind: "Goal", levelValue: 5.2, "a:levelWhen": "2027-01-01" }]);
    act(() => hook.result.current.commit(change(hook.result.current.items, 0, { when: "" })));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(writes).toHaveLength(1);
    expect(whenOf(writes[0]!)).toBeNull();
    expect(tagOf(writes[0]!)).toBe("Speed.Goal");
  });
});

describe("whole chain: a 412 on a Timeline drop", () => {
  it("shows the 'changed elsewhere' notice and the marker is back at its stored date", async () => {
    const b = makeBrowser(server);
    const { PV, rows } = seed(b, [{ levelKind: "Goal", levelValue: 5, "a:levelWhen": "2027-01-01" }, { levelKind: "Goal", levelValue: 9, "a:levelWhen": "2027-06-30", levelConditions: ["b"] }]);
    server.stale.add("lvl1");
    function Harness() {
      const [notice, setNotice] = useState<string | null>(null);
      const host = useValueLevels({ enabled: true, record: VALUE, vaultId: P, planVault: PV, rows, variableOrder: [], onNotice: setNotice });
      const data: ValueCardData = {
        scale: { text: "t", unit: "min", rate: "", context: "", direction: "lower", source: {} },
        variables: [],
        endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
        meters: [],
        levels: host.items,
      };
      return (
        <>
          <PlanValueGraph data={data} editing onChangeLevels={host.commit} />
          <p data-testid="notice">{notice ?? ""}</p>
        </>
      );
    }
    const { container } = renderWithGraph(<Harness />, b);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    container.querySelector("svg")!.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) });
    const el = () => container.querySelector('[role=slider][data-level="0"]')!;
    const cx = () => {
      const r = el().querySelector("rect[fill=transparent]")!;
      return { x: Number(r.getAttribute("x")) + 22, y: Number(r.getAttribute("y")) + 22 };
    };
    const a = cx();
    fireEvent.pointerDown(el(), { clientX: a.x, clientY: a.y, pointerId: 1 });
    fireEvent.pointerMove(el(), { clientX: a.x + 120, clientY: a.y, pointerId: 1 });
    fireEvent.pointerUp(el(), { clientX: a.x + 120, clientY: a.y, pointerId: 1 });
    await waitFor(() => expect(screen.getByTestId("notice").textContent).toMatch(/changed elsewhere/i));
    await waitFor(() => expect(Math.abs(cx().x - a.x)).toBeLessThan(0.01));
    expect(writes).toHaveLength(1);
    expect(el().getAttribute("aria-valuetext")).toContain("1 January 2027");
  });
});
