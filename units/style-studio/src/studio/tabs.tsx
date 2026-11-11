import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { listCatalogues, loadWadaCatalogue, type Catalogue, type CataloguePalette } from "../catalogue/index";
import { isSafeColor, validateStyleSheet, type StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { parseColor, toHex } from "@kaigilb/gilbplatformcode-style-runtime";
import type { Harmony } from "@kaigilb/gilbplatformcode-style-runtime";
import { usePreviewVars } from "./Preview";
import { FONT_CATALOGUE, FONT_CATEGORIES, FONT_PAIRINGS, GENERIC_FOR, SYSTEM_FONT, closestBundled, loadFontFamily, matchBundled, type FontCategory, type FontPairing, type FontRole } from "./fonts";
import { ExtractError } from "./extractClient";
import { dataUrlToBlob, processLogoFile, readFileText } from "./logo";
import { saveStyle, type SavedIds, type StoreDeps } from "../save/styleStore";
import { clampRadius, contrastReport, paletteFromBrand, sheetFromCatalogue, sheetFromSeed, type Mode } from "./model";

export interface ExtractResult {
  colors: string[];
  fonts: string[];
  radiusPx?: number;
  logoUrl?: string;
}

export interface TabCtx {
  sheet: StyleSheet;
  /** Validates, then commits. Returns true when the sheet was accepted. */
  apply: (next: StyleSheet, opts?: { quiet?: boolean }) => boolean;
  showErrors: (errors: string[]) => void;
  setPeek: (s: StyleSheet | null) => void;
  harmony: Harmony;
  setHarmony: (h: Harmony) => void;
  previewMode: Mode;
  includeWada: boolean;
  extractFromUrl?: (url: string) => Promise<ExtractResult>;
  onSave?: (sheet: StyleSheet) => void | Promise<void>;
  vault?: { vaultBase: string; vaultId: string; publicGrantee: string; auth: StoreDeps["auth"]; fetch?: typeof fetch; toFetchUrl?: (identityUrl: string) => string; toEntityUri?: (resourceUrl: string) => string };
  ids?: SavedIds;
  setIds: (ids: SavedIds) => void;
  /** Data URL last uploaded per logo role, so an unchanged logo is not uploaded again. */
  uploaded: { current: Record<string, string> };
  onSaved?: (ids: SavedIds) => void;
}

const BTN = "gs-btn-ui";

// ---------------------------------------------------------------- Palettes
export function PalettesTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply, setPeek, includeWada } = ctx;
  const uid = useId();
  const [wada, setWada] = useState<Catalogue | null>(null);
  const [wadaFailed, setWadaFailed] = useState(false);
  // The Wada set is a separate chunk: fetched only when includeWada is on.
  useEffect(() => {
    if (!includeWada) return;
    let alive = true;
    loadWadaCatalogue().then(
      (c) => alive && setWada(c),
      () => alive && setWadaFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [includeWada]);
  const [filter, setFilter] = useState("");
  const allCats = useMemo(() => [...listCatalogues(), ...(includeWada && wada ? [wada] : [])], [includeWada, wada]);
  const cats = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allCats;
    return allCats
      .map((c) => ({ ...c, palettes: c.palettes.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) }))
      .filter((c) => c.palettes.length > 0);
  }, [allCats, filter]);
  const flat = useMemo(() => cats.flatMap((c) => c.palettes.map((p) => ({ cat: c.id, pal: p }))), [cats]);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optId = (i: number) => `${uid}-o${i}`;

  const peekAt = (i: number) => {
    const it = flat[i];
    if (!it) return;
    setActive(i);
    setPeek(sheetFromCatalogue(sheet, it.cat, it.pal));
    (document.getElementById(optId(i)) as HTMLElement | null)?.scrollIntoView?.({ block: "nearest" });
  };
  const commit = (i: number) => {
    const it = flat[i];
    if (!it) return;
    const next = sheetFromCatalogue(sheet, it.cat, it.pal);
    setPeek(null);
    setActive(i);
    if (next && apply(next)) setChosen(it.pal.id);
  };
  const shuffle = () => {
    if (flat.length === 0) return;
    const i = Math.floor(Math.random() * flat.length);
    listRef.current?.focus();
    peekAt(i);
  };
  const onKey = (e: KeyboardEvent) => {
    const last = flat.length - 1;
    if (e.key === "ArrowDown") (e.preventDefault(), peekAt(Math.min(last, active + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), peekAt(Math.max(0, active - 1)));
    else if (e.key === "Home") (e.preventDefault(), peekAt(0));
    else if (e.key === "End") (e.preventDefault(), peekAt(last));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), commit(active));
    else if (e.key === "Escape") setPeek(null);
  };

  let index = -1;
  return (
    <>
      <p className="gs-note">Arrow keys preview a palette. Enter or a click applies it.</p>
      <div className="gs-filterrow">
        <div className="gs-field">
          <label htmlFor={`${uid}-f`}>Filter palettes</label>
          <input
            id={`${uid}-f`}
            type="text"
            value={filter}
            placeholder="Name or number"
            onChange={(e) => {
              setFilter(e.target.value);
              setActive(0);
              setPeek(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), listRef.current?.focus(), peekAt(0));
            }}
          />
        </div>
        <button type="button" className={BTN} onClick={shuffle}>Shuffle</button>
      </div>
      {includeWada && !wada && !wadaFailed ? <p className="gs-note" role="status">Loading Wada palettes…</p> : null}
      {wadaFailed ? <p className="gs-error" role="alert">The Wada palettes could not be loaded.</p> : null}
      {filter && flat.length === 0 ? <p className="gs-note" role="status">No palettes match.</p> : null}
      <div
        ref={listRef}
        className="gs-listbox"
        role="listbox"
        tabIndex={0}
        aria-label="Palettes"
        aria-activedescendant={flat.length ? optId(Math.min(active, flat.length - 1)) : undefined}
        onKeyDown={onKey}
        onBlur={() => setPeek(null)}
      >
        {cats.map((c) => {
          const credit = c.id === "wada" ? c.palettes[0]?.source : undefined;
          return (
            <div key={c.id} role="group" aria-labelledby={`${uid}-g-${c.id}`}>
              <div className="gs-group-label" id={`${uid}-g-${c.id}`}>
                {c.name}
                {credit ? <small>{credit}</small> : null}
              </div>
              {c.palettes.map((p: CataloguePalette) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={p.id}
                    id={optId(i)}
                    role="option"
                    aria-selected={chosen === p.id}
                    className={i === active ? "gs-active" : undefined}
                    onClick={() => commit(i)}
                  >
                    <span>{p.name}</span>
                    <span className="gs-strip" aria-hidden="true">
                      {p.colors.map((col, k) => (
                        <span key={k} style={{ background: col }} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- One colour
const HARMONIES: Harmony[] = ["complementary", "analogous", "triadic", "split", "mono"];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function SeedTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply, harmony, setHarmony } = ctx;
  const uid = useId();
  const initial = sheet.paletteSource?.kind === "seed" && sheet.paletteSource.seed && HEX_RE.test(sheet.paletteSource.seed) ? sheet.paletteSource.seed : toHex(parseColor(sheet.palette.accent) ?? { l: 0.5, c: 0.1, h: 250 });
  const [seed, setSeed] = useState(initial);
  const [text, setText] = useState(initial);
  const [bad, setBad] = useState(false);

  const run = (s: string, h: Harmony) => {
    try {
      apply(sheetFromSeed(sheet, s, h));
    } catch {
      setBad(true);
    }
  };
  const setHex = (v: string) => {
    setText(v);
    if (HEX_RE.test(v) && isSafeColor(v) && parseColor(v)) {
      setBad(false);
      setSeed(v.toLowerCase());
      run(v.toLowerCase(), harmony);
    } else setBad(true);
  };
  return (
    <>
      <div className="gs-inline">
        <label htmlFor={`${uid}-c`}>Pick a colour</label>
        <input id={`${uid}-c`} type="color" value={seed} onChange={(e) => setHex(e.target.value)} />
        <label htmlFor={`${uid}-h`}>Hex colour</label>
        <input id={`${uid}-h`} type="text" value={text} maxLength={7} size={9} onChange={(e) => setHex(e.target.value)} aria-invalid={bad} />
      </div>
      {bad ? <p className="gs-error">Enter a colour like #e11d48.</p> : null}
      <fieldset className="gs-inline" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Harmony</legend>
        {HARMONIES.map((h) => (
          <label key={h}>
            <input
              type="radio"
              name={`${uid}-harmony`}
              value={h}
              checked={harmony === h}
              onChange={() => {
                setHarmony(h);
                if (!bad) run(seed, h);
              }}
            />{" "}
            {h}
          </label>
        ))}
      </fieldset>
      <p className="gs-note">Paper, ink, status colours and the on-accent colour are made to pass contrast automatically.</p>
    </>
  );
}

// ---------------------------------------------------------------- From website
interface Found {
  value: string;
  ok: boolean;
}
type Role = "accent" | "paper" | "ink";

function probe(sheet: StyleSheet, patch: (s: StyleSheet, v: string) => StyleSheet, v: unknown): Found {
  if (typeof v !== "string") return { value: String(v).slice(0, 80), ok: false };
  const shown = v.slice(0, 80);
  try {
    return { value: shown, ok: validateStyleSheet(patch(sheet, v)).ok && v.length <= 80 };
  } catch {
    return { value: shown, ok: false };
  }
}

/** "example.com" gets https:// in front; a doubled "https://https://" is collapsed. */
export function normaliseWebAddress(raw: string): string {
  let v = raw.trim();
  if (!v) return v;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;
  return v.replace(/^(https?:\/\/)(?:https?:\/\/)+/i, "$1");
}

export function WebsiteTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply, harmony, extractFromUrl } = ctx;
  const uid = useId();
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [colors, setColors] = useState<Found[]>([]);
  const [fonts, setFonts] = useState<Found[]>([]);
  const [radius, setRadius] = useState<number | undefined>();
  const [role, setRole] = useState<Role>("accent");
  const [assign, setAssign] = useState<Partial<Record<Role, string>>>({});
  const [readAt, setReadAt] = useState("");
  const [readUrl, setReadUrl] = useState("");

  if (!extractFromUrl) return <p>Not connected</p>;

  const read = async () => {
    setErr("");
    const address = normaliseWebAddress(url);
    if (!/^https:\/\//i.test(address)) return setErr("The address must start with https://");
    try {
      new URL(address);
    } catch {
      return setErr("That is not a valid web address.");
    }
    setBusy(true);
    try {
      const r = await extractFromUrl(address);
      const cs = (Array.isArray(r?.colors) ? r.colors : []).slice(0, 24);
      const fs = (Array.isArray(r?.fonts) ? r.fonts : []).slice(0, 12);
      // Every returned value is validated through validateStyleSheet before it can reach state.
      setColors(cs.map((c) => probe(sheet, (s, v) => ({ ...s, palette: { ...s.palette, accent: v } }), c)));
      setFonts(fs.map((f) => probe(sheet, (s, v) => ({ ...s, fonts: { ...s.fonts, sans: { family: v, source: "system" } } }), f)));
      setRadius(typeof r?.radiusPx === "number" && Number.isFinite(r.radiusPx) ? clampRadius(r.radiusPx) : undefined);
      setAssign({});
      setReadUrl(address);
      setReadAt(new Date().toISOString());
    } catch (e) {
      setErr(e instanceof ExtractError ? e.message : "The styles could not be read from that address.");
    } finally {
      setBusy(false);
    }
  };

  const good = colors.filter((c) => c.ok);
  const rejected = [...colors, ...fonts].filter((c) => !c.ok);
  const use = () => {
    const accent = assign.accent ?? good[0]?.value;
    if (!accent) return setErr("There is no usable colour to build from.");
    try {
      const light = paletteFromBrand(accent, assign.paper, assign.ink, "light", harmony);
      const dark = paletteFromBrand(accent, undefined, undefined, "dark", harmony);
      let next: StyleSheet = {
        ...sheet,
        palette: { accent: light.accent, paper: light.paper, ink: light.ink, surface: light.surface, lines: light.lines, ok: light.ok, warn: light.warn, bad: light.bad, onAccent: light.onAccent },
        dark: { accent: dark.accent, paper: dark.paper, ink: dark.ink, surface: dark.surface, lines: dark.lines, ok: dark.ok, warn: dark.warn, bad: dark.bad, onAccent: dark.onAccent },
        paletteSource: { kind: "url", url: readUrl, readAt },
      };
      // The site's own colours, in the order found, feed the preview's chart row.
      if (good.length) next = { ...next, palette: { ...next.palette, extra: good.slice(0, 6).map((c) => c.value) } };
      if (radius !== undefined) next = { ...next, shape: { ...next.shape, radius } };
      if (apply(next)) setErr("");
    } catch {
      setErr("Those colours could not be turned into a palette.");
    }
  };

  return (
    <>
      <div className="gs-field">
        <label htmlFor={`${uid}-u`}>Website address</label>
        <input id={`${uid}-u`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
      </div>
      <div className="gs-inline">
        <button type="button" className={BTN} onClick={read} disabled={busy}>
          {busy ? "Reading..." : "Read styles"}
        </button>
      </div>
      {err ? <p className="gs-error" role="alert">{err}</p> : null}
      {rejected.length ? (
        <div>
          <p className="gs-error">Rejected values (not used):</p>
          <ul>
            {rejected.map((r, i) => (
              <li key={i} className="gs-error">
                Rejected: <code>{r.value}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {good.length ? (
        <>
          <fieldset className="gs-inline" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Next swatch you click becomes</legend>
            {(["accent", "paper", "ink"] as const).map((r) => (
              <label key={r}>
                <input type="radio" name={`${uid}-role`} checked={role === r} onChange={() => setRole(r)} /> {r}
              </label>
            ))}
          </fieldset>
          <div className="gs-inline">
            {good.map((c, i) => (
              <button
                key={`${c.value}-${i}`}
                type="button"
                className="gs-swatchbtn"
                style={{ background: c.value }}
                aria-label={`Use ${c.value} as ${role}`}
                aria-pressed={assign[role] === c.value}
                onClick={() => setAssign({ ...assign, [role]: c.value })}
              />
            ))}
          </div>
          <p className="gs-note">
            Accent: {assign.accent ?? `${good[0]?.value} (first)`} · Paper: {assign.paper ?? "auto"} · Ink: {assign.ink ?? "auto"}
          </p>
        </>
      ) : null}
      {fonts.some((f) => f.ok) ? (
        <ul className="gs-chiprow" aria-label="Fonts found">
          {fonts.filter((f) => f.ok).map((f, i) => {
            const m = matchBundled(f.value);
            return m ? (
              <li key={i}>
                <button
                  type="button"
                  className="gs-chipui"
                  onClick={() => apply({ ...sheet, fonts: { ...sheet.fonts, [m.role]: { family: m.family, source: "bundled" } } })}
                >
                  Use {m.family}
                </button>
              </li>
            ) : (
              <li key={i} className="gs-chipui">
                {f.value} (not bundled — closest: {closestBundled(f.value)})
              </li>
            );
          })}
        </ul>
      ) : null}
      <label>
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> I have the right to use this brand
      </label>
      <div>
        <button type="button" className={`${BTN} gs-primary`} disabled={!rights || good.length === 0} onClick={use}>
          Use these
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Fonts
const RATIOS = [1.125, 1.2, 1.25, 1.333, 1.5];

type Slot = "body" | "heading" | "code";
const SLOTS: { id: Slot; role: FontRole; label: string }[] = [
  { id: "body", role: "sans", label: "Body" },
  { id: "heading", role: "serif", label: "Headings" },
  { id: "code", role: "mono", label: "Code" },
];

function FontRow({ font, system, selected, onPick }: { font: { family: string; category: FontCategory; license?: string }; system?: boolean; selected: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const bundled = !system;
  const load = () => {
    if (bundled) void loadFontFamily(font.family);
  };
  // Load the file only when the row scrolls into view; without IntersectionObserver, hover or focus still loads it.
  useEffect(() => {
    const el = ref.current;
    if (!bundled || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        void loadFontFamily(font.family);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [bundled, font.family]);
  const family = system ? (font.category === "mono" ? "ui-monospace, Menlo, monospace" : font.category === "serif" ? "Georgia, serif" : "system-ui, sans-serif") : `"${font.family}", ${GENERIC_FOR[font.category]}`;
  return (
    <button
      ref={ref}
      type="button"
      className="gs-fontrow"
      style={{ fontFamily: family }}
      aria-pressed={selected}
      data-font={font.family}
      onMouseEnter={load}
      onFocus={load}
      onClick={onPick}
    >
      <span>The quick brown fox <small>{font.family}</small></span>
      <small>{system ? "system" : font.category}</small>
    </button>
  );
}

export function FontsTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply } = ctx;
  const uid = useId();
  const [slot, setSlot] = useState<Slot>("body");
  const [cat, setCat] = useState<FontCategory | "all">("all");
  const [q, setQ] = useState("");
  const active = SLOTS.find((x) => x.id === slot)!;
  const current = (r: FontRole) => sheet.fonts[r]?.family ?? SYSTEM_FONT[r];
  const setFont = (role: FontRole, family: string) => {
    const system = family === SYSTEM_FONT[role];
    apply({ ...sheet, fonts: { ...sheet.fonts, [role]: { family, source: system ? "system" : "bundled" } } });
  };
  const effectiveCat: FontCategory | "all" = slot === "code" ? "mono" : cat;
  const needle = q.trim().toLowerCase();
  const list = FONT_CATALOGUE.filter((f) => (effectiveCat === "all" || f.category === effectiveCat) && (!needle || f.family.toLowerCase().includes(needle)));
  const sysName = SYSTEM_FONT[active.role];
  const showSystem = (effectiveCat === "all" || effectiveCat === active.role) && (!needle || sysName.toLowerCase().includes(needle));
  const pairing = (p: FontPairing) => apply({ ...sheet, fonts: { ...sheet.fonts, serif: { family: p.heading, source: "bundled" }, sans: { family: p.body, source: "bundled" }, mono: { family: p.code, source: "bundled" } } });
  return (
    <>
      <div className="gs-field">
        <span id={`${uid}-pairs`}>Font pairings</span>
        <ul className="gs-chiprow" aria-labelledby={`${uid}-pairs`}>
          {FONT_PAIRINGS.map((p) => (
            <li key={p.name}>
              <button type="button" className="gs-chipui" title={`${p.heading} + ${p.body} + ${p.code}`} aria-label={`Apply pairing ${p.name}`} onClick={() => pairing(p)}>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="gs-slots" role="group" aria-label="Choose a font for">
        {SLOTS.map((x) => (
          <button key={x.id} type="button" aria-pressed={slot === x.id} onClick={() => setSlot(x.id)}>
            {x.label}
            <small>{current(x.role)}</small>
          </button>
        ))}
      </div>
      <div className="gs-field">
        <label htmlFor={`${uid}-q`}>Search fonts</label>
        <input id={`${uid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="gs-chiprow" role="group" aria-label="Font category">
        {slot === "code" ? (
          <button type="button" className="gs-chipui" aria-pressed={true} disabled>Mono</button>
        ) : (
          [{ id: "all" as const, label: "All" }, ...FONT_CATEGORIES].map((c) => (
            <button key={c.id} type="button" className="gs-chipui" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>
          ))
        )}
      </div>
      <div className="gs-fontlist" role="group" aria-label={`${active.label} font`}>
        {showSystem ? <FontRow system font={{ family: sysName, category: active.role }} selected={current(active.role) === sysName} onPick={() => setFont(active.role, sysName)} /> : null}
        {list.map((f) => (
          <FontRow key={f.family} font={f} selected={current(active.role) === f.family} onPick={() => setFont(active.role, f.family)} />
        ))}
        {!showSystem && list.length === 0 ? <p className="gs-note" role="status" style={{ padding: 8 }}>No fonts match.</p> : null}
      </div>
      <div className="gs-field">
        <label htmlFor={`${uid}-size`}>Base size: {sheet.fonts.baseSizePx}px</label>
        <input id={`${uid}-size`} type="range" min={12} max={22} step={1} value={sheet.fonts.baseSizePx} onChange={(e) => apply({ ...sheet, fonts: { ...sheet.fonts, baseSizePx: Number(e.target.value) } })} />
      </div>
      <div className="gs-field">
        <label htmlFor={`${uid}-ratio`}>Scale ratio</label>
        <select id={`${uid}-ratio`} value={String(sheet.fonts.scaleRatio)} onChange={(e) => apply({ ...sheet, fonts: { ...sheet.fonts, scaleRatio: Number(e.target.value) } })}>
          {RATIOS.map((r) => <option key={r} value={String(r)}>{r}</option>)}
        </select>
      </div>
      <p className="gs-note">Font files are fetched only for fonts you pick or scroll past. The preview uses your body, headings and code fonts.</p>
    </>
  );
}

// ---------------------------------------------------------------- Buttons / Windows (live samples)
function Sample({ sheet, mode, harmony, clear, children }: { sheet: StyleSheet; mode: Mode; harmony: Harmony; clear?: boolean; children: ReactNode }) {
  const vars: CSSProperties = usePreviewVars(sheet, mode, harmony);
  // span, not div: samples sit inside <button>. "clear" lets a glass window show the colourful stage behind it.
  const style: CSSProperties = { ...vars, display: "block", ...(clear ? { background: "transparent", border: 0 } : {}) };
  return (
    <span className="gs-preview" data-theme={mode} style={style}>
      {children}
    </span>
  );
}

const BUTTONS: StyleSheet["button"][] = ["filled", "outline", "soft", "text", "pill"];
const DENSITIES: StyleSheet["shape"]["density"][] = ["compact", "comfortable", "spacious"];

export function ButtonsTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply, previewMode, harmony } = ctx;
  const uid = useId();
  return (
    <>
      <div className="gs-samples">
        {BUTTONS.map((b) => (
          <button key={b} type="button" className="gs-sample" aria-pressed={sheet.button === b} aria-label={`Button style ${b}`} onClick={() => apply({ ...sheet, button: b })}>
            <Sample sheet={{ ...sheet, button: b }} mode={previewMode} harmony={harmony}>
              <span className="gs-sample-body">
                <span className="gs-btn" aria-hidden="true">Button</span>
              </span>
            </Sample>
            <span className="gs-sample-caption">{b}</span>
          </button>
        ))}
      </div>
      <div className="gs-field">
        <label htmlFor={`${uid}-r`}>Corner radius: {sheet.shape.radius}px</label>
        <input id={`${uid}-r`} type="range" min={0} max={32} step={1} value={sheet.shape.radius} onChange={(e) => apply({ ...sheet, shape: { ...sheet.shape, radius: Number(e.target.value) } })} />
      </div>
      <fieldset className="gs-inline" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Density</legend>
        {DENSITIES.map((d) => (
          <label key={d}>
            <input type="radio" name={`${uid}-d`} checked={sheet.shape.density === d} onChange={() => apply({ ...sheet, shape: { ...sheet.shape, density: d } })} /> {d}
          </label>
        ))}
      </fieldset>
    </>
  );
}

const WINDOWS: StyleSheet["window"][] = ["flat", "bordered", "card", "glass"];
const SHADOWS: StyleSheet["shape"]["shadow"][] = ["none", "soft", "medium", "strong"];

export function WindowsTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply, previewMode, harmony } = ctx;
  const uid = useId();
  return (
    <>
      <div className="gs-samples">
        {WINDOWS.map((w) => (
          <button key={w} type="button" className="gs-sample" aria-pressed={sheet.window === w} aria-label={`Window style ${w}`} onClick={() => apply({ ...sheet, window: w })}>
            <span className="gs-winstage" style={{ display: "block" }}>
              <Sample sheet={{ ...sheet, window: w }} mode={previewMode} harmony={harmony} clear>
                <span className="gp-window" style={{ background: "var(--gs-window-bg)" }}>
                  <span className="gp-h2">Window</span>
                  <span className="gp-p">Some content</span>
                </span>
              </Sample>
            </span>
            <span className="gs-sample-caption">{w}</span>
          </button>
        ))}
      </div>
      <fieldset className="gs-inline" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Shadow</legend>
        {SHADOWS.map((s) => (
          <label key={s}>
            <input type="radio" name={`${uid}-s`} checked={sheet.shape.shadow === s} onChange={() => apply({ ...sheet, shape: { ...sheet.shape, shadow: s } })} /> {s}
          </label>
        ))}
      </fieldset>
    </>
  );
}

// ---------------------------------------------------------------- Logo
type LogoRole = "primary" | "mark" | "favicon";

export function LogoTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply } = ctx;
  const uid = useId();
  const [role, setRole] = useState<LogoRole>("primary");
  const [msg, setMsg] = useState("");
  const [isErr, setIsErr] = useState(false);
  const current = sheet.logo?.[role];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await processLogoFile(file);
    if (!r.ok) {
      setIsErr(true);
      return setMsg(r.error);
    }
    if (apply({ ...sheet, logo: { ...sheet.logo, [role]: r.dataUrl } })) {
      setIsErr(false);
      setMsg("Logo added.");
    } else {
      setIsErr(true);
      setMsg("That logo was rejected by the style checks.");
    }
  };
  return (
    <>
      <div className="gs-field">
        <label htmlFor={`${uid}-role`}>This logo is the</label>
        <select id={`${uid}-role`} value={role} onChange={(e) => setRole(e.target.value as LogoRole)}>
          <option value="primary">primary logo</option>
          <option value="mark">mark</option>
          <option value="favicon">favicon</option>
        </select>
      </div>
      <div className="gs-field">
        <label htmlFor={`${uid}-file`}>Logo file (PNG, JPEG, WebP or SVG, up to 2 MB)</label>
        <input id={`${uid}-file`} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {msg ? <p className={isErr ? "gs-error" : "gs-note"} role={isErr ? "alert" : "status"}>{msg}</p> : null}
      {current ? (
        <>
          <img className="gs-logo-thumb" src={current} alt={`Current ${role} logo`} />
          <div>
            <button type="button" className={BTN} onClick={() => { const { [role]: _drop, ...rest } = sheet.logo ?? {}; apply({ ...sheet, logo: Object.keys(rest).length ? rest : undefined }); setMsg(""); }}>
              Remove this logo
            </button>
          </div>
        </>
      ) : null}
      <p className="gs-note">SVG files are cleaned and turned into a PNG. Only the PNG is kept.</p>
    </>
  );
}

// ---------------------------------------------------------------- Save & export
export function SaveTab({ ctx }: { ctx: TabCtx }) {
  const { sheet, apply, showErrors, onSave, vault, ids, setIds, uploaded, onSaved } = ctx;
  const uid = useId();
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importOk, setImportOk] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const validation = validateStyleSheet(sheet);
  const rows = contrastReport(sheet);
  const allPass = rows.every((r) => r.pass);
  const canSave = validation.ok && allPass && status !== "saving";

  const download = () => {
    const blob = new Blob([JSON.stringify(sheet, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "style.tokens.json";
    a.click();
    URL.revokeObjectURL(href);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setImportOk(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFileText(file));
    } catch {
      return setImportErrors(["That file is not valid JSON."]);
    }
    const r = validateStyleSheet(parsed);
    if (!r.ok) {
      setImportErrors(r.errors);
      return showErrors(r.errors);
    }
    setImportErrors([]);
    if (apply(r.value)) setImportOk(true);
  };

  const [saveMsg, setSaveMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const save = async () => {
    const r = validateStyleSheet(sheet);
    if (!r.ok || !allPass) return;
    setStatus("saving");
    setSaveMsg("");
    try {
      if (vault) {
        const roles = [["primary", "logo", "logoPng"], ["mark", "logoMark", "logoMarkPng"], ["favicon", "favicon", "faviconPng"]] as const;
        const blobs: Partial<Record<"logoPng" | "logoMarkPng" | "faviconPng", Blob>> = {};
        let existing = ids ? { ...ids } : undefined;
        const nextUploaded: Record<string, string> = {};
        for (const [role, idKey, blobKey] of roles) {
          const url = r.value.logo?.[role];
          if (!url) {
            if (existing) delete existing[idKey];
          } else if (url.startsWith("data:") && uploaded.current[role] !== url) {
            const b = dataUrlToBlob(url);
            if (b) blobs[blobKey] = b;
            nextUploaded[role] = url;
          } else if (uploaded.current[role]) nextUploaded[role] = uploaded.current[role]!;
        }
        const saved = await saveStyle({ fetch: vault.fetch, auth: vault.auth, toFetchUrl: vault.toFetchUrl, toEntityUri: vault.toEntityUri }, { vaultBase: vault.vaultBase, vaultId: vault.vaultId, publicGrantee: vault.publicGrantee, sheet: r.value, existing, ...blobs });
        uploaded.current = nextUploaded;
        setIds(saved);
        onSaved?.(saved);
      } else await onSave?.(r.value);
      setStatus("saved");
    } catch (e) {
      setStatus("failed");
      if (vault && e instanceof Error) {
        setSaveMsg(e.message);
        const partial = (e as { ids?: Partial<SavedIds> }).ids;
        if (partial?.sheet && partial.palette && partial.brandKit) setIds(partial as SavedIds);
      }
    }
  };
  const sheetUrl = ids?.sheet.id;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sheetUrl ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="gs-field">
        <span id={`${uid}-mode`}>Colour mode</span>
        <div className="gs-seg" role="group" aria-labelledby={`${uid}-mode`}>
          {([["light", "Light"], ["dark", "Dark"], ["system", "Follow the system"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={sheet.mode === v} onClick={() => apply({ ...sheet, mode: v })}>{label}</button>
          ))}
        </div>
      </div>
      <table className="gs-report">
        <caption style={{ textAlign: "left", fontWeight: 600 }}>Contrast report</caption>
        <thead>
          <tr><th>Mode</th><th>Pair</th><th>Ratio</th><th>Result</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.mode}</td>
              <td>{r.pair}</td>
              <td>{r.ratio.toFixed(2)}</td>
              <td>{r.pass ? "✓ PASS" : "✕ FAIL"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="gs-inline">
        <button type="button" className={BTN} onClick={download}>Download style.tokens.json</button>
        <label className={BTN} style={{ display: "inline-block" }}>
          Import style.tokens.json
          <input type="file" accept="application/json,.json" style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      {importErrors.length ? (
        <div role="alert">
          <p className="gs-error">The file was not applied:</p>
          <ul>{importErrors.map((e, i) => <li key={i} className="gs-error">{e}</li>)}</ul>
        </div>
      ) : null}
      {importOk ? <p className="gs-note" role="status">Imported.</p> : null}
      <div className="gs-inline">
        <button type="button" className={`${BTN} gs-primary`} data-testid="gs-save" disabled={!canSave} onClick={save}>Save</button>
        {status === "saved" ? <span role="status">Saved</span> : null}
        {status === "failed" ? <span role="alert" className="gs-error">{saveMsg || "Failed"}</span> : null}
      </div>
      {vault && sheetUrl ? (
        <div className="gs-inline" data-testid="gs-sheet-url">
          <span>Your app reads its style from: <code>{sheetUrl}</code></span>
          <button type="button" className={BTN} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
      ) : null}
      {!allPass ? <p className="gs-error">Save is off until every contrast check passes.</p> : null}
    </>
  );
}
