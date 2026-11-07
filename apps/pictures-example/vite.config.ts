import { defineConfig } from "vitest/config";

// Port 5301 is dev:fake (no network at all). dev:live is 5251: the only other origin production admits for a local app.
export default defineConfig(({ mode }) => {
  const port = mode === "live" ? 5251 : 5301;
  return {
    esbuild: { jsx: "automatic" },
    optimizeDeps: { esbuildOptions: { jsx: "automatic" } },
    build: { outDir: "dist" },
    server: { port, strictPort: true, host: "localhost" },
    preview: { port, strictPort: true },
    test: { environment: "jsdom", globals: false, setupFiles: ["./test/setup.ts"] },
  };
});
