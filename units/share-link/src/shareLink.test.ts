import { expect, test } from "vitest";
import { buildShareLink, parseShareFragment, viewStateToLocation } from "./shareLink";

test("a token in the address is not in the link", () => {
  const built = buildShareLink("https://example.test", "/records", "?rec=abc&token=secret&fv=folder", "");
  expect(built.ok).toBe(true);
  if (!built.ok) return;
  const hash = built.url.slice(built.url.indexOf("#"));
  const state = parseShareFragment(hash);
  expect(state?.params.rec).toBe("abc");
  expect(state?.params.fv).toBe("folder");
  expect(JSON.stringify(state)).not.toContain("secret");
  expect(viewStateToLocation(state!)).toBe("/records?rec=abc&fv=folder");
});

test("an off-site path is dropped", () => {
  const built = buildShareLink("https://example.test", "//evil.test", "", "");
  expect(built.ok).toBe(true);
  if (!built.ok) return;
  const state = parseShareFragment(built.url.slice(built.url.indexOf("#")));
  expect(state?.path).toBe("/");
});

test("a view that does not fit is refused, not cut", () => {
  const huge = "x".repeat(4000);
  const built = buildShareLink("https://example.test", "/records", `?rec=${huge}`, "");
  expect(built.ok).toBe(false);
  if (built.ok) return;
  expect(built.reason).toBe("over-budget");
});
