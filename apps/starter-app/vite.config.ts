// Port 5262 is this app's allocation in the dev-port map (Rule_Code_dev-ports, RuleDevportPinConfig). A new app draws its own.
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tailwind v4: the frame (app-shell, panes, drawer) draws with its utility classes. The sheet is styles/app.css.
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  // The units are installed as source. Vite pre-bundles them with esbuild's own options, whose JSX default is classic;
  // without this every unit component throws "React is not defined" under `vite` (dev).
  optimizeDeps: { esbuildOptions: { jsx: "automatic" } },
  build: { outDir: "dist" },
  server: { port: 5262, strictPort: true, host: "localhost" },
  preview: { port: 5262, strictPort: true, host: "localhost" },
  test: { environment: "jsdom", globals: false, setupFiles: ["./test/setup.ts"] },
});
