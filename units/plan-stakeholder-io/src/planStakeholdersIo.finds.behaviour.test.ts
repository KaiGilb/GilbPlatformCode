// @vitest-environment node
// The finds that turn typed text into stakeholder records across the held vaults: what is asked of each vault, what is kept, how the answer is ordered,
// and when it says it is not whole. The search and the reads are handed in, as the source's own tests do.
import { describe, expect, it, vi } from "vitest";
import { findAnyRecords, findStakeholderRecords } from "./planStakeholdersIo";

const A = "https://a.platform.example.test/vault";
const B = "https://b.platform.example.test/vault";

type Ref = { entityUri?: string; label?: string; typeUri: string; id?: string };
const page = (records: Ref[], complete = true) => ({ records: records.map((r, i) => ({ id: r.id ?? `r${i}`, ...r })), complete, nextOffset: null, total: records.length });

describe("findStakeholderRecords: no text", () => {
  it("asks nothing when there is no kind name or no vault, and says it did not search", async () => {
    const list = vi.fn();
    const none = { hits: [], complete: false, vaultsMissed: false };
    expect(await findStakeholderRecords([A], [], "", { list: list as never })).toEqual(none);
    expect(await findStakeholderRecords([A], ["  ", ""], "", { list: list as never })).toEqual(none);
    expect(await findStakeholderRecords([], ["Person"], "", { list: list as never })).toEqual(none);
    expect(await findStakeholderRecords([" ", ""], ["Person"], "x", { list: list as never })).toEqual(none);
    expect(list).not.toHaveBeenCalled();
  });

  it("lists the first page of the kinds from each distinct vault once, names and vaults trimmed", async () => {
    const list = vi.fn(async () => page([]));
    await findStakeholderRecords([` ${A} `, A, "", B], [" Person ", "Person", "", "Organization"], "  ", { list: list as never });
    expect(list.mock.calls).toEqual([
      [A, ["Person", "Organization"], 0],
      [B, ["Person", "Organization"], 0],
    ]);
  });

  it("keeps a record with an address, a name and one of the kinds, once, with its kind, sorted by name and then address", async () => {
    const list = vi.fn(async (v: string) =>
      v === A
        ? page([
            { entityUri: `${A}/e/z`, label: " Zed ", typeUri: "t:Person" },
            { entityUri: `${A}/e/b2`, label: "Bea", typeUri: "t:Organization" },
            { entityUri: `${A}/e/b1`, label: "Bea", typeUri: "t:Person" },
            { entityUri: `${A}/e/b1`, label: "Bea again", typeUri: "t:Person" },
            { entityUri: `${A}/e/note`, label: "A note", typeUri: "t:NoteDocument" },
            { entityUri: `${A}/e/nameless`, label: "   ", typeUri: "t:Person" },
            { label: "No address", typeUri: "t:Person" },
          ])
        : page([{ entityUri: `${B}/e/c`, label: "Cy", typeUri: "t:Person" }]),
    );
    const found = await findStakeholderRecords([A, B], ["Person", "Organization"], "", { list: list as never });
    expect(found.hits).toEqual([
      { uri: `${A}/e/b1`, label: "Bea", typeName: "Person" },
      { uri: `${A}/e/b2`, label: "Bea", typeName: "Organization" },
      { uri: `${B}/e/c`, label: "Cy", typeName: "Person" },
      { uri: `${A}/e/z`, label: "Zed", typeName: "Person" },
    ]);
    expect(found).toMatchObject({ complete: true, vaultsMissed: false });
  });

  it("is not whole when a vault's page is not, and says a vault was missed when its list failed, keeping the other vault's hits", async () => {
    const part = await findStakeholderRecords([A], ["Person"], "", { list: (async () => page([{ entityUri: `${A}/e/a`, label: "Ann", typeUri: "t:Person" }], false)) as never });
    expect(part).toMatchObject({ complete: false, vaultsMissed: false });
    expect(part.hits).toHaveLength(1);
    const failed = await findStakeholderRecords([A, B], ["Person"], "", {
      list: (async (v: string) => {
        if (v === A) throw new Error("500");
        return page([{ entityUri: `${B}/e/c`, label: "Cy", typeUri: "t:Person" }]);
      }) as never,
    });
    expect(failed).toMatchObject({ complete: false, vaultsMissed: true });
    expect(failed.hits.map((h) => h.label)).toEqual(["Cy"]);
  });
});

