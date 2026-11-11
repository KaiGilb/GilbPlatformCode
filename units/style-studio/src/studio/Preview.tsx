import { useId, useMemo, type CSSProperties } from "react";
import { toCssVars } from "@kaigilb/gilbplatformcode-style-runtime";
import { paletteFromSeed, type Harmony } from "@kaigilb/gilbplatformcode-style-runtime";
import type { StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import type { Mode } from "./model";
import { ActionRow } from "../ActionRow";

/** CSS variables for one preview surface. Applied inline to a container only, never to the page. */
export function usePreviewVars(sheet: StyleSheet, mode: Mode, harmony: Harmony): CSSProperties {
  return useMemo(() => {
    const vars = toCssVars(sheet, mode);
    const given = mode === "dark" ? (sheet.dark ?? sheet.palette) : sheet.palette;
    let secondary = given.accent;
    let tertiary = given.accent;
    try {
      const p = paletteFromSeed(given.accent, { mode, harmony });
      secondary = p.secondary;
      tertiary = p.tertiary;
    } catch {
      /* keep accent */
    }
    // A catalogue / website palette brings its own colours: secondary and tertiary are its 2nd and 3rd, already contrast-fixed.
    secondary = vars["--gs-extra-2"] ?? secondary;
    tertiary = vars["--gs-extra-3"] ?? tertiary;
    return { ...vars, "--secondary": secondary, "--tertiary": tertiary } as CSSProperties;
  }, [sheet, mode, harmony]);
}

export interface PreviewProps {
  sheet: StyleSheet;
  mode: Mode;
  harmony: Harmony;
  appName: string;
}

export function Preview({ sheet, mode, harmony, appName }: PreviewProps) {
  const vars = usePreviewVars(sheet, mode, harmony);
  const uid = useId();
  const extraCount = Math.min(6, sheet.palette.extra?.length ?? 0);
  const chartColors = extraCount
    ? Array.from({ length: extraCount }, (_, i) => `var(--gs-extra-${i + 1})`)
    : ["accent", "secondary", "tertiary", "accent", "secondary", "tertiary"].map((c) => `var(--${c})`);
  const logo = sheet.logo?.primary ?? sheet.logo?.mark ?? sheet.logo?.favicon;
  return (
    <div className="gs-preview" data-theme={mode} data-testid="gs-preview" style={vars}>
      <header className="gp-header">
        {logo ? <img className="gp-logo" src={logo} alt="" /> : <span className="gp-logo-ph" aria-hidden="true" />}
        <strong className="gp-app">{appName}</strong>
        <nav className="gp-nav" aria-label="Preview navigation">
          <a href="#preview" onClick={(e) => e.preventDefault()} aria-current="page">Home</a>
          <a href="#preview" onClick={(e) => e.preventDefault()}>Reports</a>
          <a href="#preview" onClick={(e) => e.preventDefault()}>Settings</a>
        </nav>
      </header>
      <main className="gp-main">
        <h2 className="gp-h1">Welcome back</h2>
        <p className="gp-p">The quick brown fox jumps over the lazy dog. <code>0123456789</code></p>
        <div className="gp-grid">
          <section className="gp-window">
            <h3 className="gp-h2">Summary</h3>
            <p className="gp-p">Three things need your attention today.</p>
            <div className="gp-chips">
              <span className="gp-chip gp-ok"><span aria-hidden="true">✓</span> OK</span>
              <span className="gp-chip gp-warn"><span aria-hidden="true">!</span> Warning</span>
              <span className="gp-chip gp-bad"><span aria-hidden="true">✕</span> Problem</span>
            </div>
            <div className="gp-swatches" aria-label="Chart colours">
              {chartColors.map((c, i) => (
                <span key={i} style={{ background: c, height: `${16 + ((i * 11) % 28)}px` }} />
              ))}
            </div>
          </section>
          <section className="gp-window">
            <h3 className="gp-h2">New item</h3>
            <div className="gp-form">
              <label htmlFor={`${uid}-n`}>Name</label>
              <input id={`${uid}-n`} className="gp-input" defaultValue="Quarterly plan" />
              <label htmlFor={`${uid}-s`}>Kind</label>
              <select id={`${uid}-s`} className="gp-input" defaultValue="doc">
                <option value="doc">Document</option>
                <option value="sheet">Sheet</option>
              </select>
              <ActionRow
                destructive={{ label: "Delete" }}
                cancel={{ label: "Cancel" }}
                primary={{ label: "Save" }}
              />
            </div>
          </section>
          <section className="gp-window">
            <h3 className="gp-h2">Delete this record?</h3>
            <p>This cannot be undone.</p>
            <ActionRow cancel={{ label: "Cancel" }} primary={{ label: "Delete", danger: true }} />
          </section>
        </div>
        <table className="gp-table">
          <thead>
            <tr><th>Item</th><th>Owner</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>Budget</td><td>Ana</td><td><span className="gp-chip gp-ok"><span aria-hidden="true">✓</span> Done</span></td></tr>
            <tr><td>Roadmap</td><td>Ben</td><td><span className="gp-chip gp-warn"><span aria-hidden="true">!</span> Late</span></td></tr>
          </tbody>
        </table>
      </main>
    </div>
  );
}
