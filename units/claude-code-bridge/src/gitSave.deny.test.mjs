// @vitest-environment node
// Agent.Tester round 2, adopted into the unit: a folder-mode code turn's settings deny writes anywhere under .git, for both
// the sandbox (Bash) and the file tools (Edit/Write), for a repo that exists and one made during the turn.
import { describe, expect, it } from "vitest";
import { codeTurnSettings } from "../bridge/bridge.mjs";
const ROOT = "/home/u/Code";
const WANT = [`${ROOT}/.git`, `${ROOT}/.git/**`, `${ROOT}/**/.git`, `${ROOT}/**/.git/**`];
describe("folder-mode .git write deny", () => {
  for (const approval of ["session", "each-write"]) {
    it(`sandbox denyWrite and Edit deny cover .git (${approval})`, () => {
      const s = codeTurnSettings("/home/u", "darwin", [], approval, "", false, [ROOT]);
      for (const g of WANT) {
        expect(s.sandbox.filesystem.denyWrite).toContain(g);
        expect(s.permissions.deny).toContain(`Edit(/${g})`);
      }
    });
  }
  it("Windows files-only: the Edit deny covers .git", () => {
    const s = codeTurnSettings("C:/Users/u", "win32", [], "session", "", false, [ROOT]);
    for (const g of WANT) expect(s.permissions.deny).toContain(`Edit(/${g})`);
  });
});
