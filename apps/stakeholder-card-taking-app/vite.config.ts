// Port 5267 is this app's allocation in the dev-port map (Rule_Code_dev-ports, RuleDevportPinConfig). The live sign-in check uses vite.live.config.ts instead.
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist" },
  server: { port: 5267, strictPort: true },
  preview: { port: 5267, strictPort: true },
  test: { environment: "jsdom", globals: false, setupFiles: ["./test/setup.ts"] },
});
