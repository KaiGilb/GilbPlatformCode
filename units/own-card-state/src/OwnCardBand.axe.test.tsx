// @vitest-environment jsdom
// Ported from the source's `OwnCardBand.axe.tester-s63.test.tsx` (5 cases): every case the band draws passes axe (colour contrast is
// switched off, as in the source: jsdom does not resolve the host's colours), the region and the link are named, and a control
// shows the axe run can fail.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { OwnCardBand, resetMyNetProfileUrl, setMyNetProfileUrl } from "./index";
import type { OwnCardState } from "./index";
import { PROFILE_URL } from "../test/support";

beforeEach(() => setMyNetProfileUrl(PROFILE_URL));
afterEach(() => {
  cleanup();
  resetMyNetProfileUrl();
});

async function violations(node: Element) {
  const r = await axe.run(node, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.length}`);
}
const states: [string, OwnCardState][] = [
  ["mynet", { pending: false, own: true, standing: { kind: "mynet", alsoCards: [] } }],
  ["mynet + a second card", { pending: false, own: true, standing: { kind: "mynet", alsoCards: ["https://k.example.test/vault/e/mnb-profile-x"] } }],
  ["other", { pending: false, own: true, standing: { kind: "other", mynetCardId: "vsc-1", mynetCardUri: "https://k.example.test/vault/e/vsc-1" } }],
  ["unknown", { pending: false, own: true, standing: { kind: "unknown" } }],
];
describe("OwnCardBand accessibility", () => {
  for (const [name, state] of states)
    it(`${name}: no axe violations; the region and the link are named`, async () => {
      const { container, getByRole } = render(<main><OwnCardBand state={state} onOpen={() => {}} /></main>);
      expect(await violations(container)).toEqual([]);
      expect(getByRole("region", { name: "Your own card" })).toBeTruthy();
      expect(getByRole("link", { name: "Edit in MyNet" }).getAttribute("rel")).toContain("noopener");
    });
  it("CONTROL: the axe run can fail (an unnamed button)", async () => {
    const { container } = render(<main><button type="button"></button></main>);
    expect(await violations(container)).not.toEqual([]);
  });
});
