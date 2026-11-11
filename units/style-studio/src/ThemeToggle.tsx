import { useEffect, useState, type CSSProperties } from "react";
import { currentTheme, initTheme, toggleTheme, type Theme } from "@kaigilb/gilbplatformcode-style-runtime";

const sun = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const moon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  font: "inherit",
  color: "inherit",
  background: "transparent",
  border: "1px solid currentColor",
  borderRadius: "var(--r-md, 6px)",
  cursor: "pointer",
};

export interface ModeButtonProps {
  mode: Theme;
  onToggle: () => void;
  className?: string;
  style?: CSSProperties;
}

/** One button: shows the current mode (sun or moon plus Light/Dark) and flips it on click. A native button, so Enter and Space work. */
export function ModeButton({ mode, onToggle, className, style }: ModeButtonProps) {
  const dark = mode === "dark";
  return (
    <button type="button" className={className} style={{ ...BASE, ...style }} aria-pressed={dark} title={dark ? "Switch to light" : "Switch to dark"} onClick={onToggle}>
      {dark ? moon : sun}
      <span>{dark ? "Dark" : "Light"}</span>
    </button>
  );
}

export interface ThemeToggleProps {
  doc?: Document;
  storage?: Pick<Storage, "getItem" | "setItem">;
  className?: string;
  style?: CSSProperties;
}

/** Flips <html data-theme> between light and dark and remembers it (key "gilb-style:theme"). Applies the stored choice on mount. */
export function ThemeToggle({ doc, storage, className, style }: ThemeToggleProps) {
  const d = doc ?? document;
  const [mode, setMode] = useState<Theme>(() => currentTheme(d));
  useEffect(() => {
    setMode(initTheme(d, storage));
  }, [d, storage]);
  return <ModeButton mode={mode} className={className} style={style} onToggle={() => setMode(toggleTheme(d, storage))} />;
}
