import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PARTIAL_LEVEL, PlanFindLimitNote } from "./index";
import { PLAN_FIND_CAP, PLAN_FIND_CAP_PART_OF, planCapSentence, planFindCapFor, planFindRows, planUnreadSentence } from "./planFind";
import { planVaultOf, vaultIdOfEntity } from "./planVault";
import { MAX_PARALLEL_DEREFERENCES, mapWithConcurrency } from "./mapWithConcurrency";
import { WRITE_CONFLICT, applyPatch } from "./planRowCache";
import { writeSource } from "./writeSource";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";

describe("planFind (private copy)", () => {
  it("caps a find at 300, and a Value's children at 2000", () => {
    expect(PLAN_FIND_CAP).toBe(300);
    expect(PLAN_FIND_CAP_PART_OF).toBe(2000);
    expect(planFindCapFor(false)).toBe(300);
    expect(planFindCapFor(true)).toBe(2000);
  });
  it("planFindRows is the rows, or none for no find", () => {
    expect(planFindRows(undefined)).toEqual([]);
    const rows = [{ id: "a" }] as never;
    expect(planFindRows({ rows, total: 1, capped: false, unread: 0 })).toBe(rows);
  });
  it("says how many are shown of how many, and what could not be read", () => {
    expect(planCapSentence(500, "parts")).toBe("Showing the first 300 of 500 parts at this level.");
    expect(planCapSentence(500, "parts", 50)).toBe("Showing the first 50 of 500 parts at this level.");
    expect(planUnreadSentence(1, "part")).toBe("1 part could not be read. Try again");
    expect(planUnreadSentence(2, "part")).toBe("2 parts could not be read. Try again");
    expect(planUnreadSentence(2, "child", "children")).toBe("2 children could not be read. Try again");
  });
});

describe("planVault (private copy)", () => {
  it("the vault of an entity address is what comes before /e/", () => {
    expect(vaultIdOfEntity("https://h.example.test/base/e/x")).toBe("https://h.example.test/base");
    expect(vaultIdOfEntity("https://h.example.test/base")).toBeNull();
    expect(vaultIdOfEntity("/e/x")).toBeNull();
  });
  it("a record's own address wins; the screen vault is only the fallback", () => {
    expect(planVaultOf({ entityUri: "https://p.example.test/base/e/x" }, "https://s.example.test/base")).toBe("https://p.example.test/base");
    expect(planVaultOf({}, "https://s.example.test/base")).toBe("https://s.example.test/base");
    expect(planVaultOf({ entityUri: null }, "https://s.example.test/base")).toBe("https://s.example.test/base");
    expect(planVaultOf({ entityUri: "no-slash" }, "https://s.example.test/base")).toBe("https://s.example.test/base");
  });
});

describe("mapWithConcurrency (private copy)", () => {
  it("allows 6 in flight", () => {
    expect(MAX_PARALLEL_DEREFERENCES).toBe(6);
  });
  it("returns the results in the order of the items, with no more than the limit in flight", async () => {
    let live = 0;
    let max = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      live += 1;
      max = Math.max(max, live);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      live -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(max).toBe(3);
  });
  it("an empty list is an empty answer and runs nothing", async () => {
    const fn = vi.fn();
    expect(await mapWithConcurrency([], 3, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
  it("a limit below 1 still runs one at a time", async () => {
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n)).toEqual([1, 2]);
  });
  it("a failure starts no further item (the other worker stops after its own item), and rejects with the first error", async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("two");
        await new Promise((r) => setTimeout(r, 10));
        return n;
      }),
    ).rejects.toThrow("two");
    expect(started).toEqual([1, 2]);
  });
});

