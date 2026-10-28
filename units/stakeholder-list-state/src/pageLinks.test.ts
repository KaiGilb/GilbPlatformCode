// @vitest-environment node
// New tests: the links of the records a page was read with, kept for the session, with listeners and a revision.
// The state is module state, so each test loads a fresh copy of the module.
import { beforeEach, describe, expect, it, vi } from "vitest";

let m: typeof import("./pageLinks");
beforeEach(async () => {
  vi.resetModules();
  m = await import("./pageLinks");
});

const ref = (id: string, body?: Record<string, unknown>) => ({ id, ...(body ? { body } : {}) });
const linked = (target: string) => ({ sameAs: { "@id": target } });

describe("notePageLinks", () => {
  it("keeps the link each body carries, read as the online-card-link unit reads it", () => {
    m.notePageLinks([ref("a", linked("https://k.platform.example.test/vault")), ref("b", {}), ref("c", { sameAs: "plain text" })]);
    expect(m.pageLinkOf("a")).toEqual({ state: "linked", target: "https://k.platform.example.test/vault" });
    expect(m.pageLinkOf("b")).toEqual({ state: "none" });
    expect(m.pageLinkOf("c")).toEqual({ state: "malformed" });
  });
  it("skips a row without a body: nothing is kept and nobody is told", () => {
    const heard = vi.fn();
    m.onPageLinks(heard);
    m.notePageLinks([ref("a")]);
    expect(m.pageLinkOf("a")).toBeUndefined();
    expect(heard).not.toHaveBeenCalled();
    expect(m.pageLinksRevision()).toBe(0);
  });
  it("tells once for a whole page, not once per row", () => {
    const heard = vi.fn();
    m.onPageLinks(heard);
    m.notePageLinks([ref("a", linked("x")), ref("b", linked("y"))]);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(m.pageLinksRevision()).toBe(1);
  });
  it("a record read again with the same link tells nothing; with another link it replaces the entry and tells", () => {
    m.notePageLinks([ref("a", linked("x"))]);
    const heard = vi.fn();
    m.onPageLinks(heard);
    m.notePageLinks([ref("a", linked("x"))]);
    expect(heard).not.toHaveBeenCalled();
    m.notePageLinks([ref("a", linked("y"))]);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(m.pageLinkOf("a")).toEqual({ state: "linked", target: "y" });
  });
  it("two links on one record are ambiguous, and no card is chosen", () => {
    m.notePageLinks([ref("a", { sameAs: [{ "@id": "x" }, { "@id": "y" }] })]);
    expect(m.pageLinkOf("a")).toEqual({ state: "ambiguous" });
  });
});

describe("forgetPageLink and forgetPageLinks", () => {
  it("forgetPageLink forgets one record and tells; a record that is not kept tells nothing", () => {
    m.notePageLinks([ref("a", linked("x")), ref("b", linked("y"))]);
    const heard = vi.fn();
    m.onPageLinks(heard);
    m.forgetPageLink("a");
    expect(m.pageLinkOf("a")).toBeUndefined();
    expect(m.pageLinkOf("b")).toBeDefined();
    expect(heard).toHaveBeenCalledTimes(1);
    m.forgetPageLink("a");
    expect(heard).toHaveBeenCalledTimes(1);
  });
  it("forgetPageLinks empties everything and tells; with nothing kept it tells nothing", () => {
    const heard = vi.fn();
    m.onPageLinks(heard);
    m.forgetPageLinks();
    expect(heard).not.toHaveBeenCalled();
    m.notePageLinks([ref("a", linked("x"))]);
    heard.mockClear();
    m.forgetPageLinks();
    expect(m.pageLinkOf("a")).toBeUndefined();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("listeners and revision", () => {
  it("the revision moves with every change that tells, and only then", () => {
    expect(m.pageLinksRevision()).toBe(0);
    m.notePageLinks([ref("a", linked("x"))]);
    expect(m.pageLinksRevision()).toBe(1);
    m.notePageLinks([ref("a", linked("x"))]);
    expect(m.pageLinksRevision()).toBe(1);
    m.forgetPageLink("a");
    expect(m.pageLinksRevision()).toBe(2);
  });
  it("a listener that left is not told, and the unsubscribe says whether it was there", () => {
    const heard = vi.fn();
    const off = m.onPageLinks(heard);
    expect(off()).toBe(true);
    expect(off()).toBe(false);
    m.notePageLinks([ref("a", linked("x"))]);
    expect(heard).not.toHaveBeenCalled();
  });
  it("a listener reads the new revision when it is told", () => {
    const seen: number[] = [];
    m.onPageLinks(() => seen.push(m.pageLinksRevision()));
    m.notePageLinks([ref("a", linked("x"))]);
    m.forgetPageLink("a");
    expect(seen).toEqual([1, 2]);
  });
});
