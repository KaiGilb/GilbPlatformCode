import { defineConfig } from "vitest/config";

// Page-side code runs in jsdom; the end-to-end and commands tests opt into node with `// @vitest-environment node`.
export default defineConfig({
  test: { environment: "jsdom", globals: false, setupFiles: ["./test-setup.ts"] },
});
