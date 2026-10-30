// Port 5267 is this app's allocation in the dev-port map (Rule_Code_dev-ports, RuleDevportPinConfig). The live sign-in check uses vite.live.config.ts instead.
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tailwind v4 as GilbApp runs it (GilbApp/vite.config.ts:66): the units draw with its utility classes. The sheet is styles/app.css.
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  // Units are installed as source. Vite pre-bundles them with its own esbuild options, whose JSX default is classic
  // (React.createElement); the units use the automatic runtime and import no React, so without this every unit component
  // throws "React is not defined" under `vite` (dev), while `vite build` and vitest pass.
  optimizeDeps: { esbuildOptions: { jsx: "automatic" } },
  build: { outDir: "dist" },
  server: { port: 5267, strictPort: true },
  preview: { port: 5267, strictPort: true },
  test: { environment: "jsdom", globals: false, setupFiles: ["./test/setup.ts"] },
});
