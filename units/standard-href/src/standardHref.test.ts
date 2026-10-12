import { describe, expect, test } from "vitest";
import { standardHref } from "./standardHref";

const BASE = "https://app.example.test/baseapp/";
describe("standardHref", () => {
  test("a procedure in another vault: vault first, then the tab and its param", () => {
    const u = new URL(standardHref(BASE, { tab: "procedures", param: "pr", id: "06abc", vaultId: "v9" }));
    expect(u.origin + u.pathname).toBe(BASE);
    expect([...u.searchParams]).toEqual([["pod", "v9"], ["section", "standards"], ["stab", "procedures"], ["pr", "06abc"]]);
  });
  test("the processes tab is the default, so it sets no stab; a non-default kind sets pk", () => {
    const u = new URL(standardHref(BASE, { tab: "processes", param: "std", id: "x", processKind: "procedure" }));
    expect(u.searchParams.get("stab")).toBeNull();
    expect(u.searchParams.get("pk")).toBe("procedure");
    expect(new URL(standardHref(BASE, { tab: "processes", param: "std", id: "x" })).searchParams.get("pk")).toBeNull();
  });
  test("a relative base is refused", () => {
    expect(() => standardHref("/baseapp/", { tab: "rules", param: "rs", id: "x" })).toThrow(TypeError);
  });
});

describe("standardHref, the query it replaces", () => {
  test("a query already on the editor base is replaced, not kept", () => {
    const u = new URL(standardHref("https://app.example.test/baseapp/?section=records&x=1", { tab: "rules", param: "rs", id: "r1" }));
    expect([...u.searchParams]).toEqual([["section", "standards"], ["stab", "rules"], ["rs", "r1"]]);
  });
  test("the id is encoded, not passed raw", () => {
    const href = standardHref("https://app.example.test/", { tab: "rules", param: "rs", id: "a b&c" });
    expect(new URL(href).searchParams.get("rs")).toBe("a b&c");
    expect(href).not.toContain("a b&c");
  });
});
