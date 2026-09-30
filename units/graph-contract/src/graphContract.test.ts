import { expect, test } from "vitest";
import { isActiveGraphAction, resolveGraphContract } from "./graphContract";

test("a known experience is used, and an unknown name stays on records", () => {
  expect(resolveGraphContract("browse")).toEqual({ onNodeClick: "select", onNodeDoubleClick: "none" });
  expect(resolveGraphContract("no-such")).toEqual({ onNodeClick: "select", onNodeDoubleClick: "navigate" });
  expect(resolveGraphContract({ onNodeClick: "none", onNodeDoubleClick: "none" }).onNodeClick).toBe("none");
});

test("none is not an active action", () => {
  expect(isActiveGraphAction("navigate")).toBe(true);
  expect(isActiveGraphAction("none")).toBe(false);
});
