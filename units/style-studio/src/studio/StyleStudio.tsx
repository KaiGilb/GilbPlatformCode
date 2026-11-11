import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { validateStyleSheet, type StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import type { Harmony } from "@kaigilb/gilbplatformcode-style-runtime";
import "./studio.css";
import { loadFont } from "./fonts";
import { ModeButton } from "../ThemeToggle";
import { defaultSheet, type Mode } from "./model";
import { Preview } from "./Preview";
import type { SavedIds, StoreDeps } from "../save/styleStore";
import { ButtonsTab, FontsTab, LogoTab, PalettesTab, SaveTab, SeedTab, WebsiteTab, WindowsTab, type ExtractResult, type TabCtx } from "./tabs";

export interface StyleStudioProps {
  initial?: StyleSheet;
  /** Called only with a sheet that validateStyleSheet accepted. */
  onSave?: (sheet: StyleSheet) => void | Promise<void>;
  /** Supplied by the host (Batch 3). When absent the website tab shows "Not connected". */
  extractFromUrl?: (url: string) => Promise<ExtractResult>;
  /** Default true (Kai, 2026-11-11). Pass false to hide the Wada palettes. */
  includeWada?: boolean;
  appName?: string;
  /** When set, Save writes the style into the app's resource vault (see README) instead of calling onSave. */
  vault?: { vaultBase: string; vaultId: string; publicGrantee: string; auth: StoreDeps["auth"]; fetch?: typeof fetch; toFetchUrl?: (identityUrl: string) => string; toEntityUri?: (resourceUrl: string) => string };
  /** Ids from an earlier save, so Save updates the same records. */
  savedIds?: SavedIds;
  onSaved?: (ids: SavedIds) => void;
}

type Action = { type: "replace"; sheet: StyleSheet };
const reducer = (_s: StyleSheet, a: Action): StyleSheet => a.sheet;

const TABS = [
  { id: "palettes", label: "Palettes" },
  { id: "seed", label: "One colour" },
  { id: "website", label: "From website" },
  { id: "fonts", label: "Fonts" },
  { id: "buttons", label: "Buttons" },
  { id: "windows", label: "Windows" },
  { id: "logo", label: "Logo" },
  { id: "save", label: "Save & export" },
] as const;

function initialSheet(initial?: StyleSheet): { sheet: StyleSheet; errors: string[] } {
  if (!initial) return { sheet: defaultSheet(), errors: [] };
  const r = validateStyleSheet(initial);
  return r.ok ? { sheet: r.value, errors: [] } : { sheet: defaultSheet(), errors: ["The starting style was not accepted, so the default is shown:", ...r.errors] };
}

export function StyleStudio({ initial, onSave, extractFromUrl, includeWada = true, appName = "Your app", vault, savedIds, onSaved }: StyleStudioProps) {
  const uid = useId();
  const start = useRef(initialSheet(initial)).current;
  const [sheet, dispatch] = useReducer(reducer, start.sheet);
  const [rejected, setRejected] = useState<string[]>(start.errors);
  const [tab, setTab] = useState(0);
  const [peek, setPeek] = useState<StyleSheet | null>(null);
  const [harmony, setHarmony] = useState<Harmony>("analogous");
  const [previewMode, setPreviewMode] = useState<Mode>(start.sheet.mode === "dark" ? "dark" : "light");
  const [ids, setIds] = useState<SavedIds | undefined>(savedIds);
  const uploaded = useRef<Record<string, string>>({});
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Derived each render. Nothing reaches state without passing validateStyleSheet first (see apply).
  const validation = validateStyleSheet(sheet);
  const errors = [...rejected, ...(validation.ok ? [] : validation.errors)];

  // Bundled fonts are loaded lazily, only when a sheet uses them.
  const { sans, serif, mono } = sheet.fonts;
  useEffect(() => {
    void loadFont(sans);
    void loadFont(serif);
    void loadFont(mono);
  }, [sans, serif, mono]);

  const apply: TabCtx["apply"] = (next) => {
    const r = validateStyleSheet(next);
    if (!r.ok) {
      setRejected(r.errors);
      return false;
    }
    setRejected([]);
    dispatch({ type: "replace", sheet: r.value });
    return true;
  };

  const ctx: TabCtx = {
    sheet,
    apply,
    showErrors: setRejected,
    setPeek,
    harmony,
    setHarmony,
    previewMode,
    includeWada,
    extractFromUrl,
    onSave,
    vault,
    ids,
    setIds,
    uploaded,
    onSaved,
  };

  const goTab = (i: number) => {
    const n = (i + TABS.length) % TABS.length;
    setPeek(null);
    setTab(n);
    tabRefs.current[n]?.focus();
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") (e.preventDefault(), goTab(tab + 1));
    else if (e.key === "ArrowLeft") (e.preventDefault(), goTab(tab - 1));
    else if (e.key === "Home") (e.preventDefault(), goTab(0));
    else if (e.key === "End") (e.preventDefault(), goTab(TABS.length - 1));
  };

  const id = TABS[tab]!.id;
  return (
    <div className="gs-studio">
      <div className="gs-layout">
        <div className="gs-controls">
          <div className="gs-tablist" role="tablist" aria-label="Style Studio sections" onKeyDown={onTabKey}>
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[i] = el; }}
                id={`${uid}-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={tab === i}
                aria-controls={`${uid}-panel-${t.id}`}
                tabIndex={tab === i ? 0 : -1}
                onClick={() => { setPeek(null); setTab(i); }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${uid}-panel-${id}`} aria-labelledby={`${uid}-tab-${id}`}>
            {id === "palettes" ? <PalettesTab ctx={ctx} /> : null}
            {id === "seed" ? <SeedTab ctx={ctx} /> : null}
            {id === "website" ? <WebsiteTab ctx={ctx} /> : null}
            {id === "fonts" ? <FontsTab ctx={ctx} /> : null}
            {id === "buttons" ? <ButtonsTab ctx={ctx} /> : null}
            {id === "windows" ? <WindowsTab ctx={ctx} /> : null}
            {id === "logo" ? <LogoTab ctx={ctx} /> : null}
            {id === "save" ? <SaveTab ctx={ctx} /> : null}
          </div>
          <div className="gs-live" style={{ padding: "0 14px 12px" }} aria-live="polite" data-testid="gs-errors">
            {errors.length ? (
              <ul>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="gs-previewcol">
          <div className="gs-previewbar">
            <strong>Live preview</strong>
            <ModeButton mode={previewMode} onToggle={() => setPreviewMode((m) => (m === "dark" ? "light" : "dark"))} />
          </div>
          <Preview sheet={peek ?? sheet} mode={previewMode} harmony={harmony} appName={appName} />
        </div>
      </div>
    </div>
  );
}
