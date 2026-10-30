// Port 5261 is this app's allocation in the dev-port map (Rule_Code_dev-ports, RuleDevportPinConfig).
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist" },
  server: { port: 5261, strictPort: true },
  preview: { port: 5261, strictPort: true },
  test: { environment: "jsdom", globals: false, setupFiles: ["./test/setup.ts"] },
});
