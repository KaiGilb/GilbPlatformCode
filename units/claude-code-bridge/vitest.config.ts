import { defineConfig } from "vitest/config";

const WINDOWS_RUNNER = process.platform === "win32";
// The default test timeout is a harness wait, not a Value. 5 s is vitest's own default and stays so off Windows. On GitHub's windows-latest runner a
// loaded run (the files run in parallel) makes ordinary tests take 6.5 to 8.6 s, never a hang: "QA scope abuse ... every malformed scope is a 400"
// took 6,529 ms (run 46040544141) and "computer mode: the project is the start folder ..." 8,571 ms (run 46039976800). 15 s is about twice the slowest
// measured; a real hang still fails. Tests that set their own timeout (vi.setConfig or a last argument) are not touched.
const TEST_TIMEOUT_MS = WINDOWS_RUNNER ? 15_000 : 5_000;

export default defineConfig({
  test: { environment: "node", globals: false, testTimeout: TEST_TIMEOUT_MS },
});
