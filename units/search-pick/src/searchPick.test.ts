import { expect, test } from "vitest";
import { SEARCH_COPY, phaseFromAnswer, phaseOnType } from "./searchPick";

test("a short query is not sent", () => {
  expect(phaseOnType("", 2).kind).toBe("idle");
  expect(phaseOnType("a", 2).kind).toBe("keep-typing");
  expect(phaseOnType("ab", 2).kind).toBe("loading");
});

test("empty and failed are not the same sentence", () => {
  const empty = phaseFromAnswer("chair", [], null);
  const failed = phaseFromAnswer("chair", null, "timed out");
  expect(empty.kind).toBe("empty");
  expect(failed.kind).toBe("error");
  expect(SEARCH_COPY.empty).not.toBe(SEARCH_COPY.error);
  expect(SEARCH_COPY.empty.toLowerCase()).toContain("does not mean");
});
