/**
 * "+ Add Information" and its chooser. A card does not have to show all its fields all the time: it displays what it has, and at the
 * bottom (as well as with the "+" at the top) the person adds more kinds of information as needed.
 *
 * The chooser is MyNet's `AddPropertySheet` in this app's words: a full-window sheet with a Search box and an italic Cancel, a bold title,
 * and the choices under bold group headings (Connection points · Companies · Skills and interests …), each a row of at least 44 px.
 * What it lists is not a catalogue kept here: it is the card's own groups that are NOT shown now (nothing in them, not added yet) and
 * that the card may add to, as each group reported itself (`CardGroup` → `CardMode.register`). Choosing one turns edit mode on and
 * shows that group, empty, with its add row and the cursor on it; left empty, it is gone again when edit mode is left.
 *
 * ⚠ MyNet's button (`Button variant="outline" size="lg"`, full width, teal) is drawn in this app's own tokens (accent), as every
 * copy on the card maps MyNet's Tailwind names.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { eventTargetInTopDialog, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { dropStaleSheetEntry, useSheetHistory } from "@kaigilb/gilbplatformcode-sheet-history";

/** The full-width outlined "+ Add Information" at the foot of the card (MyNet `Profile.tsx`). Not drawn when the card cannot be written. */
export function AddInformationButton() {
  const mode = useCardMode();
  if (!mode.managed || !mode.canEdit) return null;
  return (
    <button
      type="button"
      data-testid="card-add-info-button"
      aria-haspopup="dialog"
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--paper)] px-6 py-3 text-base font-medium text-[var(--accent)] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      onClick={() => mode.setChooserOpen(true)}
    >
      + Add Information
    </button>
  );
}

/** The chooser itself: one per card, opened by the "+" or the button. */
export function AddInformationSheet() {
  const mode = useCardMode();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const open = mode.managed && mode.canEdit && mode.chooserOpen;
  // The chooser is a history entry: on a phone the system Back closes it and does not leave the card.
  const { requestClose } = useSheetHistory(open, () => {
    setQuery("");
    mode.setChooserOpen(false);
  });
  const close = () => requestClose();
  useEffect(() => {
    dropStaleSheetEntry();
  }, []);
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  // Escape closes THIS sheet, whoever has the focus (a press on the sheet's backdrop leaves it on the page), and nothing under it: the phone's Detail drawer
  // (`Overlay`) listens for Escape on the document and would close with it. Listens first (capture) and stops the event there.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (modalIsOpen() && !eventTargetInTopDialog(e.target)) return;
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mode.setChooserOpen` is stable
  }, [open]);
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map<string, { kind: string; label: string }[]>();
    for (const g of mode.groups.values()) {
      if (g.shown || !g.addable) continue;
      if (q && !g.label.toLowerCase().includes(q) && !g.section.toLowerCase().includes(q)) continue;
      out.set(g.section, [...(out.get(g.section) ?? []), { kind: g.kind, label: g.label }]);
    }
    return [...out.entries()];
  }, [mode.groups, query]);
  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add information"
      data-testid="add-information-sheet"
      // z-[70]: a full-window sheet above everything it is opened from: the phone Detail drawer (AppShell `Overlay`, z-50) and the bottom nav (z-[60]),
      // below the photo viewer (z-[80]) and the vault image picker (z-[90]). At z-40 it sat under the drawer, and on a phone nothing in it could be reached.
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--paper)] text-[var(--ink)]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden px-4">
        <div className="flex items-center gap-3 py-3">
          <input
            ref={searchRef}
            type="search"
            aria-label="Search the kinds of information"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--ink)]"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="min-h-11 px-1 font-[var(--serif)] text-base italic text-[var(--accent)]" onClick={close}>
            Cancel
          </button>
        </div>
        <h2 className="pb-2 pt-1 font-[var(--serif)] text-lg font-bold">Add information</h2>
        <div className="flex-1 overflow-auto pb-8">
          {sections.length === 0 ? (
            <p className="px-1 py-3 text-sm text-[var(--ink-faint)]" data-testid="add-information-none">
              {query.trim() ? "Nothing matches." : "Everything this card can hold is already on it."}
            </p>
          ) : null}
          {sections.map(([heading, items]) => (
            <section key={heading} className="mb-1" aria-label={heading}>
              <h3 className="pt-3 font-[var(--serif)] text-base font-bold">{heading}</h3>
              <ul>
                {items.map((it) => (
                  <li key={it.kind}>
                    <button
                      type="button"
                      data-testid={`add-information-${it.kind}`}
                      className="flex min-h-11 w-full items-center rounded-lg px-3 py-2 pl-5 text-left text-[15px] hover:bg-[var(--sel)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      onClick={() => {
                        mode.openGroup(it.kind);
                        close();
                      }}
                    >
                      {it.label}
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
