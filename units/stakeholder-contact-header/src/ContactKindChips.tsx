/**
 * The KIND-OF-CONTACT CHIPS beside a name, one component for two apps that each adapt it. A chip says what kind of contact someone is
 * ("Personal 1st Connection", "Professional Inner Circle", a kind such as "Friend"); it is not about their access levels.
 *
 * TWO ADAPTERS, ONE LOOK. The words and the colours are the same in both ("Personal 1st Connection" green, "Professional Inner Circle" blue; a
 * kind such as "Friend" neutral). What a chip MEANS is the adapter's, and it says so: `meaning="access"` (the chip is a circle
 * membership, it changes who may see what) or `meaning="label"` (a label for the holder's own knowing, it grants nothing). `help`
 * is that sentence, shown as every chip's tooltip, in the chooser and, in edit mode, under the chips. The component itself writes nothing:
 * it draws `chips`, and tells its adapter `onAdd(entry)` / `onRemove(chip)`.
 *
 * In presentation (`editing` false) the chips are text, no (−), no "+"; with no chip nothing is drawn. In edit mode each chip has a red
 * round (−) at its left and a "+ Kind" chip opens the chooser (a dialog: the circle labels, then the kinds, as the master lists them).
 *
 * ⛔ No chip, kind or colour rule beyond the tone the model gives is typed here; the tones are looks (`contactKindModel.toneOfCircleLabel`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { chipText, type CatalogueEntry, type ChipTone, type ContactChip, type LabelAxis } from "@kaigilb/gilbplatformcode-contact-kind-model";

/** What the chip means, by app: the adapter's word (⛔ not decided here). */
export type ChipMeaning = "label" | "access";

const TONE: Record<ChipTone, { bg: string; border: string }> = {
  personal: { bg: "var(--color-connection-personal-bg, #D5E8D4)", border: "var(--color-connection-personal-border, #82B366)" },
  professional: { bg: "var(--color-connection-pro-bg, #DAE8FC)", border: "var(--color-connection-pro-border, #6C8EBF)" },
  neutral: { bg: "color-mix(in srgb, var(--surface, #fff) 90%, var(--ink, #222))", border: "color-mix(in srgb, var(--ink, #222) 28%, transparent)" },
};

const NOTHING_YET: Record<LabelAxis, readonly CatalogueEntry[]> = { circleLabel: [], relationshipKind: [] };

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent,currentColor)]";

