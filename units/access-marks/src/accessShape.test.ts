import { expect, test } from "vitest";
import { vaultAccessShape } from "./accessShape";

test("read and write together", () => {
  expect(vaultAccessShape(["read", "write"])).toBe("read-and-write");
});

test("read alone", () => {
  expect(vaultAccessShape(["read"])).toBe("read");
});

test("write alone draws nothing that would claim a read", () => {
  expect(vaultAccessShape(["write"])).toBe("none");
  expect(vaultAccessShape([])).toBe("none");
});
