// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as unit from "./index";
import * as describeEntry from "./describe";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(["AccessDeniedScreen", "NoAccessError", "VaultBusyError", "readRefusal", "refusalLine"].sort());
  });
  it('"./describe" is exactly these values, and the root entry does not reach it', () => {
    expect(Object.keys(describeEntry).sort()).toEqual(["DESCRIBE_WORDS", "describeError"]);
    expect(readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8")).not.toMatch(/describe/);
  });
  it('"./describe" imports only ./refusal (no package, so the root entry\'s peers are all it needs)', () => {
    const imports = [...readFileSync(fileURLToPath(new URL("./describe.ts", import.meta.url)), "utf8").matchAll(/^import .*? from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual(["./refusal"]);
  });
});