export function ContactKindChip({
  chip,
  title,
  meaning,
  testId = "contact-kind-chip",
  data,
  textClass = "text-[color:var(--ink,inherit)]",
}: {
  chip: ContactChip;
  title?: string;
  meaning: ChipMeaning;
  /** The chip's own test id (an adapter's tests may address its placement chips by `contact-card-placement-chip`). */
  testId?: string;
  /** Extra data attributes of the chip (a placement chip: `data-context`, `data-depth`). */
  data?: Record<string, string>;
  /** The text colour class (for example `text-ink`; the default is the theme's `--ink`). */
  textClass?: string;
}) {
  const tone = TONE[chip.tone];
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-xs font-medium ${textClass}`}
      style={{ background: tone.bg, borderColor: tone.border }}
      title={title}
      data-testid={testId}
      data-axis={chip.axis}
      data-tone={chip.tone}
      data-meaning={meaning}
      {...data}
    >
      <span className="truncate">{chipText(chip.label)}</span>
    </span>
  );
}

export function ContactKindChips({
  chips,
  meaning,
  help,
  editing,
  onRemove,
  offered,
  onAdd,
  busy = false,
  loading = false,
  onOpen,
  note,
  addLabel = "Kind",
}: {
  /** The chips on the contact; null while they are not read (nothing is drawn: ⛔ not "no chips"). */
  chips: readonly ContactChip[] | null;
  meaning: ChipMeaning;
  /** What a chip means in this app, one sentence (the adapter's). */
  help?: string;
  editing: boolean;
  onRemove?: (chip: ContactChip) => void;
  /**
   * What may be added now, per axis, already fitted and ordered. `undefined` = not asked for yet: the "+" is drawn anyway and asking is
   * `onOpen`'s job (the master's lists are read when the chooser is opened, ⛔ not on every card). Given and empty, with nothing loading,
   * no "+" is drawn (there is nothing to add).
   */
  offered?: Record<LabelAxis, readonly CatalogueEntry[]>;
  /** The lists are being read: the chooser says so rather than looking empty. */
  loading?: boolean;
  /** The chooser was opened: the adapter reads what it needs. */
  onOpen?: () => void;
  onAdd?: (entry: CatalogueEntry) => void | Promise<unknown>;
  busy?: boolean;
  /** Something true to say beside the chips (a list that may not be whole; the last act that did not happen). */
  note?: string | null;
  addLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const canAdd = editing && !!onAdd && (loading || !offered || offered.circleLabel.length + offered.relationshipKind.length > 0);
  if (!chips && !note) return null;
  const list = chips ?? [];
  if (!editing && list.length === 0 && !note) return null;
  return (
    <div className="flex min-w-0 max-w-full flex-col items-end gap-1" data-testid="contact-kind-chips" data-editing={editing ? "true" : "false"} data-meaning={meaning}>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {list.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1">
            {editing && onRemove && !c.readOnly ? <RemoveControl label={`Remove ${chipText(c.label)}`} disabled={busy} onClick={() => onRemove(c)} /> : null}
            <ContactKindChip chip={c} title={help} meaning={meaning} />
          </span>
        ))}
        {canAdd ? (
          <button
            type="button"
            aria-haspopup="dialog"
            disabled={busy}
            className={`min-h-10 rounded-md border border-dashed px-2.5 py-0.5 text-xs font-medium disabled:opacity-50 ${FOCUS}`}
            style={{ borderColor: "var(--accent, currentColor)", color: "var(--accent, inherit)" }}
            title={help}
            onClick={() => {
              setOpen(true);
              onOpen?.();
            }}
            data-testid="contact-kind-add"
          >
            + {addLabel}
          </button>
        ) : null}
      </div>
      {editing && help ? (
        <p className="max-w-[16rem] break-words pr-0.5 text-right text-[11.5px]" style={{ color: "var(--ink-faint, inherit)" }} data-testid="contact-kind-help">
          {help}
        </p>
      ) : null}
      {note ? (
        <p role="status" className="max-w-[16rem] text-right text-[11.5px]" style={{ color: "var(--ink-faint, inherit)" }} data-testid="contact-kind-note">
          {note}
        </p>
      ) : null}
      {open ? (
        <ContactKindChooser
          offered={offered ?? NOTHING_YET}
          loading={loading || !offered}
          help={help}
          note={note}
          onClose={() => setOpen(false)}
          onPick={(e) => {
            setOpen(false);
            void onAdd?.(e);
          }}
        />
      ) : null}
    </div>
  );
}

/** The chooser: the circle labels, then the kinds, each a row (≥ 44 px); a search narrows both. A dialog, so the card stays in edit mode under it. */
export function ContactKindChooser({
  offered,
  help,
  note,
  loading = false,
  onPick,
  onClose,
}: {
  offered: Record<LabelAxis, readonly CatalogueEntry[]>;
  help?: string;
  /** Something true about the lists the person is choosing from (a list that may not be whole), said INSIDE the chooser, which covers the card. */
  note?: string | null;
  /** The lists are being read from the master. */
  loading?: boolean;
  onPick: (entry: CatalogueEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => searchRef.current?.focus(), []);
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const keep = (xs: readonly CatalogueEntry[]) => xs.filter((e) => !q || e.label.toLowerCase().includes(q));
    return [
      { axis: "circleLabel" as const, heading: "Circle", entries: keep(offered.circleLabel) },
      { axis: "relationshipKind" as const, heading: "Kind of relationship", entries: keep(offered.relationshipKind) },
    ].filter((s) => s.entries.length > 0);
  }, [offered, query]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a kind of contact"
      data-testid="contact-kind-chooser"
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "var(--paper, #fff)", color: "var(--ink, #222)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden px-4">
        <div className="flex items-center gap-3 py-3">
          <input
            ref={searchRef}
            type="search"
            aria-label="Search the kinds of contact"
            className="w-full rounded-lg border px-3 py-2 text-base"
            style={{ borderColor: "var(--line, #ccc)", background: "var(--surface, #fff)", color: "inherit" }}
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className={`min-h-11 px-1 text-base italic ${FOCUS}`} style={{ color: "var(--accent, inherit)" }} onClick={onClose}>
            Cancel
          </button>
        </div>
        <h2 className="pt-1 text-lg font-bold">Kind of contact</h2>
        {help ? (
          <p className="pb-2 text-sm" style={{ color: "var(--ink-faint, inherit)" }} data-testid="contact-kind-chooser-help">
            {help}
          </p>
        ) : null}
        {note ? (
          <p role="status" className="pb-2 text-sm" style={{ color: "var(--ink-faint, inherit)" }} data-testid="contact-kind-chooser-note">
            {note}
          </p>
        ) : null}
        <div className="flex-1 overflow-auto pb-8">
          {sections.length === 0 && loading ? (
            <p className="px-1 py-3 text-sm" style={{ color: "var(--ink-faint, inherit)" }} data-testid="contact-kind-loading">
              Reading the kinds…
            </p>
          ) : null}
          {sections.length === 0 && !loading ? (
            <p className="px-1 py-3 text-sm" style={{ color: "var(--ink-faint, inherit)" }} data-testid="contact-kind-none">
              {query.trim() ? "Nothing matches." : "Everything is already on this contact."}
            </p>
          ) : null}
          {sections.map((s) => (
            <section key={s.axis} aria-label={s.heading} className="mb-1">
              <h3 className="pt-3 text-base font-bold">{s.heading}</h3>
              <ul>
                {s.entries.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      data-testid="contact-kind-option"
                      data-axis={e.axis}
                      className={`flex min-h-11 w-full items-center rounded-lg px-3 py-2 pl-5 text-left text-[15px] ${FOCUS}`}
                      onClick={() => onPick(e)}
                    >
                      {chipText(e.label)}
                      {e.own ? <span className="ml-2 text-xs" style={{ color: "var(--ink-faint, inherit)" }}>yours</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
