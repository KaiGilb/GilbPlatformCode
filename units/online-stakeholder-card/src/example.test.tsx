// The README's wiring example (test/example.tsx): the same text as the README's code block, type-checked by `npm run typecheck` and rendered here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { resetTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { OnlineCard } from "../test/example";

afterEach(() => {
  cleanup();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetTermOrigin();
});

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

describe("the README example", () => {
  it("renders with every provider the README lists, and draws nothing until the holder's own vault is known", () => {
    const r = render(<OnlineCard principal="https://ben.platform.example.test/vault" />);
    expect(r.container.textContent).toBe("");
  });

  it("the README's first tsx block is test/example.tsx, with the unit imported by its package name", () => {
    const readme = readFileSync(here("../README.md"), "utf8");
    const block = /```tsx\n([\s\S]*?)```/.exec(readme)?.[1];
    expect(block, "the README has a tsx block").toBeTruthy();
    const example = readFileSync(here("../test/example.tsx"), "utf8").replace('from "../src"', 'from "@kaigilb/gilbplatformcode-online-stakeholder-card"');
    expect(block).toBe(example);
  });
});
