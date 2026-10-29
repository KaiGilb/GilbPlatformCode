/**
 * The rows and marks of a merged person card: what a linked person's card body draws for each row the merge returns.
 *
 * Their online card is the master, and the holder adds their own fields to it. Online content cannot be edited, so it is given a
 * little shade; the holder's own content keeps the card's plain surface.
 *
 * What it draws:
 * - `TheirRow` / `TheirRows`: a row of their online card (the merge's `source: "theirs"` rows). Shaded (`ONLINE_SHADE`), read-only
 *   (no control at all), marked with the chain link (`LinkMark`), with "Shown to you as: <chip words>"; "You have the same on
 *   your card." when the holder holds an equal value. In Edit it adds "only they can change this".
 * - `YourRow`: one of the app's OWN editors, drawn as it is: no mark. The editor is the app's (it keeps writing exactly as it
 *   did). Yours keeps the card's own surface.
 *
 * A row of theirs carries the header's chain link (`LinkGlyph`, the live-link colour `W.link`) and a row of yours carries nothing.
 * The link's words (`ONE_CARD_WORDS.linked`) are its readable name and its hover title, so the meaning never rests on the shade
 * alone. `SourceMark`, `OwnBlockMark` and `OneCardLegend` are kept for any caller that wants the Theirs and Yours badges.
 * - `OwnBlockMark`: the mark above a block of own rows an app draws as one piece (an address card, an employment list).
 * - `BothKeptLine`, `OneCardLegend`, `OneCardFoot` (the quiet Unlink of the card's foot, with its question).
 *
 * No merge here: which row is theirs, which values are equal and what is hidden is `mergeOneCard`'s (`one-card-merge`). No read
 * and no write: Unlink is the caller's act (`onUnlink`). No field, label or rung word is typed here: labels and the chip words
 * come in from the caller and the merge. The only words of this file are the marks' and the help sentences (`ONE_CARD_WORDS`).
 *
 * Styling is inline with CSS variables, each host token first, then a second name, then a plain value, so a host needs no Tailwind
 * scan of this package. Contrast (measured on the mockup): on the shade the quiet line is `--ink-soft` (4.9:1 light), never
 * `--ink-faint` (3.2:1), and a theirs mark is the ink (> 10:1), never the accent (4.4:1).
 */
import { useState, type ReactNode } from "react";
import type { OneCardRow } from "@kaigilb/gilbplatformcode-one-card-merge";
import { LinkGlyph, W } from "@kaigilb/gilbplatformcode-stakeholder-ui-kit";


/** The marks' and the help sentences' words: the only words this file has. */
export const ONE_CARD_WORDS = {
  theirs: "Theirs",
  yours: "Yours · private",
  theirsTitle: "From their online card. Live. Only they can change it.",
  /** The readable name of a row of theirs' chain link (its hover title is `theirsTitle`). */
  linked: "From their online card",
  yoursTitle: "Your own. Only you see it. You can change it.",
  shownAs: (words: string) => `Shown to you as: ${words}`,
  sharedAt: (words: string) => `You see this because it is shared at: ${words}`,
  onlyThey: " · only they can change this",
  same: "You have the same on your card.",
  bothKept: "Theirs and yours differ. Both are kept; nothing is overwritten.",
  legendTheirs: "shaded: from their online card, live, at what they share with you. They decide.",
  legendYours: "plain: only you see it. You can change it.",
  connected: "Connected to their online card.",
  unlink: "Unlink",
  unlinkAsk: "Removes the link between your card and their online card. Your own fields and notes stay on your card; their fields leave it.",
  unlinkPlaced: " They stay in your circles and show as their own row.",
  keep: "Keep",
  removing: "Removing…",
} as const;

/**
 * The background of every theirs row: the host's `--online-shade`, else `--color-online-shade`, else the light value
 * (#EAE8E3: the card surface 94% and the ink). The host sets its own dark value per theme.
 */
