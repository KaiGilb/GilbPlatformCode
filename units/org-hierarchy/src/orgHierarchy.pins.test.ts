// More pins on the pure rule: the identity of an organization, and the shape of every answer.
import { describe, expect, it } from "vitest";
import { ORG_DEPTH_CAP, checkParentWrite, orgKey, walkUp, type ParentReader } from "./orgHierarchy";

describe("orgKey", () => {
  it.each([
    ["https://v.example.test/base/e/abc", "abc"],
    ["https://v.example.test/vault/e/abc", "abc"],
    ["https://v.example.test/base/e/abc/", "abc"],
    ["https://v.example.test/base/e/abc///", "abc"],
    ["https://v.example.test/base/e/abc?x=1", "abc"],
    ["https://v.example.test/base/e/abc#frag", "abc"],
    ["  https://v.example.test/base/e/abc  ", "abc"],
    ["abc", "abc"],
    ["", ""],
  ])("%j is %j", (uri, key) => {
    expect(orgKey(uri)).toBe(key);
  });
  it("reads a null or undefined address as the empty key", () => {
    expect(orgKey(null as unknown as string)).toBe("");
    expect(orgKey(undefined as unknown as string)).toBe("");
  });
  it("a trailing slash does not make a loop invisible: the same record named with and without it is one", async () => {
    const read: ParentReader = async (uri) =>
      uri.endsWith("/a") ? { state: "ok", parent: "https://v.example.test/base/e/b/", label: "A" } : { state: "ok", parent: "https://v.example.test/base/e/a/", label: "B" };
    expect((await walkUp("https://v.example.test/base/e/a", read)).end).toBe("loop");
  });
});

describe("the answers of the rule, exactly", () => {
  it("ORG_DEPTH_CAP is 20", () => {
    expect(ORG_DEPTH_CAP).toBe(20);
  });
  it("the refusal messages are the sentences the group shows", async () => {
    const e = (id: string) => `https://v.example.test/base/e/${id}`;
    const rows: Record<string, string | null> = { a: null, c: "d", d: "c", z: null };
    const read: ParentReader = async (uri) => {
      const id = uri.split("/").pop()!;
      return id in rows ? { state: "ok", parent: rows[id] === null ? null : e(rows[id]!), label: id } : { state: "unreadable" };
    };
    expect(await checkParentWrite(e("a"), e("a"), read)).toEqual({ ok: false, reason: "self", message: "An organization cannot be its own parent." });
    expect(await checkParentWrite(e("a"), e("c"), read)).toEqual({ ok: false, reason: "loop", message: "That organization's chain already loops, so it cannot be used as a parent." });
    expect(await checkParentWrite(e("a"), e("zzz"), read)).toEqual({ ok: false, reason: "unreadable", message: "A link above that organization cannot be read, so a loop cannot be ruled out." });
    const deep: ParentReader = async (uri) => ({ state: "ok", parent: e(`o${Number(uri.split("/").pop()!.slice(1)) + 1}`), label: "x" });
    expect(await checkParentWrite(e("a"), e("o0"), deep)).toEqual({ ok: false, reason: "too-deep", message: "That chain is deeper than 20 levels." });
    expect(await checkParentWrite(e("a"), e("a"), read, 7)).toMatchObject({ ok: false, reason: "self" });
    expect((await checkParentWrite(e("a"), e("o0"), deep, 7)) as { message: string }).toMatchObject({ message: "That chain is deeper than 7 levels." });
  });
  it("the walk keeps the label the reader gave each level, and marks a level it could not read as not visible", async () => {
    const e = (id: string) => `https://v.example.test/base/e/${id}`;
    const read: ParentReader = async (uri) => (uri === e("c") ? { state: "ok", parent: e("b"), label: "C" } : uri === e("b") ? { state: "ok", parent: e("a"), label: "B" } : { state: "unreadable" });
    const up = await walkUp(e("c"), read);
    expect(up).toEqual({ chain: [{ uri: e("b"), label: "B", visible: true }, { uri: e("a"), label: null, visible: false }], end: "not-visible" });
  });
});
