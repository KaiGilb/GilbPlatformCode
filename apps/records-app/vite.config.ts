import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Production CORS admits http://localhost:5251 (RuleRigdevProdFirstPartyOrigin); strictPort so a busy port fails loudly.
  server: { port: 5251, strictPort: true },
  test: { environment: "jsdom", globals: false, include: ["src/**/*.test.{ts,tsx}"] },
});
