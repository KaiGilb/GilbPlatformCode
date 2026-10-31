/**
 * "My Note" and "Where / How we met" on a HELD card: the holder's own words about one contact, at the top of the card, each marked PRIVATE.
 * The look is the MyNet app's contact view: a "My Note" card with a PRIVATE tag and "Something only you will see…", then "Where / How we met",
 * PRIVATE, "e.g. Madrid Conference".
 *
 * The same terms, route and state machine as the MyNet app: `t:ContactPrivateNote` / `a:contactPrivateNote` and `t:ConnectionOrigin` /
 * `a:connectionOrigin`, through `GET/PUT /base/connect/annotations` (`./contactAnnotation`), and `useAnnotationDraft` (debounce, blur and page-hide
 * writes, the no-op and never-clear-what-was-not-read guards). Here only the FRAME is the card's (`CardGroup`). Same two modes as the rest of the
 * card: in PRESENTATION the text is shown (an empty one shows its placeholder: always drawn on a card the holder can write; a card that cannot be
 * written draws none that is empty); a click on the text turns edit mode on and puts the cursor in it; "+ Add Information" lists one that is not
 * drawn and opens it.
 *
 * Never a held-claim field, a note document, a marker or a find key: the route writes the typed record private, and only (caller, held party)
 * reads it back. The contact cannot read what is written about them.
 */
import { useEffect, useId, useRef, useState } from "react";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { AnnotationSaveState } from "./AnnotationSaveState";
import { PrivateMarker } from "./PrivateMarker";
import { useAnnotationDraft } from "./useAnnotationDraft";
import type { AnnotationLoad } from "./contactAnnotation";

export type HolderField = "note" | "origin";

