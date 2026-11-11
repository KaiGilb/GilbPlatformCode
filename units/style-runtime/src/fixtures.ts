import type { StyleSheet } from "./schema";

export const validSheet = (): StyleSheet => ({
  version: 1,
  name: "Test sheet",
  mode: "system",
  palette: { accent: "#a85c3b", paper: "#f4f1ea", ink: "#2a2622", surface: "rgb(250, 248, 243)", lines: "oklch(30% 0.02 60)", ok: "hsl(150, 40%, 30%)", warn: "#9a6a1e", bad: "#a5432c", onAccent: "#fbfaf6" },
  dark: { accent: "#d68b5e", paper: "#151719", ink: "#e9e3da" },
  paletteSource: { kind: "catalogue", catalogue: "pop", combination: 3, readAt: "2026-11-11T10:00:00Z" },
  fonts: { sans: { family: "Inter", source: "bundled" }, serif: { family: "Source Serif 4", source: "system" }, baseSizePx: 16, scaleRatio: 1.25 },
  shape: { radius: 12, shadow: "soft", density: "comfortable" },
  button: "filled",
  window: "card",
  logo: { primary: "https://example.com/logo.png", favicon: "data:image/png;base64,iVBORw0KGgo=" },
});
