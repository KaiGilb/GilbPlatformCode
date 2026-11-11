import type { CataloguePalette } from "./types";

// Composed from Open Color values (MIT, (c) heeyeun).
const SOURCE = "Open Color (MIT)";
const p = (id: string, name: string, colors: string[]): CataloguePalette => ({ id: `classic-${id}`, name, source: SOURCE, licence: "MIT", colors });

export const classicPalettes: CataloguePalette[] = [
  p("harbour-blue", "Harbour Blue", ["#1c7ed6", "#e7f5ff", "#212529", "#868e96"]),
  p("quiet-teal", "Quiet Teal", ["#0c8599", "#e3fafc", "#212529", "#adb5bd"]),
  p("pine-and-paper", "Pine and Paper", ["#2f9e44", "#ebfbee", "#212529"]),
  p("slate-office", "Slate Office", ["#495057", "#f1f3f5", "#228be6", "#212529"]),
  p("indigo-ledger", "Indigo Ledger", ["#3b5bdb", "#f8f9fa", "#343a40"]),
  p("warm-sand", "Warm Sand", ["#fd7e14", "#fff4e6", "#343a40", "#868e96"]),
  p("grape-study", "Grape Study", ["#9c36b5", "#f8f9fa", "#212529", "#ced4da"]),
  p("seafoam-clinic", "Seafoam Clinic", ["#099268", "#e6fcf5", "#212529", "#868e96"]),
  p("deep-navy", "Deep Navy", ["#1864ab", "#a5d8ff", "#f8f9fa", "#212529"]),
  p("brick-and-bone", "Brick and Bone", ["#c92a2a", "#f1f3f5", "#212529"]),
  p("butter-linen", "Butter Linen", ["#fab005", "#fff9db", "#343a40", "#495057"]),
  p("violet-hush", "Violet Hush", ["#6741d9", "#f1f3f5", "#212529", "#adb5bd", "#e9ecef"]),
];
