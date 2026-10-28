// The Scale qualifiers of a Value as records, read with the finds of their option definitions: what is asked of the host, what the
// list keeps while no find changed, and what is not written.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMemo } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { carryRaw, type ScaleVariable } from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueQualifiers } from "./index";
import { planFindRows } from "./planFind";
import { makeBrowser } from "../test/fakeHost";
import { createServer, entityUriOf, type Srv } from "../test/server";
import { planVaultOf, seedValueParts, type ValuePartsSeed } from "../test/testkit";
import { P, settle, valueRow } from "../test/value";

const server = createServer({ ifMatch: true, patchTagCheck: true });
beforeEach(() => server.reset());
afterEach(cleanup);

const variable = (name: string, options: { name: string; definition: string }[] = []): ScaleVariable => ({ name, definition: "", defaultOption: "", options, source: {} });

function mount(seed: ValuePartsSeed, opts: { enabled?: boolean; value?: BaseRecord } = {}) {
  const value = opts.value ?? valueRow();
  const b = makeBrowser(server);
  const PV = planVaultOf(value, P);
  const rows = seedValueParts(b.qc, P, value, seed);
  for (const r of rows) {
    r.etag = '"v0"';
    server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 0 } satisfies Srv);
  }
  const notices: (string | null)[] = [];
  const hook = renderHook(
    () => {
      const [find] = b.host.usePlanFinds(PV, "a:partOf", [{ id: value.id, entityUri: value.entityUri, enabled: true }]);
      // The rows of the Value, without the option records (they are found by the hook itself); stable while the find is.
      const own = useMemo(() => planFindRows(find?.data).filter((r) => !/Definition$/.test(r.typeUri) || /^qual/.test(r.id)), [find?.data]);
      return useValueQualifiers({ enabled: opts.enabled ?? true, record: value, vaultId: P, planVault: PV, rows: own, onNotice: (n) => notices.push(n) });
    },
    { wrapper: b.Frame },
  );
  return { b, hook, notices, PV };
}

const WITH_OPTIONS: ValuePartsSeed = {
  qualifiers: [
    { "a:name": "Country", "a:qualifierOptions": ["Norway", "Sweden"], __optionDefs: [{ name: "Norway", definition: "the country" }] },
    { "a:name": "Plain" },
  ],
};

describe("reading", () => {
  it("asks the host for one find of option definitions for each variable that has options, and none for one that has not", () => {
    const t = mount(WITH_OPTIONS);
    const calls = t.b.host.usePlanFinds.mock.calls.filter((c) => c[2].some((p) => p.id.startsWith("qual")));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c[0]).toBe(t.PV);
      expect(c[1]).toBe("a:partOf");
      expect(c[2]).toEqual([{ id: "qual1", entityUri: entityUriOf("qual1"), enabled: true }]);
    }
    expect(t.hook.result.current.items.map((v) => [v.name, v.options])).toEqual([
      ["Country", [{ name: "Norway", definition: "the country" }, { name: "Sweden", definition: "" }]],
      ["Plain", []],
    ]);
  });

  it("is empty, and asks for no find, while the hook is not enabled", () => {
    const t = mount(WITH_OPTIONS, { enabled: false });
    expect(t.hook.result.current.items).toEqual([]);
    const last = t.b.host.usePlanFinds.mock.calls.filter((c) => c[2].length === 0);
    expect(last.length).toBeGreaterThan(0);
  });

  it("keeps the same list while no find changed, and a host that builds new find data on every render makes it a new list each time", () => {
    const t = mount(WITH_OPTIONS);
    const before = t.hook.result.current.items;
    t.hook.rerender();
    expect(t.hook.result.current.items).toBe(before);

    const bad = mount(WITH_OPTIONS);
    const real = bad.b.host.usePlanFinds.getMockImplementation()!;
    bad.b.host.usePlanFinds.mockImplementation((...args) => real(...args).map((q) => ({ data: q.data ? { ...q.data, rows: [...q.data.rows] } : q.data })));
    bad.hook.rerender();
    const first = bad.hook.result.current.items;
    bad.hook.rerender();
    expect(bad.hook.result.current.items).not.toBe(first);
    expect(bad.hook.result.current.items).toEqual(first);
  });
});

describe("writing", () => {
  it("a variable with no name and nothing in it is not written", async () => {
    const t = mount({});
    await act(async () => t.hook.result.current.commit([variable("")]));
    await settle();
    expect(server.creates).toEqual([]);
  });

  it("an option whose name repeats another's in other letters is made once", async () => {
    const t = mount({});
    await act(async () =>
      t.hook.result.current.commit([variable("Country", [{ name: "Norway", definition: "one" }, { name: "NORWAY", definition: "two" }])]),
    );
    await settle();
    expect(server.creates.map((c) => c.typeUri)).toEqual(["t:ScaleQualifier", "t:ScaleQualifierDefinition"]);
    expect(server.creates[1]!.facts).toMatchObject({ name: "Norway", definition: "one", unitTag: "Speed.Q.Country.Norway" });
  });

  it("a variable that has options and no option records is read from the vault before its option records are made", async () => {
    const t = mount({ qualifiers: [{ "a:name": "Country", "a:qualifierOptions": ["Norway"] }] });
    t.b.qc.removeQueries({ queryKey: ["plan-find", t.PV, "a:partOf", "qual1"] });
    const item = t.hook.result.current.items[0]!;
    await act(async () => t.hook.result.current.commit([carryRaw({ ...item, options: [{ name: "Norway", definition: "the country" }] }, item)]));
    await settle();
    expect(t.b.host.cachedPlanFind).toHaveBeenCalledWith(t.PV, "a:partOf", "qual1");
    expect(t.b.host.fetchPlanFind).toHaveBeenCalledWith(t.PV, "a:partOf", "qual1", entityUriOf("qual1"), { staleTime: 15_000 });
    expect(server.creates.map((c) => c.typeUri)).toEqual(["t:ScaleQualifierDefinition"]);
  });
});
