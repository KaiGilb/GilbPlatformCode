import { defineConfig } from "vitest/config";

export default defineConfig({
  // The units this one depends on ship TSX source. Compile it with the automatic JSX runtime, as a
  // host's Vite + @vitejs/plugin-react does; a file under node_modules does not read this tsconfig.
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", globals: false, setupFiles: ["./src/test-setup.ts"] },
});
