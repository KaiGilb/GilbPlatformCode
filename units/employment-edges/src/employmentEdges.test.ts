// Ported from GilbApp `employmentStore.c214e7.test.ts` (the four cases of "the record's a:employment edges", lines 190-213), re-based: the
// source mocked the record client; here the REAL `lws-records` and `record-fact-items` run against the in-memory vault of test/vault.ts.
// The 412 is the vault's own answer to a stale If-Match.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeEmploymentEdges, withEdge, withoutEdges } from "./index";
import { factOf, factsOf, hooks, seed, store, uriOf, writes } from "../test/vault";
import { setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const seedPerson = (facts: Record<string, unknown> = {}) => seed("t:Person", { name: "Bob", ...facts });

describe("the record's a:employment edges", () => {
  it("append writes the shape on the RECORD: a scalar ref, then an array, in order", async () => {
    const p = seedPerson();
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, "https://h.example.test/base/e/e1"));
    expect(factOf(p, "employment")).toEqual({ "@id": "https://h.example.test/base/e/e1" });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, "https://h.example.test/base/e/e2"));
    expect(factOf(p, "employment")).toEqual([{ "@id": "https://h.example.test/base/e/e1" }, { "@id": "https://h.example.test/base/e/e2" }]);
    expect(factOf(p, "name")).toBe("Bob");
  });

  it("changes the list AS STORED: an edge this card never read and a text value are carried; remove drops only its edge", async () => {
    const p = seedPerson({ employment: ["Acme (legacy text)", { "@id": "https://h.example.test/base/e/unread" }, { "@id": "https://h.example.test/base/e/mine" }] });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withoutEdges(s, ["https://h.example.test/base/e/mine"]));
    expect(factOf(p, "employment")).toEqual(["Acme (legacy text)", { "@id": "https://h.example.test/base/e/unread" }]);
  });

  it("the last edge removed retracts the fact; nothing changed writes nothing", async () => {
    const p = seedPerson({ employment: { "@id": "https://h.example.test/base/e/one" } });
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, "https://h.example.test/base/e/one"));
    expect(writes()).toHaveLength(0);
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withoutEdges(s, ["https://h.example.test/base/e/one"]));
    expect(factsOf(p)).not.toHaveProperty("employment");
  });

  it("a 412 re-reads the record and re-applies the change to what is stored now", async () => {
    const p = seedPerson({ employment: { "@id": "https://h.example.test/base/e/one" } });
    hooks.onPatch = (id, nth) => {
      if (nth === 1) {
        // Another session appended meanwhile: this write's If-Match is stale.
        const e = store.get(id)!;
        e.facts.employment = [{ "@id": "https://h.example.test/base/e/one" }, { "@id": "https://h.example.test/base/e/theirs" }];
        e.seq += 100;
      }
    };
    await changeEmploymentEdges(p, uriOf(p), "employment", (s) => withEdge(s, "https://h.example.test/base/e/mine"));
    expect(factOf(p, "employment")).toEqual([
      { "@id": "https://h.example.test/base/e/one" },
      { "@id": "https://h.example.test/base/e/theirs" },
      { "@id": "https://h.example.test/base/e/mine" },
    ]);
    expect(writes().map((w) => w.path)).toEqual([`/lws/r/${p}`, `/lws/r/${p}`]);
  });
});
