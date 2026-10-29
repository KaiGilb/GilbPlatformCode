// The port is not set here: Vite's default applies, and the runner chooses the port (see README).
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist" },
  test: { environment: "jsdom", globals: false, setupFiles: ["./test/setup.ts"] },
});
