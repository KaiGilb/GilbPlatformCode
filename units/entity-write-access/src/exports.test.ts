// @vitest-environment node
// New. Pins the entry point: the stateful half of the source file, and `ENTITY_READ_ONLY_REASON` as `record-write` has it.
import { expect, it } from "vitest";
import { ENTITY_READ_ONLY_REASON as FROM_RECORD_WRITE, entityWriteAllowed as PURE } from "@kaigilb/gilbplatformcode-record-write";
import * as unit from "./index";

it("exports exactly the memory, its two hooks, the stateful entityWriteAllowed and the reason", () => {
  expect(Object.keys(unit).sort()).toEqual([
    "ENTITY_READ_ONLY_REASON",
    "clearEntityWriteDenials",
    "entityWriteAllowed",
    "isEntityWriteDenied",
    "markEntityWriteDenied",
    "useEntityCanWrite",
    "useMarkEntityWriteDenied",
  ]);
});
it("the pure half is NOT here: no recordWriteAllowed, no sessionIdentityKeys, no key lists", () => {
  for (const name of ["recordWriteAllowed", "sessionIdentityKeys", "STORED_BY_KEYS", "GRANT_READER_KEYS", "GRANT_WRITER_KEYS"]) expect(unit).not.toHaveProperty(name);
});
it("the reason is the very string `record-write` exports", () => {
  expect(unit.ENTITY_READ_ONLY_REASON).toBe(FROM_RECORD_WRITE);
});
it("the stateful entityWriteAllowed takes two arguments; record-write's takes three (the pin)", () => {
  expect(unit.entityWriteAllowed.length).toBe(2);
  expect(PURE.length).toBe(3);
});
it("arities: useEntityCanWrite 3 (identityKeys is optional), useMarkEntityWriteDenied 0", () => {
  expect(unit.useEntityCanWrite.length).toBe(3);
  expect(unit.useMarkEntityWriteDenied.length).toBe(0);
});
it("the reason is defined in ONE unit only: this unit's source never assigns it", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const text = readFileSync(fileURLToPath(new URL("./entityWriteAccess.ts", import.meta.url)), "utf8");
  expect(text).not.toMatch(/ENTITY_READ_ONLY_REASON\s*[:=]/);
  expect(text).not.toMatch(/You can read this item/);
  expect(text).toMatch(/export \{ ENTITY_READ_ONLY_REASON \} from "@kaigilb\/gilbplatformcode-record-write"/);
});
