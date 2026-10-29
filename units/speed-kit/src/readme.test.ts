// @vitest-environment node
// The wiring example in the README is the consumer file, character for character.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");
test("the README's tsx block is examples/consumer/src/main.tsx", () => {
  const blocks = [...at("README.md").matchAll(/```tsx\n([\s\S]*?)```/g)].map((m) => m[1]);
  expect(blocks).toEqual([at("examples/consumer/src/main.tsx")]);
});
test("the README's install line is the one the library prints for this unit", () => {
  const order = ["device-store", "principal-hub", "background-jobs", "prefetch-registry", "record-sync", "session-cache", "updated-line", "use-cached", "speed-kit"];
  const line = `npm install react@^19.0.0 ${order.map((u) => `<path-to-the-library>/units/${u}`).join(" ")}`;
  expect(at("README.md")).toContain(line);
});
