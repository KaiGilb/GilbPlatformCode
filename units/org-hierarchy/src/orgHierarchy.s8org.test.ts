// The parent chain, the writer's refusal of a loop, the reader's safe walk. The platform does NOT enforce `a:acyclic` for this term, so the writer checks and every reader walks with a visited set and a depth cap.
import { describe, expect, it } from "vitest";
import { ORG_DEPTH_CAP, checkParentWrite, walkUp, type ParentReader } from "./orgHierarchy";

const U = (n: string) => `https://v.example.test/base/e/${n}`;

/** A reader over a table: org -> parent (or null), a name for an org that is not in the table = unreadable. */
function table(rows: Record<string, string | null>, calls: string[] = []): ParentReader {
  return async (uri) => {
    calls.push(uri);
    const id = uri.split("/").pop()!;
    if (!(id in rows)) return { state: "unreadable" };
    const p = rows[id];
    return { state: "ok", parent: p === null ? null : U(p), label: `Org ${id}` };
  };
}

describe("walkUp", () => {
  it("reads a chain up to the head office", async () => {
    const r = await walkUp(U("c"), table({ c: "b", b: "a", a: null }));
    expect(r.end).toBe("head");
    expect(r.chain.map((n) => n.uri)).toEqual([U("b"), U("a")]);
  });
  it("an organization with no parent has an empty chain that ends at the head", async () => {
    expect(await walkUp(U("a"), table({ a: null }))).toEqual({ chain: [], end: "head" });
  });
  it("ends 'not-visible' where a parent cannot be read, keeping what was read", async () => {
    const r = await walkUp(U("c"), table({ c: "b", b: "zzz" }));
    expect(r.end).toBe("not-visible");
    expect(r.chain.map((n) => n.uri)).toEqual([U("b"), U("zzz")]);
    expect(r.chain[1]!.visible).toBe(false);
  });
  it("a reader that throws is 'not-visible', never an absence of a parent", async () => {
    const r = await walkUp(U("c"), async () => {
      throw new Error("503");
    });
    expect(r).toEqual({ chain: [], end: "not-visible" });
  });
  it("shows a stored loop as 'loop' and never follows it", async () => {
    const calls: string[] = [];
    const r = await walkUp(U("a"), table({ a: "b", b: "c", c: "a" }, calls));
    expect(r.end).toBe("loop");
    expect(r.chain.map((n) => n.uri)).toEqual([U("b"), U("c")]);
    expect(calls.length).toBeLessThanOrEqual(3); // a, b, c — each read once
  });
  it("an organization that is its own parent is a loop", async () => {
    expect((await walkUp(U("a"), table({ a: "a" }))).end).toBe("loop");
  });
  it("stops at the depth cap", async () => {
    const rows: Record<string, string | null> = {};
    for (let i = 0; i < 60; i++) rows[`o${i}`] = `o${i + 1}`;
    rows.o60 = null;
    const calls: string[] = [];
    const r = await walkUp(U("o0"), table(rows, calls));
    expect(r.end).toBe("too-deep");
    expect(r.chain.length).toBe(ORG_DEPTH_CAP);
    expect(calls.length).toBeLessThanOrEqual(ORG_DEPTH_CAP + 1);
  });
  it("a chain of exactly the cap that reaches the head is 'head'", async () => {
    const rows: Record<string, string | null> = {};
    for (let i = 0; i < ORG_DEPTH_CAP; i++) rows[`o${i}`] = `o${i + 1}`;
    rows[`o${ORG_DEPTH_CAP}`] = null;
    const r = await walkUp(U("o0"), table(rows));
    expect(r.end).toBe("head");
    expect(r.chain.length).toBe(ORG_DEPTH_CAP);
  });
  it("compares organizations by their entity id, so the same org on two hosts is one", async () => {
    const reader: ParentReader = async (uri) =>
      uri.endsWith("/a") ? { state: "ok", parent: "https://other.example.test/base/e/b", label: "A" } : { state: "ok", parent: "https://v.example.test/base/e/a", label: "B" };
    expect((await walkUp(U("a"), reader)).end).toBe("loop");
  });
  it("reads the head's label and the parent's as the reader gave them", async () => {
    const r = await walkUp(U("b"), table({ b: "a", a: null }));
    expect(r.chain[0]).toMatchObject({ uri: U("a"), label: "Org a", visible: true });
  });
});

describe("checkParentWrite", () => {
  it("refuses an organization as its own parent", async () => {
    expect(await checkParentWrite(U("a"), U("a"), table({ a: null }))).toMatchObject({ ok: false, reason: "self" });
  });
  it("refuses a child as the parent (a two-loop)", async () => {
    expect(await checkParentWrite(U("a"), U("b"), table({ a: null, b: "a" }))).toMatchObject({ ok: false, reason: "loop" });
  });
  it("refuses a grandchild as the parent", async () => {
    expect(await checkParentWrite(U("a"), U("c"), table({ a: null, b: "a", c: "b" }))).toMatchObject({ ok: false, reason: "loop" });
  });
  it("refuses when a link above the proposed parent cannot be read (no guessing)", async () => {
    expect(await checkParentWrite(U("a"), U("c"), table({ a: null, c: "zzz" }))).toMatchObject({ ok: false, reason: "unreadable" });
  });
  it("refuses when the chain above the proposed parent is already a stored loop", async () => {
    expect(await checkParentWrite(U("a"), U("c"), table({ a: null, c: "d", d: "c" }))).toMatchObject({ ok: false, reason: "loop" });
  });
  it("refuses a chain that passes the depth cap", async () => {
    const rows: Record<string, string | null> = { child: null };
    for (let i = 0; i < 60; i++) rows[`o${i}`] = `o${i + 1}`;
    rows.o60 = null;
    expect(await checkParentWrite(U("child"), U("o0"), table(rows))).toMatchObject({ ok: false, reason: "too-deep" });
  });
  it("accepts an unrelated parent", async () => {
    expect(await checkParentWrite(U("c"), U("a"), table({ a: null, c: null }))).toEqual({ ok: true });
  });
  it("accepts clearing the parent", async () => {
    expect(await checkParentWrite(U("c"), null, table({ c: "a" }))).toEqual({ ok: true });
  });
  it("an unreadable proposed parent is refused (its chain is unknown)", async () => {
    expect(await checkParentWrite(U("c"), U("zzz"), table({ c: null }))).toMatchObject({ ok: false, reason: "unreadable" });
  });
});
