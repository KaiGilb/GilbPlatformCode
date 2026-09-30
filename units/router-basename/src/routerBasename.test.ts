import { describe, expect, it } from "vitest";
import { routerBasename } from "./routerBasename";

describe("routerBasename", () => {
  it("returns undefined for the origin root", () => {
    expect(routerBasename("/")).toBeUndefined();
    expect(routerBasename("")).toBeUndefined();
  });

  it("keeps a trailing slash", () => {
    expect(routerBasename("/desk/")).toBe("/desk/");
  });

  it("does not add a slash that was not there", () => {
    expect(routerBasename("/desk")).toBe("/desk");
  });

  it("does not trim or rewrite any other string", () => {
    expect(routerBasename("desk/")).toBe("desk/");
    expect(routerBasename("//")).toBe("//");
    expect(routerBasename(" /")).toBe(" /");
    expect(routerBasename("/desk/?x=1")).toBe("/desk/?x=1");
  });
});
