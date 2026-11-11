import type { CataloguePalette } from "./types";

// Composed for this package from Tailwind CSS v3 default colour values (MIT, (c) Tailwind Labs).
const SOURCE = "Tailwind CSS default palette (MIT)";
const p = (id: string, name: string, colors: string[]): CataloguePalette => ({ id: `pop-${id}`, name, source: SOURCE, licence: "MIT", colors });

export const popPalettes: CataloguePalette[] = [
  p("neon-citrus", "Neon Citrus", ["#d946ef", "#fbbf24", "#22d3ee", "#0f172a"]),
  p("electric-lime", "Electric Lime", ["#84cc16", "#0f172a", "#f8fafc", "#a3e635"]),
  p("hot-coral", "Hot Coral", ["#f43f5e", "#fb923c", "#fde047", "#1e293b"]),
  p("cyber-grape", "Cyber Grape", ["#7c3aed", "#e879f9", "#22d3ee", "#0f172a"]),
  p("sunset-strip", "Sunset Strip", ["#f97316", "#ec4899", "#8b5cf6", "#18181b"]),
  p("laser-mint", "Laser Mint", ["#10b981", "#22d3ee", "#facc15", "#0f172a"]),
  p("bubblegum-pop", "Bubblegum Pop", ["#f472b6", "#38bdf8", "#fde047", "#1e293b"]),
  p("volt-blue", "Volt Blue", ["#2563eb", "#facc15", "#f8fafc", "#0f172a"]),
  p("tangerine-dream", "Tangerine Dream", ["#f97316", "#14b8a6", "#fef3c7", "#171717"]),
  p("magenta-rush", "Magenta Rush", ["#c026d3", "#fbbf24", "#f8fafc", "#18181b"]),
  p("ocean-spark", "Ocean Spark", ["#0ea5e9", "#f43f5e", "#fcd34d", "#0f172a"]),
  p("acid-pink", "Acid Pink", ["#ec4899", "#bef264", "#0f172a"]),
  p("sherbet-riot", "Sherbet Riot", ["#fb7185", "#fb923c", "#a3e635", "#2dd4bf", "#1e293b"]),
  p("midnight-neon", "Midnight Neon", ["#6366f1", "#e879f9", "#22d3ee", "#0f172a"]),
  p("solar-flare", "Solar Flare", ["#ef4444", "#f59e0b", "#fde047", "#1c1917"]),
  p("jungle-pop", "Jungle Pop", ["#22c55e", "#f472b6", "#fbbf24", "#14532d"]),
  p("ultraviolet-pulse", "Ultraviolet Pulse", ["#9333ea", "#06b6d4", "#fcd34d", "#0f172a"]),
  p("papaya-punch", "Papaya Punch", ["#fb923c", "#e11d48", "#fef3c7", "#1c1917"]),
  p("arctic-flash", "Arctic Flash", ["#22d3ee", "#a78bfa", "#f8fafc", "#0f172a"]),
  p("lemon-fizz", "Lemon Fizz", ["#facc15", "#a855f7", "#f8fafc", "#18181b"]),
  p("flamingo-disco", "Flamingo Disco", ["#ec4899", "#4f46e5", "#fde047", "#0f172a"]),
  p("teal-tango", "Teal Tango", ["#14b8a6", "#f97316", "#f8fafc", "#1e293b"]),
  p("radical-red", "Radical Red", ["#dc2626", "#2563eb", "#fde047", "#0f172a"]),
  p("kiwi-berry", "Kiwi Berry", ["#4ade80", "#d946ef", "#f8fafc", "#0f172a"]),
];
