/**
 * The foot of the ONE card of a person with no online card.
 *
 * WHAT IT DRAWS: one line in the card's foot, "This is your card of <name>. Only you see it. No online card is connected.", and
 * "Find their online card" for a holder who may write the record. Pressed, the foot holds the Find: the name search, each person with
 * the contact points they publish to the holder, and "This is them: connect". Connecting is the controller's existing link write
 * (`a:sameAs`, one PATCH of the record): the card then becomes the linked one card where it stands, with no reload.
 *
 * ⛔ No write path of its own: every act is the controller's (`createOnlineCardController` of the `online-card` unit), from one click.
 * ⛔ Nothing is read until the holder searches: an unlinked card reads neither the resolver nor any card on open.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WORDS as W, type OnlineCardController, type OnlineCardState } from "@kaigilb/gilbplatformcode-online-card";
import { eventTargetInTopDialog, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";

/** Colour tokens: the app's own, with a plain value last. */
const T = {
  ink: "var(--ink,#2a2622)",
  soft: "var(--ink-soft,#55504a)",
  line: "var(--line,#d9d4cb)",
  surface: "var(--surface,#ffffff)",
  accent: "var(--accent,#a85c3b)",
  accentInk: "var(--accent-ink,var(--accent,#a85c3b))",
  onAccent: "var(--on-accent,#ffffff)",
  warn: "var(--warn,#9a6a1e)",
} as const;

const BTN =
  "inline-flex min-h-[36px] pointer-coarse:min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
const FOCUS_STYLE = { outlineColor: T.accent } as const;

export function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
    </svg>
  );
}

