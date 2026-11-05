// @vitest-environment node
// The inline defineProps shape in ParallaxLayer.vue and the exported ParallaxLayerProps must stay the same type.
// vue-tsc is what fails when they diverge: vitest does not typecheck, so this test runs vue-tsc.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { AllowedComponentProps, VNodeProps } from "vue";
import type ParallaxLayer from "./ParallaxLayer.vue";
import type { ParallaxLayerProps } from "./types";

/** Drop readonly (Vue's `$props` is readonly) and map so an interface compares with a type literal. */
type Shape<T> = { -readonly [K in keyof T]: T[K] };
type Equal<A, B> =
  (<T>() => T extends Shape<A> ? 1 : 2) extends (<T>() => T extends Shape<B> ? 1 : 2) ? true : false;

type FromComponent = Omit<InstanceType<typeof ParallaxLayer>["$props"], keyof VNodeProps | keyof AllowedComponentProps>;

/** Assignable both ways, including which props are optional. A mismatch is a type error. */
export const parallaxLayerPropsMatch = true satisfies Equal<FromComponent, ParallaxLayerProps>;

const unit = fileURLToPath(new URL("..", import.meta.url));

test("inline props and ParallaxLayerProps are the same type", () => {
  const bin = join(unit, "node_modules", "vue-tsc", "bin", "vue-tsc.js");
  const r = spawnSync(process.execPath, [bin, "--noEmit", "--pretty", "false"], {
    cwd: unit,
    encoding: "utf8",
  });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
});