/** A one-line box grows to show all it holds (and shrinks back), so it never scrolls inside itself. */
export function growBox(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * The colour of an empty box's hint ("Something only you will see…"). Left to the browser, a
 * placeholder is drawn at half the text colour, 3.02:1 on the card, below the 4.5:1 that normal text needs. `--ink-soft` is at least
 * 4.88:1 on the paper, the surface and the online shade in the light, dark and colour-blind themes.
 */
export const HINT = "placeholder:text-[var(--ink-soft)]";

const COPY: Record<HolderField, { kind: string; title: string; icon: "note" | "pin"; placeholder: string; loadError: string; saveError: string; testId: string }> = {
  note: {
    kind: "my-note",
    title: "My Note",
    icon: "note",
    placeholder: "Something only you will see…",
    loadError: "Could not load your note.",
    saveError: "Could not save your note",
    testId: "contact-note",
  },
  origin: {
    kind: "how-we-met",
    title: "Where / How we met",
    icon: "pin",
    placeholder: "e.g. Madrid Conference",
    loadError: "Could not load where you met.",
    saveError: "Could not save where you met",
    testId: "connection-origin",
  },
};

export function HolderNoteGroup({
  field,
  vaultId,
  heldParty,
  initialText,
  initialLoad,
  onReload,
  onSaved,
  errorCopy,
}: {
  field: HolderField;
  vaultId: string;
  /** The contact's record: the route's `heldParty`. */
  heldParty: string;
  /** What the one shared read of both fields found (the parent loads both in ONE round trip). */
  initialText: string | null;
  initialLoad: AnnotationLoad;
  onReload?: () => void;
  /** A write LANDED with this value: the parent keeps what the card read, so a card opened again inside the minute shows it. */
  onSaved?: (text: string | null) => void;
  /** What a failed read says, when it is not the generic words (the read could not be tied to this card's vault). */
  errorCopy?: string;
}) {
  const c = COPY[field];
  const mode = useCardMode();
  const labelId = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const { surface, draft, others, save, saveError, onChange, onBlur, reload } = useAnnotationDraft({
    memberPrincipal: heldParty,
    vaultId,
    field,
    loadErrorCopy: errorCopy ?? c.loadError,
    initialText,
    initialLoad,
    ...(onSaved ? { onSaved } : {}),
  });
  const text = draft.trim();
  const failed = surface.kind === "error";
  // A group the person is writing in stays while they do. On a card the
  // holder can write, both are ALWAYS drawn, as MyNet draws them, an empty one with its placeholder (a click on it opens the box). One with nothing in it on a
  // card that cannot be written has nothing to show and no way to add, so it is not drawn (and a failed read is NOT "nothing").
  const empty = text === "" && !failed && others.length === 0 && !mode.canEdit;
  // Edit mode just turned on by a click on this group's text: the cursor goes into the box.
  const wantsFocus = useRef(false);
  useEffect(() => {
    if (mode.editing && wantsFocus.current) {
      wantsFocus.current = false;
      area.current?.focus();
    }
  }, [mode.editing]);
  const editing = mode.editing || !mode.managed;
  // Smaller when empty ("make them way smaller when empty. Ready to take notes but find a way to
  // make the smaller/less space."): with nothing in it, on a card the holder can write, the group is ONE line (`inline`): its title and a
  // one-line box to type in at once, no click into Edit first. The box grows with what is typed (`growBox`), and the group keeps this
  // shape while the box has focus, so the cursor is never moved out of it; once left with text in it, the group is drawn as before. The
  // writes are the same (`useAnnotationDraft`'s onChange and onBlur, unchanged).
  // The shape is HELD while EITHER box has focus. Without that, clearing a filled note in Edit made
  // `text === ""`, swapped in the compact box, unmounted the focused one, and the next typed text was lost. `heldShape` is the shape at focus
  // time (true = compact, false = full); null when no box of this group has focus.
  const [heldShape, setHeldShape] = useState<boolean | null>(null);
  const canCompact = mode.canEdit && !failed && surface.kind !== "loading" && others.length === 0;
  const compact = canCompact && (heldShape ?? text === "");
  const holdShape = () => setHeldShape(compact);
  const releaseShape = () => setHeldShape(null);
  if (compact) {
    return (
      <CardGroup
        kind={c.kind}
        title={<span id={labelId}>{c.title}</span>}
        label={c.title}
        icon={c.icon}
        empty={false}
        inline
        aside={<PrivateMarker testId={`${c.testId}-private`} />}
        testId={`${c.testId}-group`}
        dataAttrs={{ "data-annotation-state": surface.kind, "data-save": save, "data-compact": "true" }}
      >
        <div data-testid={c.testId}>
          <textarea
            ref={area}
            rows={1}
            aria-labelledby={labelId}
            className={`block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[15px] leading-snug hover:border-[var(--line)] focus:border-[var(--line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${HINT}`}
            style={{ color: "var(--ink)" }}
            data-testid={`${c.testId}-editor`}
            value={draft}
            placeholder={c.placeholder}
            onFocus={holdShape}
            onChange={(e) => {
              growBox(e.currentTarget);
              onChange(e.target.value);
            }}
            onBlur={() => {
              releaseShape();
              onBlur();
            }}
          />
          <AnnotationSaveState state={save} error={saveError} testId={c.testId} errorCopy={c.saveError} />
        </div>
      </CardGroup>
    );
  }
  return (
    <CardGroup
      kind={c.kind}
      title={<span id={labelId}>{c.title}</span>}
      label={c.title}
      icon={c.icon}
      empty={empty}
      aside={<PrivateMarker testId={`${c.testId}-private`} />}
      testId={`${c.testId}-group`}
      dataAttrs={{ "data-annotation-state": surface.kind, "data-save": save }}
    >
      <div className="py-1.5" data-testid={c.testId}>
        {surface.kind === "loading" ? (
          <p className="text-[13px]" style={{ color: "var(--ink-faint)" }} data-testid={`${c.testId}-loading`}>
            Loading…
          </p>
        ) : null}
        {failed ? (
          <div role="alert" data-testid={`${c.testId}-error`}>
            <p className="text-[13px]" style={{ color: "var(--bad)" }}>{surface.message}</p>
            <button
              type="button"
              className="min-h-10 text-sm font-medium underline"
              style={{ color: "var(--accent)" }}
              onClick={() => {
                void reload();
                onReload?.();
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
        {!failed && surface.kind !== "loading" ? (
          editing ? (
            <textarea
              ref={area}
              aria-labelledby={labelId}
              className={`min-h-20 w-full resize-y rounded-md border px-3 py-2 text-base ${HINT}`}
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
              data-testid={`${c.testId}-editor`}
              value={draft}
              placeholder={c.placeholder}
              onFocus={holdShape}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => {
                releaseShape();
                onBlur();
              }}
            />
          ) : (
            <button
              type="button"
              className="min-h-10 w-full whitespace-pre-wrap break-words text-left text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              style={{ color: "var(--ink)" }}
              data-testid={`${c.testId}-text`}
              onClick={() => {
                wantsFocus.current = true;
                mode.enter();
              }}
            >
              {text === "" ? <span style={{ color: "var(--ink-faint)" }}>{c.placeholder}</span> : draft}
            </button>
          )
        ) : null}
        {others.length > 0 ? (
          <ul className="flex flex-col gap-1" data-testid={`${c.testId}-others`}>
            {others.map((v) => (
              <li key={v.entity} className="text-sm" style={{ color: "var(--ink-faint)" }} data-entity={v.entity}>
                {v.text} <span className="text-xs">— from another app</span>
              </li>
            ))}
          </ul>
        ) : null}
        <AnnotationSaveState state={save} error={saveError} testId={c.testId} errorCopy={c.saveError} />
      </div>
    </CardGroup>
  );
}