export const ONLINE_SHADE = "var(--online-shade, var(--color-online-shade, #EAE8E3))";

/** Colour tokens: the host's first name, then a second name, a plain value last. */
const T = {
  ink: "var(--ink, var(--color-ink, #2a2622))",
  soft: "var(--ink-soft, var(--color-ink-secondary, #67635e))",
  faint: "var(--ink-faint, var(--color-ink-muted, #6f6a63))",
  line: "var(--line, var(--color-line, #d9d4cb))",
  frame: "color-mix(in srgb, var(--lines, var(--color-ink, #2a2622)) 14%, transparent)",
  surface: "var(--surface, var(--color-card, #ffffff))",
  sunken: "var(--surface-sunken, var(--color-field, #f4f1ea))",
  accentInk: "var(--accent-ink, var(--color-primary, #8f4e33))",
  accentSoft: "var(--accent-soft, var(--color-primary-light, #f1e4dc))",
  warn: "var(--warn, var(--color-error-dark, #9a6a1e))",
} as const;

/**
 * The both-kept line's colour: the host's warn mixed 55% with its ink. Plain warn as small text measured 4.29:1 (light) and 2.07:1
 * (colourblind theme) on the card surface; the mix keeps the warm tone and passes 4.5:1 in light, dark and cvd.
 */
const WARN_TEXT = `color-mix(in srgb, ${T.warn} 55%, ${T.ink})`;

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5" />
    </svg>
  );
}

/**
 * The mark of a row's source, in words (the meaning never rests on the shade alone).
 *
 * @param source "theirs" (their online card) or "yours" (the holder's own, private)
 * @param onShade the mark sits on the online shade: a theirs mark is then the ink, not the accent (contrast)
 */
export function SourceMark({ source, onShade = false }: { source: "theirs" | "yours"; onShade?: boolean }) {
  const theirs = source === "theirs";
  return (
    <span
      data-testid="one-card-mark"
      data-source={source}
      title={theirs ? ONE_CARD_WORDS.theirsTitle : ONE_CARD_WORDS.yoursTitle}
      style={{
        flex: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: "16px",
        borderRadius: 999,
        padding: "1px 8px",
        whiteSpace: "nowrap",
        marginTop: 2,
        color: theirs ? (onShade ? T.ink : T.accentInk) : T.soft,
        background: theirs ? T.accentSoft : "transparent",
        border: theirs ? "1px solid transparent" : `1px solid ${T.frame}`,
      }}
    >
      {theirs ? <GlobeIcon /> : <PersonIcon />}
      {theirs ? ONE_CARD_WORDS.theirs : ONE_CARD_WORDS.yours}
    </span>
  );
}

export interface TheirRowProps {
  /** The field's label (the master's), or null to draw none (the group title already names it). */
  label?: string | null;
  /** The value as the app words it (a skill by its name); the merge's value otherwise. */
  value: ReactNode;
  /** The rung's chip words, from the merge (`rungChipWords`). */
  rungWords?: string;
  /** The holder holds an equal value (merge `sameAsTheirs`). */
  sameAsTheirs?: boolean;
  /** Their notes on the value (a skill's note). */
  notes?: readonly string[];
  /** The card is in Edit: the row says only they can change it. */
  editing?: boolean;
  /** Two sources: draw the mark. */
  marks?: boolean;
  /** The group's side padding, px: the shade runs the group's full width. Default 16. */
  bleed?: number;
}

