import { expect, test } from "vitest";
import { normalizeTypeName } from "./typeName";

test("every spelling of one type becomes the same bare name", () => {
  expect(normalizeTypeName("NoteDocument")).toBe("NoteDocument");
  expect(normalizeTypeName("t:NoteDocument")).toBe("NoteDocument");
  expect(normalizeTypeName("https://example.test/base/t/NoteDocument")).toBe("NoteDocument");
  expect(normalizeTypeName("NoteDocument.png")).toBe("NoteDocument");
});

test("empty and unusable stay empty", () => {
  expect(normalizeTypeName("")).toBeNull();
  expect(normalizeTypeName(null)).toBeNull();
  expect(normalizeTypeName("   ")).toBeNull();
});