describe("findStakeholderRecords: with text", () => {
  const search = (ids: Record<string, string[]>) => vi.fn(async (_q: string, _t: readonly string[], _f: undefined, vaultId: string) => ({ ids: ids[vaultId] ?? [], next: null }));
  const readOf = (rows: Record<string, { label?: string; type: string; facts?: Record<string, string> }>) =>
    vi.fn(async (id: string, at: string | null) => {
      const r = rows[at ?? id];
      return r ? { id, entityUri: at ?? id, typeUri: r.type, facts: r.facts ?? (r.label ? { label: r.label } : {}), opaqueFacts: [], etag: null } : null;
    });

  it("searches each vault with the trimmed text and the kind names, and never lists", async () => {
    const s = search({});
    const list = vi.fn();
    await findStakeholderRecords([A, B], [" Person "], "  Ann ", { search: s as never, read: readOf({}) as never, list: list as never });
    expect(s.mock.calls).toEqual([
      ["Ann", ["Person"], undefined, A, "prefix"],
      ["Ann", ["Person"], undefined, B, "prefix"],
    ]);
    expect(list).not.toHaveBeenCalled();
  });

  it("turns each hit of a wanted kind into a name, an address and a kind, drops another kind, and sorts them; a record with no name facts is named by the tail of its address", async () => {
    const ann = `${A}/e/ann`, bob = `${A}/e/bob`, note = `${A}/e/note`, blank = `${A}/e/blank`;
    const found = await findStakeholderRecords([A], ["Person"], "x", {
      search: search({ [A]: [bob, ann, note, blank] }) as never,
      read: readOf({ [ann]: { label: "Ann", type: "t:Person" }, [bob]: { label: "Bob", type: "t:Person" }, [note]: { label: "Note", type: "t:NoteDocument" }, [blank]: { type: "t:Person" } }) as never,
    });
    expect(found.hits).toEqual([
      { uri: ann, label: "Ann", typeName: "Person" },
      { uri: blank, label: "blank", typeName: "Person" },
      { uri: bob, label: "Bob", typeName: "Person" },
    ]);
    expect(found.complete).toBe(true);
    expect(found.vaultsMissed).toBe(false);
  });

  it("names a hit by the address the record was read with, not the address the search gave", async () => {
    const found = `${A}/e/ann`, framed = `${B}/e/ann-framed`;
    const out = await findStakeholderRecords([A], ["Person"], "x", {
      search: search({ [A]: [found] }) as never,
      read: (async (id: string) => ({ id, entityUri: framed, typeUri: "t:Person", facts: { label: "Ann" }, opaqueFacts: [], etag: null })) as never,
    });
    expect(out.hits).toEqual([{ uri: framed, label: "Ann", typeName: "Person" }]);
  });

  it("says a vault was missed when its search failed, and keeps the other vault's hits", async () => {
    const ann = `${B}/e/ann`;
    const found = await findStakeholderRecords([A, B], ["Person"], "x", {
      search: (async (_q: string, _t: readonly string[], _f: undefined, v: string) => {
        if (v === A) throw new Error("down");
        return { ids: [ann], next: null };
      }) as never,
      read: readOf({ [ann]: { label: "Ann", type: "t:Person" } }) as never,
    });
    expect(found).toMatchObject({ complete: false, vaultsMissed: true });
    expect(found.hits.map((h) => h.label)).toEqual(["Ann"]);
  });

  it("is not whole when the search has a next page", async () => {
    const found = await findStakeholderRecords([A], ["Person"], "x", { search: (async () => ({ ids: [], next: "n" })) as never, read: readOf({}) as never });
    expect(found.complete).toBe(false);
  });
});

describe("findAnyRecords", () => {
  it("asks nothing when there is no vault", async () => {
    const list = vi.fn();
    expect(await findAnyRecords([], "", { list: list as never })).toEqual({ hits: [], complete: false, vaultsMissed: false });
    expect(await findAnyRecords([" "], "x", { list: list as never })).toEqual({ hits: [], complete: false, vaultsMissed: false });
    expect(list).not.toHaveBeenCalled();
  });

  it("lists every kind (no type names) of each distinct vault, and keeps a named record of any kind once, without a kind, sorted", async () => {
    const list = vi.fn(async (v: string) =>
      v === A
        ? page([
            { entityUri: `${A}/e/z`, label: "Zed", typeUri: "t:Person" },
            { entityUri: `${A}/e/z`, label: "Zed again", typeUri: "t:Person" },
            { entityUri: `${A}/e/a`, label: "Abe", typeUri: "t:NoteDocument" },
            { entityUri: `${A}/e/none`, label: " ", typeUri: "t:Person" },
            { label: "No address", typeUri: "t:Person" },
          ])
        : page([{ entityUri: `${B}/e/m`, label: "Mo", typeUri: "t:Organization" }]),
    );
    const found = await findAnyRecords([A, ` ${A}`, B], " ", { list: list as never });
    expect(list.mock.calls).toEqual([[A, [], 0], [B, [], 0]]);
    expect(found.hits).toEqual([
      { uri: `${A}/e/a`, label: "Abe" },
      { uri: `${B}/e/m`, label: "Mo" },
      { uri: `${A}/e/z`, label: "Zed" },
    ]);
    expect(found).toMatchObject({ complete: true, vaultsMissed: false });
  });

  it("is not whole when a page is not, and missed when a list failed", async () => {
    const part = await findAnyRecords([A], "", { list: (async () => page([], false)) as never });
    expect(part).toMatchObject({ complete: false, vaultsMissed: false });
    const failed = await findAnyRecords([A, B], "", {
      list: (async (v: string) => {
        if (v === B) throw new Error("x");
        return page([{ entityUri: `${A}/e/a`, label: "Abe", typeUri: "t:Person" }]);
      }) as never,
    });
    expect(failed).toMatchObject({ complete: false, vaultsMissed: true });
    expect(failed.hits).toHaveLength(1);
  });

  it("searches with no type conjunct when there is text, and keeps every kind it reads", async () => {
    const ann = `${A}/e/ann`;
    const s = vi.fn(async () => ({ ids: [ann], next: null }));
    const found = await findAnyRecords([A], " Ann ", {
      search: s as never,
      read: (async (id: string, at: string | null) => ({ id, entityUri: at ?? id, typeUri: "t:NoteDocument", facts: { label: "Ann's note" }, opaqueFacts: [], etag: null })) as never,
    });
    expect((s.mock.calls[0] as unknown[])[0]).toBe("Ann");
    expect(found.hits).toEqual([{ uri: ann, label: "Ann's note", typeName: "NoteDocument" }]);
  });
});