/** The existing Find: search by name, then each person with the contact points they publish to you, then one Connect. */
function FindPanel({ controller, state }: { controller: OnlineCardController; state: OnlineCardState }) {
  // Esc is heard by the foot that holds this panel (NoOnlineCardFoot), so it closes the Find from every state, the foot's alert included.
  const find = state.find;
  const connecting = state.busy !== null;
  const [text, setText] = useState(find.status === "idle" ? find.query : "");
  const searching = find.status === "searching";
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div className="flex w-full flex-col gap-2" data-testid="online-card-find">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (searching) return;
          void controller.search(text);
        }}
      >
        <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <span className="text-[12px] font-medium" style={{ color: T.soft }}>
            Their name
          </span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[40px] rounded-md border px-3 text-[16px]"
            style={{ borderColor: T.line, background: T.surface, color: T.ink }}
            data-testid="online-card-find-input"
          />
        </label>
        <button
          type="submit"
          className={`${BTN} self-end aria-disabled:opacity-50`}
          style={{ borderColor: T.accent, background: T.accent, color: T.onAccent, ...FOCUS_STYLE }}
          // While "Searching…" the pressed button stays focusable (aria-disabled, the press ignored above). A `disabled`
          // button drops the focus to the page in Chromium, and the panel's Esc then never hears the key.
          disabled={!searching && text.trim() === ""}
          aria-disabled={searching || undefined}
          data-testid="online-card-find-submit"
        >
          {searching ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          className={`${BTN} self-end`}
          style={{ borderColor: T.line, color: T.ink, background: T.surface, ...FOCUS_STYLE }}
          onClick={() => controller.closeFind()}
          data-testid="online-card-find-cancel"
        >
          Cancel
        </button>
      </form>
      {find.status === "error" ? (
        <p role="alert" className="text-[13px]" style={{ color: T.warn }} data-testid="online-card-find-error">
          The search could not be made. Nothing was changed. {find.message}
        </p>
      ) : null}
      {find.status === "results" ? (
        find.candidates.length === 0 ? (
          <p className="text-[13px]" style={{ color: T.soft }} data-testid="online-card-find-empty">
            No one you can see matches “{find.query}”. Nothing was changed.
          </p>
        ) : (
          <>
            {find.cutAt !== null ? (
              <p className="text-[12.5px] font-medium" style={{ color: T.warn }} data-testid="online-card-find-cut">
                Showing {find.cutAt} of {find.total}. The person you mean may not be listed: add more of their name and search again.
              </p>
            ) : null}
            <p className="text-[12px]" style={{ color: T.soft }}>
              Check who it is before you connect. These are the contact points each person publishes to you; the platform does not mark them verified.
            </p>
            <ul className="flex flex-col gap-2" data-testid="online-card-candidates">
              {find.candidates.map((c) => (
                <li
                  key={c.principal}
                  className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border p-3"
                  style={{ borderColor: T.line, background: T.surface }}
                  data-testid="online-card-candidate"
                  data-principal={c.principal}
                >
                  <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                    <span className="break-words text-[14px] font-semibold" style={{ color: T.ink }}>
                      {c.name ?? "No name published to you"}
                    </span>
                    {c.cardRead === "unavailable" ? (
                      <span className="text-[12.5px]" style={{ color: T.warn }}>
                        Their contact points could not be read just now.
                      </span>
                    ) : c.contactPoints.length === 0 ? (
                      <span className="text-[12.5px]" style={{ color: T.soft }}>
                        They publish no contact point to you, so you cannot tell them from a namesake here.
                      </span>
                    ) : (
                      c.contactPoints.map((p, i) => (
                        <span key={`${p.predicate}-${i}`} className="break-all text-[13px]" style={{ color: T.soft }} data-testid="online-card-candidate-contact">
                          {p.value}
                        </span>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    className={`${BTN} self-center aria-disabled:opacity-50`}
                    style={{ borderColor: T.accent, background: T.accent, color: T.onAccent, ...FOCUS_STYLE }}
                    // While "Connecting…" the pressed button stays focusable (aria-disabled, the press ignored), as Search
                    // does. A `disabled` button drops the focus to the page in Chromium, outside the foot that hears Esc.
                    aria-disabled={connecting || undefined}
                    onClick={() => {
                      if (connecting) return;
                      void controller.confirmLink(c);
                    }}
                    aria-label={`Connect this record to ${c.name ?? "this person"}'s online card`}
                    data-testid="online-card-connect"
                  >
                    {state.busy?.act === "link" ? "Connecting…" : "This is them: connect"}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
      <p className="text-[12px]" style={{ color: T.soft }}>
        {W.noGrant}
      </p>
    </div>
  );
}

/** The first word of the card's name, as the card words it ("your card of Ada"); none when the card has no name. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * The foot of a one card with no online card connected.
 *
 * @param controller the card's online card controller (its Find and its link write)
 * @param state the controller's state (`useOnlineCardState`)
 * @param searchName the card's own name: the foot's words, and what the search opens with
 * @param canWrite may the holder write this record? A reader sees the words and no Find.
 */
export function NoOnlineCardFoot({
  controller,
  state,
  searchName,
  canWrite,
}: {
  controller: OnlineCardController;
  state: OnlineCardState;
  searchName: string;
  canWrite: boolean;
}) {
  const first = firstName(searchName);
  // A reader may see the record but it is not her card, and she is not the only one who sees it.
  const words =
    state.link.state === "ambiguous"
      ? "This record carries more than one link, so no online card is chosen."
      : canWrite
        ? `This is your card${first ? ` of ${first}` : ""}. Only you see it. No online card is connected.`
        : "No online card is connected.";
  const finding = canWrite && state.find.status !== "closed";
  const footRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // When the search closes (Cancel, Esc), the focus goes back to the button that opened it, not to the page.
  const wasFinding = useRef(finding);
  useLayoutEffect(() => {
    if (wasFinding.current && !finding) findRef.current?.focus();
    wasFinding.current = finding;
  }, [finding]);
  // The focus can still reach the page while the Find is open: a ⌘K palette closing puts it there, and a browser
  // without press-to-focus may too. Esc pressed with the focus on the page then closes the Find. Heard first (capture) and stopped there,
  // so the phone's Detail drawer (`Overlay`, on the document) and the card's edit mode do not take the same key. A dialog open over the
  // card (the palette, a sheet) owns its Esc, so the Find leaves it alone. A closed dialog that stays in the page (the section menu's
  // panel is always there, `inert` and `aria-hidden`) owns nothing.
  useEffect(() => {
    if (!finding) return;
    const onKey = (e: KeyboardEvent) => {
      if (modalIsOpen() && !eventTargetInTopDialog(e.target)) return;
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const at = document.activeElement;
      if (at && at !== document.body && at !== document.documentElement) return;
      const foot = footRef.current;
      const open = Array.from(document.querySelectorAll('[aria-modal="true"]')).filter((m) => !m.closest('[inert], [aria-hidden="true"]'));
      if (open.some((m) => !foot || !m.contains(foot))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      controller.closeFind();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [finding, controller]);
  // A failed Connect is said HERE, beside the Find where it was pressed, and the focus moves to it so it is announced.
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);
  return (
    <div
      ref={footRef}
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-dashed pt-2.5 text-[12.5px] outline-none"
      style={{ borderColor: T.line, color: T.soft }}
      data-testid="one-card-find-foot"
      data-link={state.link.state}
      // While the Find is open the foot is focusable (not in the Tab order), so a mouse press on its words, a
      // candidate's contact point, the search error or blank space keeps the focus in the foot. Without it Chromium puts the focus on
      // the page, outside the handler below. Closed, the foot is plain text again.
      tabIndex={finding ? -1 : undefined}
      // Esc closes the Find as Cancel does, from wherever the focus is in the foot: the panel, the foot's alert
      // after a failed Connect, a busy button, or the foot itself after a press. Focus on the page is heard by the effect above.
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !finding) return;
        e.preventDefault();
        e.stopPropagation();
        controller.closeFind();
      }}
    >
      <span className="inline-flex" aria-hidden="true">
        <GlobeIcon />
      </span>
      <p className="m-0 min-w-0 flex-1 basis-56">{words}</p>
      {canWrite && !finding ? (
        <button
          ref={findRef}
          type="button"
          className={BTN}
          style={{ borderColor: T.accent, color: T.accentInk, background: T.surface, ...FOCUS_STYLE }}
          onClick={() => controller.openFind(searchName)}
          data-testid="online-card-find-open"
        >
          <GlobeIcon />
          {W.findTitle}
        </button>
      ) : null}
      {state.error ? (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="m-0 w-full basis-full text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          // The warn colour mixed with the ink, as the both-kept line: plain --warn on the card measured 4.18:1 (light) on the rig.
          style={{ color: "color-mix(in srgb, var(--warn,#9a6a1e) 55%, var(--ink,#2a2622))", ...FOCUS_STYLE }}
          data-testid="one-card-find-error"
        >
          Their online card could not be connected. Nothing was changed. {state.error}
        </p>
      ) : null}
      {finding ? <FindPanel controller={controller} state={state} /> : null}
    </div>
  );
}
