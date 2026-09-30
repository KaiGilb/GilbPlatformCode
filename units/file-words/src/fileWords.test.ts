import { expect, test } from "vitest";
import { fileFetchMessage } from "./fileWords";

test("only a confirmed miss says the file is gone", () => {
  expect(fileFetchMessage({ kind: "gone", url: "u" }, "Notes")).toContain("no longer");
  const forbidden = fileFetchMessage({ kind: "forbidden", status: 403, url: "u" }, "Notes");
  expect(forbidden).not.toContain("no longer");
  expect(forbidden).toContain("not allowed");
  const unaddressed = fileFetchMessage({ kind: "unaddressed", url: "u" });
  expect(unaddressed).not.toContain("no longer");
  expect(unaddressed).toContain("may still be there");
});

test("a transport failure does not invent a status", () => {
  expect(fileFetchMessage({ kind: "failed", status: null, url: "u", detail: null })).toContain("Couldn't reach");
  expect(fileFetchMessage({ kind: "failed", status: 500, url: "u", detail: null })).toContain("500");
});