/** One row of their online card: shaded, read-only, marked Theirs. */
export function TheirRow({ label, value, rungWords, sameAsTheirs, notes, editing = false, marks = true, bleed = 16 }: TheirRowProps) {
  return (
    <div
      data-testid="one-card-row"
      data-source="theirs"
      style={{
        background: ONLINE_SHADE,
        margin: `0 -${bleed}px`,
        padding: `8px ${bleed}px`,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: "4px 12px",
      }}
    >
      <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        {label ? (
          <span data-testid="one-card-row-label" style={{ fontSize: 12, fontWeight: 500, color: T.soft }}>
            {label}
          </span>
        ) : null}
        <span data-testid="one-card-row-value" style={{ fontSize: 15, color: T.ink, overflowWrap: "anywhere" }}>
          {value}
        </span>
        {notes?.map((n) => (
          <span key={n} style={{ fontSize: 12.5, color: T.soft, overflowWrap: "anywhere" }}>
            {n}
          </span>
        ))}
        {rungWords ? (
          <span data-testid="one-card-row-why" title={ONE_CARD_WORDS.sharedAt(rungWords)} style={{ fontSize: 11.5, color: T.soft }}>
            {ONE_CARD_WORDS.shownAs(rungWords)}
            {editing ? ONE_CARD_WORDS.onlyThey : ""}
          </span>
        ) : null}
        {sameAsTheirs ? (
          <span data-testid="one-card-row-same" style={{ fontSize: 11.5, color: T.soft }}>
            {ONE_CARD_WORDS.same}
          </span>
        ) : null}
      </div>
      {marks ? <LinkMark /> : null}
    </div>
  );
}

/**
 * The mark of a row of their online card: the header's chain link (`LinkGlyph`) in the live-link colour, where the Theirs badge
 * was. Its words (`ONE_CARD_WORDS.linked`) are its readable name and its title says what it means, so the meaning does not rest on the
 * shade or the colour alone. Contrast (WCAG 1.4.11, non-text 3:1): `W.link` measured 6.8:1 on the light sheet; the shade
 * is darker than the sheet by 6% of the ink only.
 */
export function LinkMark() {
  return (
    <span
      data-testid="one-card-mark"
      data-source="theirs"
      title={ONE_CARD_WORDS.theirsTitle}
      style={{ flex: "none", display: "inline-flex", alignItems: "center", marginTop: 3, color: W.link }}
    >
      <LinkGlyph size={14} />
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{ONE_CARD_WORDS.linked}</span>
    </span>
  );
}

/**
 * The theirs rows of one merged group, in the merge's order. A yours row of the merge is NOT drawn here: the app's own editor draws
 * it (and keeps writing as it did).
 *
 * @param rows the merged group's rows (`OneCardGroup.rows`)
 * @param label the label to draw on a row, or null for none; then the row's own label (its value's purpose, "Work"), if any
 * @param valueText the value as the app words it (default: the merge's value)
 */
export function TheirRows({
  rows,
  label,
  valueText,
  editing = false,
  marks = true,
  bleed,
}: {
  rows: readonly OneCardRow[];
  label?: (row: OneCardRow) => string | null;
  valueText?: (row: OneCardRow) => ReactNode;
  editing?: boolean;
  marks?: boolean;
  bleed?: number;
}) {
  return (
    <>
      {rows
        .filter((r) => r.source === "theirs")
        .map((r, i) => (
          <TheirRow
            key={`${r.field}|${r.rung ?? ""}|${r.value}|${i}`}
            label={(label ? label(r) : null) ?? r.label ?? null}
            value={valueText ? valueText(r) : r.value}
            rungWords={r.rungWords}
            sameAsTheirs={r.sameAsTheirs === true}
            notes={r.notes}
            editing={editing}
            marks={marks}
            bleed={bleed}
          />
        ))}
    </>
  );
}

/**
 * One of the app's own editors on the one card. No mark; with two sources the editor is
 * wrapped once (`one-card-own-row`, `data-source="yours"`) so a tool can still tell a row of yours, and nothing is drawn beside it.
 * With no marks (one source) only the editor is drawn.
 */
export function YourRow({ marks, children }: { marks: boolean; children: ReactNode }) {
  if (!marks) return <>{children}</>;
  return (
    <div data-testid="one-card-own-row" data-source="yours" style={{ minWidth: 0 }}>
      {children}
    </div>
  );
}

