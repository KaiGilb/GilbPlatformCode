import { expect, test } from "vitest";
import { isExactPrincipal, isPublicReadEdge } from "./principalMark";

const MARKER = "marker:everyone";

test("only the exact id is the marker", () => {
  expect(isExactPrincipal(MARKER, MARKER)).toBe(true);
  expect(isExactPrincipal(`${MARKER}/extra`, MARKER)).toBe(false);
  expect(isExactPrincipal(MARKER, "")).toBe(false);
  expect(isExactPrincipal(null, MARKER)).toBe(false);
});

test("public read includes a write edge and refuses a near miss", () => {
  expect(isPublicReadEdge({ kind: "public", mode: "read" }, MARKER)).toBe(true);
  expect(isPublicReadEdge({ sourceVault: MARKER, mode: "write" }, MARKER)).toBe(true);
  expect(isPublicReadEdge({ sourceVault: `${MARKER}s`, mode: "read" }, MARKER)).toBe(false);
  expect(isPublicReadEdge({ kind: "public", mode: "append" }, MARKER)).toBe(false);
});
