import { expect, test } from "vitest";
import { fieldControlKind, fieldInputType } from "./fieldControl";

test("each kind picks one control", () => {
  expect(fieldControlKind("textarea")).toBe("textarea");
  expect(fieldControlKind("select")).toBe("select");
  expect(fieldControlKind("email")).toBe("input");
  expect(fieldInputType("email")).toBe("email");
  expect(fieldInputType("url")).toBe("url");
  expect(fieldInputType("date")).toBe("date");
  expect(fieldInputType("text")).toBe("text");
  expect(fieldInputType("textarea")).toBe("text");
});
