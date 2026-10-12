import { expect, test } from "vitest";
import { cn } from "./cn";

test("the later of two conflicting Tailwind classes wins", () => {
  expect(cn("p-4", "p-2")).toBe("p-2");
  expect(cn("bg-[var(--surface)]", "bg-[var(--accent)]")).toBe("bg-[var(--accent)]");
});

test("classes that do not conflict are all kept, in order", () => {
  expect(cn("rounded-[var(--r-lg)] border", "p-4")).toBe("rounded-[var(--r-lg)] border p-4");
});

test("falsy values are dropped; objects and arrays are read", () => {
  expect(cn("a", false, null, undefined, "", { b: true, c: false }, ["d", ["e"]])).toBe("a b d e");
});

test("no input is an empty string", () => {
  expect(cn()).toBe("");
});
