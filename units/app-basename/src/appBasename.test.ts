import { describe, expect, it } from "vitest";
import { appBasenameFrom } from "./appBasename";

describe("appBasenameFrom", () => {
  it("strips one trailing slash and turns a missing mount into an empty path", () => {
    expect(appBasenameFrom(undefined)).toBe("");
    expect(appBasenameFrom(null)).toBe("");
    expect(appBasenameFrom("/")).toBe("");
    expect(appBasenameFrom("/mynet/")).toBe("/mynet");
    expect(appBasenameFrom("/mynet")).toBe("/mynet");
    expect(appBasenameFrom("/mynet//")).toBe("/mynet/");
    expect(appBasenameFrom("")).toBe("");
    expect(appBasenameFrom("mynet/")).toBe("mynet");
    expect(appBasenameFrom(" /mynet/")).toBe(" /mynet");
  });
});