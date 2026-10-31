// New. What the edge writer sends, read off the wire: one PATCH of the one key, conditional on the read; a null only when the last edge is removed;
// items that are not edges are carried untouched; two writers on one record are queued; the pure helpers.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEmploymentEdges, edgeIdOf, storedEdgeItems, withEdge, withoutEdges } from "./index";
import { etagOf, factOf, requests, seed, store, uriOf, wireNulls, writes } from "../test/vault";
import { setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const E1 = "https://h.example.test/base/e/e1";
const E2 = "https://h.example.test/base/e/e2";
const person = (facts: Record<string, unknown> = {}) => seed("t:Person", { name: "Bob", ...facts });

describe("the wire of an edge change", () => {
  it("is ONE patch of the one key, conditional on the version just read", async () => {
    const p = person({ employment: { "@id": E1 } });
    const tag = etagOf(store.get(p)!.seq);
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, E2));
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.method).toBe("PATCH");
    expect(writes()[0]!.ifMatch).toBe(tag);
    expect(Object.keys(writes()[0]!.body!)).toEqual(["a:employment"]);
    expect(wireNulls()).toEqual([]);
  });
  it("takes the key it is handed, with or without the a: prefix, and writes that key", async () => {
    const p = person({ employment: { "@id": E2 } });
    await changeEmploymentEdges(p, uriOf(p), "a:worksAt", (s) => withEdge(s, E1));
    await changeEmploymentEdges(p, uriOf(p), "worksAt", (s) => withEdge(s, E2));
    expect(factOf(p, "worksAt")).toEqual([{ "@id": E1 }, { "@id": E2 }]);
    expect(factOf(p, "employment")).toEqual({ "@id": E2 });
  });
  it("a null goes on the wire only when the person removed the last edge", async () => {
    const p = person({ employment: [{ "@id": E1 }, { "@id": E2 }] });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withoutEdges(s, [E1]));
    expect(wireNulls()).toEqual([]);
    expect(factOf(p, "employment")).toEqual({ "@id": E2 });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withoutEdges(s, [E2]));
    expect(wireNulls()).toEqual(["a:employment"]);
    expect(factOf(p, "employment")).toBeUndefined();
  });
  it("a removal that leaves a text value keeps it, so the key is not retracted", async () => {
    const p = person({ employment: ["Acme (legacy text)", { "@id": E1 }] });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withoutEdges(s, [E1]));
    expect(wireNulls()).toEqual([]);
    expect(factOf(p, "employment")).toBe("Acme (legacy text)");
  });
  it("writes nothing when removing an edge that is not there", async () => {
    const p = person({ employment: { "@id": E1 } });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withoutEdges(s, [E2]));
    expect(writes()).toHaveLength(0);
  });
  it("never touches another key of the record", async () => {
    const p = person({ employment: { "@id": E1 }, givenName: "Bob", skill: [{ "@id": E2 }] });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, E2));
    expect(store.get(p)!.facts.givenName).toBe("Bob");
    expect(store.get(p)!.facts.skill).toEqual([{ "@id": E2 }]);
  });
  it("two changes on one record run one after the other and both land", async () => {
    const p = person();
    await Promise.all([
      changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, E1)),
      changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, E2)),
    ]);
    expect(factOf(p, "employment")).toEqual([{ "@id": E1 }, { "@id": E2 }]);
    const order = requests.filter((r) => r.path === `/lws/r/${p}`).map((r) => r.method);
    expect(order).toEqual(["GET", "PATCH", "GET", "PATCH"]);
  });
  it("a record that cannot be read is an error and nothing is sent", async () => {
    await expect(changeEmploymentEdges("06gknone", "https://hytta.platform.example.test/base/e/06gknone", "employment", (s) => withEdge(s, E1))).rejects.toThrow(/could not be read/);
    expect(writes()).toHaveLength(0);
  });
});

describe("the helpers", () => {
  it("edgeIdOf: an {@id}, or an http(s) string; anything else is not an edge", () => {
    expect(edgeIdOf({ "@id": E1 })).toBe(E1);
    expect(edgeIdOf(E1)).toBe(E1);
    expect(edgeIdOf("Acme (legacy text)")).toBeNull();
    expect(edgeIdOf({ "@id": "" })).toBeNull();
    expect(edgeIdOf({ name: "x" })).toBeNull();
    expect(edgeIdOf(null)).toBeNull();
  });
  it("storedEdgeItems: a scalar is a one-item list, nothing is none", () => {
    expect(storedEdgeItems({ "@id": E1 })).toEqual([{ "@id": E1 }]);
    expect(storedEdgeItems(undefined)).toEqual([]);
    expect(storedEdgeItems([E1, E2])).toEqual([E1, E2]);
  });
  it("withEdge appends once; a string edge counts as held", () => {
    expect(withEdge([E1], E1)).toEqual([E1]);
    expect(withEdge([{ "@id": E1 }], E2)).toEqual([{ "@id": E1 }, { "@id": E2 }]);
  });
  it("withoutEdges drops only edges that are named and carries every other item as it is", () => {
    const odd = { name: "not an edge" };
    expect(withoutEdges(["text", odd, { "@id": E1 }, E2], [E1, E2])).toEqual(["text", odd]);
  });
});