/** The Yours · private mark above a block of own rows the app draws as one piece. */
export function OwnBlockMark() {
  return (
    <div data-testid="one-card-own-block" data-source="yours" style={{ display: "flex", justifyContent: "flex-end", padding: "6px 0 0" }}>
      <SourceMark source="yours" />
    </div>
  );
}

/** A one-value field holds a value of theirs and a different value of yours: both are kept. */
export function BothKeptLine() {
  return (
    <p data-testid="one-card-both-kept" style={{ margin: 0, padding: "8px 0", fontSize: 11.5, color: WARN_TEXT }}>
      {ONE_CARD_WORDS.bothKept}
    </p>
  );
}

/** What the shade and the marks mean, once at the top of a card with two sources. */
export function OneCardLegend() {
  const swatch = (bg: string) => (
    <span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, border: `1px solid ${T.frame}`, background: bg }} />
  );
  const item = { display: "inline-flex", alignItems: "center", gap: 5 } as const;
  return (
    <div
      data-testid="one-card-legend"
      style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: T.soft, padding: "8px 10px", borderRadius: 7, background: T.sunken }}
    >
      <span style={item}>
        {swatch(ONLINE_SHADE)}
        {/* The ink, as on the shade: the accent on its pill is 4.4:1. */}
        <SourceMark source="theirs" onShade />
        <span>{ONE_CARD_WORDS.legendTheirs}</span>
      </span>
      <span style={item}>
        {swatch(T.surface)}
        <SourceMark source="yours" />
        <span>{ONE_CARD_WORDS.legendYours}</span>
      </span>
    </div>
  );
}

/**
 * The card's foot on a linked card: "Connected to their online card." and a quiet Unlink that asks first.
 *
 * @param canUnlink the holder may write this record (a reader sees the connection, no Unlink)
 * @param busy an unlink is under way
 * @param placed the person is also in the holder's circles: after unlinking they show as their own row
 * @param onUnlink the caller's unlink (the existing door); called once, after the holder confirms
 */
export function OneCardFoot({ canUnlink, busy, placed, onUnlink }: { canUnlink: boolean; busy: boolean; placed: boolean; onUnlink: () => void }) {
  const [asking, setAsking] = useState(false);
  const btn = {
    minHeight: 32,
    borderRadius: 7,
    padding: "0 12px",
    fontSize: 12.5,
    fontWeight: 500,
    background: T.surface,
    cursor: "pointer",
  } as const;
  return (
    <div
      data-testid="one-card-foot"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px", fontSize: 12, color: T.soft, borderTop: `1px dashed ${T.line}`, paddingTop: 10 }}
    >
      {asking ? (
        <div data-testid="one-card-unlink-ask" role="group" aria-label="Remove the link" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span>
            {ONE_CARD_WORDS.unlinkAsk}
            {placed ? ONE_CARD_WORDS.unlinkPlaced : ""}
          </span>
          <button
            type="button"
            data-testid="one-card-unlink-confirm"
            disabled={busy}
            style={{ ...btn, border: `1px solid ${T.warn}`, color: T.warn }}
            onClick={() => {
              setAsking(false);
              onUnlink();
            }}
          >
            {busy ? ONE_CARD_WORDS.removing : ONE_CARD_WORDS.unlink}
          </button>
          <button type="button" style={{ ...btn, border: `1px solid ${T.frame}`, color: T.ink }} onClick={() => setAsking(false)}>
            {ONE_CARD_WORDS.keep}
          </button>
        </div>
      ) : (
        <>
          <span aria-hidden="true" style={{ display: "inline-flex" }}>
            <GlobeIcon />
          </span>
          <span>{ONE_CARD_WORDS.connected}</span>
          {canUnlink ? (
            <button
              type="button"
              data-testid="one-card-unlink"
              disabled={busy}
              onClick={() => setAsking(true)}
              style={{ border: 0, background: "transparent", color: T.soft, textDecoration: "underline", fontSize: 12, padding: 2, cursor: "pointer" }}
            >
              {busy ? ONE_CARD_WORDS.removing : ONE_CARD_WORDS.unlink}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
