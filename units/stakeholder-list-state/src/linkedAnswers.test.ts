// @vitest-environment node
// New tests (the app's test of this list also goes through the sign-out reset, which is not taken): the session's deleted list, its listeners and its revision.
// The list is module state, so each test loads a fresh copy of the module.
import { beforeEach, describe, expect, it, vi } from "vitest";

let m: typeof import("./linkedAnswers");
beforeEach(async () => {
  vi.resetModules();
  m = await import("./linkedAnswers");
});

describe("the session's deleted list", () => {
  it("starts empty with revision 0", () => {
    expect(m.deletedLinkedRecords().size).toBe(0);
    expect(m.deletedLinkedRevision()).toBe(0);
  });
  it("a new deleted id tells once and moves the revision by one; the same id again tells nothing", () => {
    const heard = vi.fn();
    m.onDeletedLinkedRecords(heard);
    const r0 = m.deletedLinkedRevision();
    m.forgetDeletedLinkedRecord("x1");
    expect(heard).toHaveBeenCalledTimes(1);
    expect(m.deletedLinkedRevision()).toBe(r0 + 1);
    m.forgetDeletedLinkedRecord("x1");
    expect(heard).toHaveBeenCalledTimes(1);
    expect(m.deletedLinkedRevision()).toBe(r0 + 1);
  });
  it("an address and its bare id are the same record: the id is the last segment", () => {
    m.forgetDeletedLinkedRecord("https://a.platform.example.test/vault/e/x1");
    expect([...m.deletedLinkedRecords()]).toEqual(["x1"]);
    const heard = vi.fn();
    m.onDeletedLinkedRecords(heard);
    m.forgetDeletedLinkedRecord("x1");
    m.forgetDeletedLinkedRecord("https://b.platform.example.test/vault/e/x1");
    expect(heard).not.toHaveBeenCalled();
  });
  it("what deletedLinkedRecords answers is a copy: changing it changes nothing", () => {
    m.forgetDeletedLinkedRecord("x1");
    const copy = m.deletedLinkedRecords() as Set<string>;
    copy.add("y");
    copy.clear();
    expect([...m.deletedLinkedRecords()]).toEqual(["x1"]);
  });
  it("every listener is told, in the order it joined, and one that left is not told", () => {
    const order: string[] = [];
    const offA = m.onDeletedLinkedRecords(() => order.push("a"));
    m.onDeletedLinkedRecords(() => order.push("b"));
    m.forgetDeletedLinkedRecord("x1");
    expect(order).toEqual(["a", "b"]);
    offA();
    m.forgetDeletedLinkedRecord("x2");
    expect(order).toEqual(["a", "b", "b"]);
  });
  it("the revision is read by a listener at the moment it is told (the revision moves first)", () => {
    const seen: number[] = [];
    m.onDeletedLinkedRecords(() => seen.push(m.deletedLinkedRevision()));
    m.forgetDeletedLinkedRecord("x1");
    m.forgetDeletedLinkedRecord("x2");
    expect(seen).toEqual([1, 2]);
  });
  it("a listener that is told of a delete already finds the id in the list", () => {
    let seen: string[] = [];
    m.onDeletedLinkedRecords(() => (seen = [...m.deletedLinkedRecords()]));
    m.forgetDeletedLinkedRecord("x1");
    expect(seen).toEqual(["x1"]);
  });
  it("the unsubscribe answers whether the listener was there", () => {
    const off = m.onDeletedLinkedRecords(() => undefined);
    expect(off()).toBe(true);
    expect(off()).toBe(false);
  });
});
