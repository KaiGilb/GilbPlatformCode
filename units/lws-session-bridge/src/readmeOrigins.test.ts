// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README configureLiveApp example", () => {
  // Spec: friction #45 — a new app did not know the production origins; the example names them.
  it("names the production platform and identity origins and the env names an app reads them from", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    for (const s of ["https://gilb.com", "https://id.gilb.com", "VITE_PLATFORM_ORIGIN"]) expect(readme).toContain(s);
  });
});
