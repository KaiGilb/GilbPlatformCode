/**
 * The row of ONE plain text field on a card: its sub-label, the value, and a click on the value edits it in place with the
 * value pre-selected and scrolled into view. Blur or Enter commits; Escape reverts; an empty value reads "Add <name>".
 *
 * In the card's presentation mode (`useCardMode`) a row with no value is not drawn (no "Add ..."), and a click on a value
 * turns the card's edit mode on and edits that value in place.
 * With `options`, the edit is a choice among the term's closed value set (a `select`), never free text.
 * `scrollIntoView` is called only where it exists (jsdom has none).
 */

import { useEffect, useRef, useState } from "react";
import { BirthdayPicker } from "@kaigilb/gilbplatformcode-birthday-picker";
import { birthdayText } from "@kaigilb/gilbplatformcode-birthday-text";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { insideOpenLayer, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { useFieldPickers, type FieldPickers } from "./fieldPickers";

/** A row whose value is PICKED from a list, never typed. */
export type FieldPicker = "contact-language" | "time-zone" | "birthday";

/**
 * The picker a row can use: the one asked for, or null when the host supplied none for it (the row then edits as a text box, as it does
 * for `picker` null). The birthday picker is a peer unit and is always there.
 */
function pickerOf(picker: FieldPicker | null, pickers: FieldPickers): FieldPicker | null {
  if (picker === "contact-language") return pickers.ContactLanguagePicker ? picker : null;
  if (picker === "time-zone") return pickers.TimeZonePicker ? picker : null;
  return picker;
}

/** How a picked row's stored value reads (display only, never stored). A display member the host did not supply: as stored. */
function pickedDisplay(picker: FieldPicker | null, value: string, pickers: FieldPickers): string {
  if (picker === "contact-language") return pickers.contactLanguageDisplay ? pickers.contactLanguageDisplay(value) : value;
  if (picker === "time-zone") return pickers.timeZoneDisplay ? pickers.timeZoneDisplay(value) : value;
  if (picker === "birthday") return birthdayText(value) ?? value;
  return value;
}

export function FieldRow({
  label,
  value,
  onCommitValue,
  readOnly = false,
  options = null,
  picker: pickerAsked = null,
  multiline = false,
  hideLabel = false,
  prominent = false,
  onEditingChange,
  retainFocusWithinSection = false,
  enterCard = true,
  initialEditing = false,
}: {
  /** The master's label for the field: the row's sub-label. */
  label: string;
  value: string;
  onCommitValue: (value: string) => void;
  readOnly?: boolean;
  /** The term's closed value set, or null for free text. */
  options?: readonly string[] | null;
  /** Edit by picking from this list instead of typing; null for the text box. */
  picker?: FieldPicker | null;
  /** A textarea. Enter inserts a newline; blur still commits. Ignored for a choice or a picker. */
  multiline?: boolean;
  /** The group title already names the field. Do not print the sub-label again. */
  hideLabel?: boolean;
  /** The Function description: the named 20px, semibold, larger than the person card's 15px name. */
  prominent?: boolean;
  /** Fires when this row's own editor opens or closes. Omitted: the row does not report it. */
  onEditingChange?: (editing: boolean) => void;
  /**
   * Blur whose next focus is inside this row's card group (`section`) saves the value but leaves the
   * editor open. Escape anywhere in that section closes it. Omitted: blur and Escape behave as before.
   */
  retainFocusWithinSection?: boolean;
  /** False: opening this row does not turn the whole card into Edit. Default: a click enters the card. */
  enterCard?: boolean;
  /** Open the editor on mount. Default false, so a row still opens only when its value is clicked. */
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const skipCommit = useRef(false);
  const notify = useRef(onEditingChange);
  notify.current = onEditingChange;
  const setOpen = (next: boolean) => {
    setEditing(next);
    notify.current?.(next);
  };

  // Keep the draft in sync when the persisted value changes and we're not editing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const mode = useCardMode();
  const pickers = useFieldPickers();
  const picker = pickerOf(pickerAsked, pickers);
  const present = mode.managed && mode.presentation;
  const startEdit = () => {
    if (readOnly) return;
    skipCommit.current = false;
    if (enterCard) mode.enter();
    setDraft(value);
    setOpen(true);
  };

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (!(el instanceof HTMLSelectElement) && typeof el.select === "function") el.select(); // pre-select the whole value
    // Lift the field above the soft keyboard.
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [editing]);

  const commit = (next = draft) => {
    if (skipCommit.current) {
      skipCommit.current = false;
      setOpen(false);
      return;
    }
    setOpen(false);
    const v = next.trim();
    if (v !== value.trim()) onCommitValue(v);
  };
  const cancel = () => {
    skipCommit.current = true;
    setDraft(value);
    setOpen(false);
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  // The source control sits in the same group. Focus moving into it is not leaving the line.
  useEffect(() => {
    if (!editing || !retainFocusWithinSection) return;
    const onKey = (e: KeyboardEvent) => {
      if (modalIsOpen()) return;
      if (e.key !== "Escape") return;
      const section = inputRef.current?.closest("section");
      const t = e.target;
      if (!(t instanceof Node) || !section?.contains(t)) return;
      // A dialog mounted in the group handles its own Escape: it closes the dialog, not the line.
      if (t instanceof Element && t.closest('[role="dialog"], [aria-modal="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      cancelRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [editing, retainFocusWithinSection]);
  const onBlur = (e: React.FocusEvent<HTMLElement>) => {
    if (retainFocusWithinSection) {
      const next = e.relatedTarget;
      const section = e.currentTarget.closest("section");
      if (next instanceof Node && section?.contains(next)) {
        if (skipCommit.current) {
          skipCommit.current = false;
          return;
        }
        const v = draft.trim();
        if (v !== value.trim()) onCommitValue(v);
        return;
      }
    }
    // Focus moved into a dialog this line opened (or one is already open). Do not commit-and-close:
    // the line stays up, and the dialog stays mounted on it.
    if (insideOpenLayer(e.relatedTarget instanceof Node ? e.relatedTarget : null)) return;
    commit();
  };

  // Presentation draws no empty row (no placeholder, no "Add …"). A row being edited stays until it is left.
  if (present && !value.trim() && !editing) return null;

  // A stored value outside the published set is still offered, so opening the choice never drops it.
  const choices = options ? (value && !options.includes(value) ? [value, ...options] : [...options]) : null;

  return (
    <div className="relative" data-testid="field-row" data-field-label={label}>
      <div className="relative flex items-start gap-2 py-1.5">
        <div className="min-w-0 flex-1">
          {hideLabel ? null : <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">{label}</p>}
          {editing && picker === "birthday" ? (
            <BirthdayPicker
              label={label}
              value={value}
              onPick={(v) => {
                setOpen(false);
                if (v !== value.trim()) onCommitValue(v);
              }}
              onCancel={cancel}
              // Clearing the value is how this row is emptied (it has no remove control).
              onClear={() => {
                setOpen(false);
                if (value.trim()) onCommitValue("");
              }}
            />
          ) : editing && picker ? (
            (() => {
              const Picker = (picker === "contact-language" ? pickers.ContactLanguagePicker : pickers.TimeZonePicker)!;
              return (
                <Picker
                  label={label}
                  value={value}
                  onPick={(v) => {
                    setOpen(false);
                    if (v !== value.trim()) onCommitValue(v);
                  }}
                  onCancel={cancel}
                  // Clearing the value is how this row is emptied (it has no remove control).
                  onClear={() => {
                    setOpen(false);
                    if (value.trim()) onCommitValue("");
                  }}
                />
              );
            })()
          ) : editing ? (
            choices ? (
              <select
                ref={inputRef as React.RefObject<HTMLSelectElement>}
                aria-label={`Edit ${label}`}
                className="mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[16px] text-[var(--ink)]"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  commit(e.target.value);
                }}
                onBlur={onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  }
                }}
              >
                <option value="">—</option>
                {choices.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              multiline && !choices ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                aria-label={`Edit ${label}`}
                rows={4}
                className={
                  prominent
                    ? "mt-0 w-full resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-4 text-[20px] font-semibold leading-relaxed text-[var(--ink)]"
                    : "mt-0.5 w-full resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[16px] leading-relaxed text-[var(--ink)]"
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  }
                }}
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                inputMode="text"
                aria-label={`Edit ${label}`}
                className="mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[16px] text-[var(--ink)]"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  }
                }}
              />
            )
            )
          ) : (
            <button
              type="button"
              className={
                prominent
                  ? "mt-0 block w-full whitespace-pre-line break-words rounded-[var(--r-sm)] py-4 text-left text-[20px] font-semibold leading-relaxed text-[var(--ink)] disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  : `mt-0.5 block min-h-10 w-full break-words rounded-[var(--r-sm)] py-1.5 text-left text-[15px] text-[var(--ink)] disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]${multiline ? " whitespace-pre-line" : ""}`
              }
              onClick={startEdit}
              disabled={readOnly}
              aria-label={`Edit ${label}`}
              // An EMPTY row is where the value is added; the pick from the card's add chooser presses it (`CardGroup`).
              {...(!value && !readOnly ? { "data-card-add": "" } : {})}
            >
              {value ? (
                pickedDisplay(picker, value, pickers)
              ) : <span className="text-[var(--ink-ghost)]">{readOnly ? "—" : `Add ${label.toLowerCase()}`}</span>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