describe("applyPatch (private copy of the row cache's)", () => {
  const row: GridRecord = {
    id: "a",
    entityUri: "https://p.example.test/base/e/a",
    typeUri: "t:SpecificationElement",
    facts: { unitTag: "Sol.A", body: "old" },
    opaqueFacts: ["lineSources"],
    etag: '"1"',
    updatedAt: 1,
    servedKeys: ["unitTag", "body", "lineSources"],
    served: { facts: { unitTag: "Sol.A", body: "old", lineSources: [] }, context: "ctx", etag: '"1"', prefixedKeys: ["body"] },
  };
  it("sets a fact as its text and as its served value, keeps the row's other fields, and takes the new version", () => {
    const next = applyPatch(row, { body: "new" }, '"2"');
    expect(next.facts).toEqual({ unitTag: "Sol.A", body: "new" });
    expect(next.served!.facts.body).toBe("new");
    expect(next.etag).toBe('"2"');
    expect(next.served!.etag).toBe('"2"');
    expect(next.served!.context).toBe("ctx");
    expect(next.served!.prefixedKeys).toEqual(["body"]);
    expect(next.id).toBe("a");
    expect(row.facts.body).toBe("old");
  });
  it("null removes the fact, its served value, its served key and its opaque mark", () => {
    const next = applyPatch(row, { body: null, lineSources: null }, null);
    expect(next.facts).toEqual({ unitTag: "Sol.A" });
    expect("body" in next.served!.facts).toBe(false);
    expect(next.opaqueFacts).toEqual([]);
    expect(next.servedKeys).toEqual(["unitTag"]);
    expect(next.etag).toBeNull();
  });
  it("keepOpaque leaves the opaque list alone", () => {
    expect(applyPatch(row, { lineSources: null }, '"2"', { keepOpaque: true }).opaqueFacts).toEqual(["lineSources"]);
  });
  it("a link is written as its address, a list as its items, a number as text; an object that is not a link is marked opaque; a link, a list of text and a number are not", () => {
    const next = applyPatch(row, { partOf: { "@id": "https://p.example.test/base/e/b" }, elementOrder: 3, tags: ["x", "y"], shape: { a: 1 } }, '"2"');
    expect(next.facts.partOf).toBe("https://p.example.test/base/e/b");
    expect(next.facts.elementOrder).toBe("3");
    expect(next.facts.tags).toBe("x, y");
    expect(next.servedKeys).toContain("elementOrder");
    expect(next.servedKeys).toContain("partOf");
    expect(next.opaqueFacts).toContain("shape");
    expect(next.opaqueFacts).not.toContain("tags");
    expect(next.opaqueFacts).not.toContain("elementOrder");
    expect(next.opaqueFacts).not.toContain("partOf");
  });
  it("names the error a refused write carries once the card has said so", () => {
    expect(WRITE_CONFLICT).toBe("WRITE_CONFLICT");
  });
});

describe("writeSource (private copy)", () => {
  it("is empty for a record with no served keys, so the call has the same number of arguments", () => {
    expect(writeSource({})).toEqual([]);
    expect(writeSource({ servedKeys: [] })).toEqual([]);
  });
  it("names the record's address and its served keys", () => {
    expect(writeSource({ entityUri: "https://p.example.test/base/e/a", servedKeys: ["body"] })).toEqual([{ at: "https://p.example.test/base/e/a", servedKeys: ["body"] }]);
    expect(writeSource({ servedKeys: ["body"] })).toEqual([{ at: null, servedKeys: ["body"] }]);
  });
});

describe("PlanFindLimitNote", () => {
  const html = (data: Parameters<typeof PlanFindLimitNote>[0]["data"], partialSentence?: string | null) =>
    renderToStaticMarkup(createElement("div", null, PlanFindLimitNote({ data, word: "parts", singular: "part", onRetry: () => {}, ...(partialSentence !== undefined ? { partialSentence } : {}) })));
  it("draws nothing for no find, or a whole one", () => {
    expect(PlanFindLimitNote({ data: undefined, word: "parts", singular: "part", onRetry: () => {} })).toBeNull();
    expect(PlanFindLimitNote({ data: null, word: "parts", singular: "part", onRetry: () => {} })).toBeNull();
    expect(PlanFindLimitNote({ data: { rows: [], total: 0, capped: false, unread: 0 }, word: "parts", singular: "part", onRetry: () => {} })).toBeNull();
  });
  it("a cut find says how many of how many, with Try again", () => {
    const out = html({ rows: [], total: 500, capped: true, unread: 0, cap: 300 });
    expect(out).toContain("Showing the first 300 of 500 parts at this level.");
    expect(out).toContain(">Try again</button>");
    expect(out).not.toContain("could not be read");
  });
  it("an unread count is a button that says so, and the partial sentence follows when asked for", () => {
    const out = html({ rows: [], total: 5, capped: false, unread: 2 }, PARTIAL_LEVEL);
    expect(out.indexOf("2 parts could not be read. Try again")).toBeLessThan(out.indexOf(PARTIAL_LEVEL));
    expect(out.indexOf(PARTIAL_LEVEL)).toBeLessThan(out.lastIndexOf("Try again</button>"));
    expect(html({ rows: [], total: 5, capped: false, unread: 2 })).not.toContain(PARTIAL_LEVEL);
    expect(html({ rows: [], total: 5, capped: false, unread: 1 })).toContain("1 part could not be read. Try again");
  });
  it("both buttons call the retry", async () => {
    const { render, screen, cleanup } = await import("@testing-library/react");
    const onRetry = vi.fn();
    render(createElement("div", null, PlanFindLimitNote({ data: { rows: [], total: 5, capped: true, unread: 2, cap: 3 }, word: "parts", singular: "part", onRetry })));
    for (const b of screen.getAllByRole("button")) b.click();
    expect(onRetry).toHaveBeenCalledTimes(2);
    cleanup();
  });
  it("PARTIAL_LEVEL is the sentence the levels show", () => {
    expect(PARTIAL_LEVEL).toBe("Some parts at this level are not shown. Moves here read the whole level first.");
  });
});
