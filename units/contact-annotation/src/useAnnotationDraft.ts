// The state machine of ONE holder-only annotation field (My Note, or Where / How we met): what the server holds, what the person typed, when it
// reaches the vault, and whether it got there (debounce, blur, page-hide flush). It is the same machine as the MyNet app's, with the transport of
// `./contactAnnotation` (the same route, asked at the node that holds the card's vault) and every call naming the card's VAULT (`vaultId`): a card
// may be a record in any vault the holder may write. `memberPrincipal` is the held party: here the record's address.
// WHAT THE PERSON TYPED REACHES THE VAULT WITHOUT THEM DOING ANYTHING ELSE.
//
// ── The measured defect this hook exists to end ───────────────────────────────────────────
// The holder's report: *"Opening a connection record and adding my info to it in 'My Note' and
// 'Where we met' the information added is not saved; make it save and survive a refresh."*
//
// Measured in a REAL Chromium against the shipped bundle, three gestures on the contact card:
//
//   type → tap somewhere else → reload            1 PUT   · the text is there      ✅
//   type → reload                                 0 PUTs  · the text is GONE       🔴
//   type note → tap origin → type origin → reload note kept · origin GONE          🔴
//
// ⇒ The cause is exact and is ⛔ not the wire, ⛔ not the vault and ⛔ not authorization: both
// fields persisted **only** from the DOM `blur` event. Nothing wrote while typing, nothing
// wrote when the document went away, and nothing on screen ever said whether the text had
// left the browser. A person who typed and refreshed had never issued a request at all.
//
// ⚠ THE BLUR PATH WAS NEVER BROKEN, and that is why it survived review and a green suite.
// Every existing test blurs before asserting, so every one of them passed against a build
// that lost data on the gesture the holder actually made. A test that cannot fail is not evidence.
//
// ── Why the remedy is three nets and not one ─────────────────────────────────────────────
//   1. DEBOUNCE while typing — covers "typed, then wandered off / closed the laptop".
//   2. BLUR, immediately — unchanged, still the fastest path, still exact.
//   3. PAGE-HIDE / UNMOUNT flush with `keepalive` — covers the sub-debounce window, which is
//      precisely the holder's gesture: the last keystroke and the refresh inside the same second.
// ⛔ None of the three is redundant: remove (1) and a closed laptop loses the text; remove
// (3) and the holder's own measured gesture loses it again. (2) is kept because it is instant and
// because every shipped test depends on it.
//
// ⛔ NOT a Save button. These are open fields you tap and write into — *"can they
// just be open fields, [tap and] write"*. A Save control puts
// back the extra tap he had just removed. The save is made reliable instead of manual.
//
// ⚠ A device-local draft store was considered and REFUSED: it would make the browser the
// data of record for prose that has no vault copy, which fails
// the rule that the vault, not the browser, is the data of record: it fails the cache-vs-store test on part 2 (derived-only
// writes). The remedy is to write to the vault sooner, ⛔ never to hold it locally longer.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnnotationError,
  AnnotationVaultMismatchError,
  NOTES_VAULT_UNTIED_COPY,
  loadHolderAnnotations,
  saveHolderAnnotations,
  type AnnotationLoad,
  type AnnotationValue,
} from "./contactAnnotation";

/**
 * Quiet-typing delay before the draft is written to the vault, in ms.
 *
 * ⚠ Chosen against WRITE AMPLIFICATION, not against feel: every save is a real vault ingest
 * (a new datom set + version), so per-keystroke writing would turn one 17-character origin
 * into 17 stored revisions. At 400 ms a normal sentence costs one or two writes — keystrokes
 * inside a word are far closer together than that.
 *
 * 🔴 IT WAS 800 ms AND WAS HALVED ON A MEASUREMENT, ⛔ not on taste. The page-hide flush
 * behind it is BEST EFFORT by construction — before a request is even issued it must await
 * the vault id, `ensureVaultPlacement` (a full extra round trip for any vault the identity node
 * holds — `lws.ts:441`), and an async DPoP signature. A document being torn down does not
 * reliably survive three hops: at 800 ms the browser probe lost the write about one run in
 * three. ⇒ THIS INTERVAL, ⛔ not the flush, is what makes the ordinary gesture safe; the
 * flush is the backstop for the pathological one.
 */
export const ANNOTATION_AUTOSAVE_MS = 400;

/**
 * What the SERVER is known to hold for this field.
 *
 * ⚠ `empty` and `ready` deliberately render the SAME writable control —
 * the distinction survives because it reports something true and checkable and surfaces as
 * `data-state`. ⛔ A reader who makes them render differently is re-adding the
 * click-to-reveal step that was removed.
 */
export type AnnotationSurface =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; text: string };

/**
 * Whether the text on screen has reached the vault.
 *
 * 🔴 THIS IS THE HONEST HALF OF THE FIX AND IT IS ⛔ NOT COSMETIC. The defect above shipped
 * unseen for two days because a save that never happened looked exactly like a save that
 * did. `pending` and `saving` are the states that were previously invisible; a person who
 * can see them can tell that leaving now is early.
 */
export type AnnotationSaveState = "idle" | "pending" | "saving" | "saved" | "error";

export interface UseAnnotationDraftOptions {
  /** The held party this annotation is about. Keys the record — ⛔ never a placement. In the app: the record's address. */
  memberPrincipal: string;
  /** The vault the card's record is held in; the route is asked at the node that holds it and told it. */
  vaultId: string;
  /** Which of the two holder-only fields this draft writes. */
  field: "note" | "origin";
  /** What to say when the READ fails. A failed read is named, ⛔ never rendered as empty. */
  loadErrorCopy: string;
  /** When set, the parent already loaded both surfaces — skip this hook's own GET. */
  initialText?: string | null;
  initialLoad?: AnnotationLoad;
  /** Prefill from the connect `?msg=` link. Persisted like anything else the person types. */
  seedText?: string | null;
  /**
   * Called with the new value each time a write LANDS (never on a scheduled or failed one).
   *
   * 🔴 A derived view must be refetched or told — the contact
   * card holds a SNAPSHOT of both annotations, taken once when the card opened, and the
   * shell header paints "Where/How we met" from it. Without this the header keeps showing
   * the pre-edit value (or nothing) until a reload, while the field two rows below shows the
   * new one — one screen disagreeing with itself about the same fact. ⛔ The remedy is ⛔ not
   * a refetch: the writer already knows the landed value, and re-reading would cost a round
   * trip per keystroke-pause.
   */
  onSaved?: (text: string | null) => void;
}

export interface UseAnnotationDraft {
  surface: AnnotationSurface;
  /**
   * 🔴 Live values of this field that this control is ⛔ NOT editing — another app's writing
   * of the same typed fact on the same vault.
   *
   * The holder's ruling: if there are two values, show both. The editor owns the newest one;
   * the rest are shown read-only rather than dropped. ⛔ Never dedupe or hide them: the whole
   * purpose of type-anchoring is that an uncoordinated app's value is legible here
   * (type-anchoring), and silently rendering only our own
   * re-privatises the vault.
   *
   * ⚠ Empty in normal use today — the MyNet app is currently the only other writer. It is ⛔ not speculative
   * chrome: the read now returns them, so not rendering them would be dropping data we hold.
   */
  others: AnnotationValue[];
  /** The text in the control. Controlled input — the caller renders this, ⛔ not `surface`. */
  draft: string;
  save: AnnotationSaveState;
  saveError: string | null;
  /** Wire to `onChange`. Schedules the debounced write. */
  onChange: (next: string) => void;
  /** Wire to `onBlur`. Cancels the debounce and writes now. */
  onBlur: () => void;
  /** Re-read from the vault. Wire to the error surface's "Try again". */
  reload: () => Promise<void>;
}

/**
 * Owns one holder-only annotation field end to end: what the server holds, what the person
 * has typed, when that reaches the vault, and whether it got there.
 *
 * Both `ContactNote` and `ConnectionOriginField` bind this. They previously carried two
 * hand-written copies of the same state machine that had already drifted apart — one
 * comparing against a server-truth ref, the other against its own render state, with a
 * comment on each explaining why it differed from the other. One copy is the fix for that
 * too (two halves of one thing must agree).
 *
 * @param options see {@link UseAnnotationDraftOptions}
 * @returns the surface to render, the controlled value, the save state, and the two
 *   handlers to wire to the control — see {@link UseAnnotationDraft}
 *
 * Preconditions: the person is signed in; `memberPrincipal` is a server-resolved principal
 *   URI, ⛔ never a raw pasted WebID.
 * Errors: a failed READ becomes `surface.kind === "error"` carrying `loadErrorCopy`; a
 *   failed WRITE becomes `save === "error"` plus `saveError`. Neither is ever rendered as
 *   an empty field (absence is not truth).
 */
export function useAnnotationDraft({
  memberPrincipal,
  vaultId,
  field,
  loadErrorCopy,
  initialText,
  initialLoad,
  seedText,
  onSaved,
}: UseAnnotationDraftOptions): UseAnnotationDraft {
  const seed = seedText?.trim() || null;

  /**
   * 🔴 WHAT THE SERVER IS KNOWN TO HOLD — `null` means "we do not know yet".
   *
   * ⚠ THIS IS A REF AND ⛔ NOT THE SURFACE, and the reason is measured. An earlier no-op
   * guard compared the draft against `surface.text`, calling that "what the server holds".
   * It is not: {@link seedText} puts a value taken off the URL into the surface while the
   * server holds NOTHING, so the guard saw draft === surface.text, concluded "no change",
   * and suppressed a real write.
   *
   * ⇒ this is only ever assigned from a server answer or from a write that landed. While it
   * is `null` the guard does ⛔ NOT fire: not knowing is not knowing it is unchanged, and
   * the safe direction when we do not know is to write.
   */
  const serverText = useRef<string | null>(
    initialLoad === "ok" ? (initialText ?? "") : initialLoad === "empty" ? "" : null,
  );

  const [surface, setSurface] = useState<AnnotationSurface>(() => {
    if (initialLoad === "error") return { kind: "error", message: loadErrorCopy };
    if (seed) return { kind: "ready", text: seed };
    if (initialLoad === "empty") return { kind: "empty" };
    if (initialLoad === "ok") return { kind: "ready", text: initialText ?? "" };
    return { kind: "loading" };
  });
  const [draft, setDraft] = useState(seed ?? initialText ?? "");
  const [save, setSave] = useState<AnnotationSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [others, setOthers] = useState<AnnotationValue[]>([]);

  /**
   * The latest draft, readable from a handler that did ⛔ not re-subscribe.
   *
   * ⚠ Load-bearing for the page-hide flush: that listener is registered ONCE (re-registering
   * it per keystroke is how a `pagehide` handler ends up missing during the one render it
   * matters), so it cannot close over `draft` and must read it here.
   */
  const draftRef = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ⛔ Never setState after unmount — the page-hide flush deliberately outlives the tree. */
  const mounted = useRef(true);
  /**
   * The exact text a write is currently carrying, or `null`.
   *
   * ⚠ MEASURED, ⛔ not defensive. A page reload fires `visibilitychange → hidden` AND
   * `pagehide`, so both nets flush the same text; the {@link serverText} guard cannot stop
   * the second because the first has not answered yet. Measured in Chromium: one refresh,
   * two identical PUTs. They are idempotent — the entity id is a hash of
   * (kind, holder, heldParty) — so ⛔ nothing was corrupted, but a document being torn down
   * has a small budget of requests and spending it twice on the same bytes is how the third
   * field's write gets dropped.
   */
  const inFlight = useRef<string | null>(null);
  /**
   * ⚠ Held in a ref so a caller may pass an inline arrow without re-creating {@link persist}
   * — which would re-register the page-hide listener on every parent render, and a listener
   * torn down and re-added during the tick the person hit reload in is a listener that was
   * not there.
   */
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /**
   * Write `next` to the vault, unless the server already holds exactly that.
   *
   * @param next the text to store; `""` clears the prose
   * @param keepalive true when the document is going away — asks the browser to let the
   *   request outlive it. ⚠ Best effort by construction: the credential is minted
   *   asynchronously, so a browser that tears the page down first still drops it. That is
   *   why the debounce exists and is the primary net, ⛔ not this.
   */
  const persist = useCallback(
    async (next: string, keepalive = false) => {
      clearTimer();
      const trimmed = next.trim();
      const stored = serverText.current;
      // 🔴 The no-op guard. Both fields are open textareas the person can tab straight
      // through, so without this, moving focus across a contact card would PUT an empty
      // annotation to the vault on every pass. ⛔ A write nobody asked for is not harmless.
      if (stored !== null && trimmed === stored.trim()) return;
      // 🔴 ⛔ NEVER CLEAR WHAT WE HAVE NOT READ, AND THIS IS THE GUARD THE WHOLE FLUSH RESTS ON.
      // `stored === null` is "we do not know what the server holds" — a failed or unfinished
      // read. Writing an empty string into that is the one move that can only ever destroy: if
      // the vault held prose it is gone, and if it held nothing the write bought nothing. It is
      // reachable on the most ordinary gesture there is — open a card, tap back before the
      // read lands — because the flush fires on unmount.
      // ⇒ ⛔ Do not "simplify" this into the guard above: that one is about a NO-OP, this one
      // is about a RETRACTION. Deleting it manufactures a live
      // instance of "stored state destroyed without the holder's act" out of a durability fix.
      //
      // ⚠ A SECOND GUARD STOOD HERE AND WAS REMOVED ON A MEASUREMENT, ⛔ not on taste. It was
      // a `touched` ref — "never flush text a person did not type" — and it read as the more
      // principled of the two. Mutation testing showed the pair MASKED EACH OTHER: delete
      // either one alone and all six unit tests stayed green, because every state `touched`
      // refused was a state this line already refused. Two guards, one reachable set, and
      // neither test able to fail ⇒ the redundant one was deleted so the surviving one is
      // actually measured.
      if (stored === null && trimmed.length === 0) return;
      // ⛔ Do not send the same bytes twice — see {@link inFlight}.
      if (inFlight.current === next) return;
      inFlight.current = next;
      if (mounted.current) {
        setSave("saving");
        setSaveError(null);
      }
      try {
        await saveHolderAnnotations({
          heldParty: memberPrincipal,
          vaultId,
          [field]: next,
          keepalive,
        });
        // The write landed ⇒ this IS now what the server holds.
        serverText.current = next;
        inFlight.current = null;
        // ⚠ Fires even when the component is gone: the page-hide flush is exactly when the
        // parent most needs the landed value, and the callback is a plain report.
        onSavedRef.current?.(trimmed.length === 0 ? null : next);
        if (!mounted.current) return;
        setSave("saved");
        setSurface(trimmed.length === 0 ? { kind: "empty" } : { kind: "ready", text: next });
      } catch (e) {
        // ⛔ Released on failure: a refused write must stay retryable, by blur or by the
        // next keystroke. Holding the marker would silently swallow every retry.
        inFlight.current = null;
        if (!mounted.current) return;
        setSave("error");
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    },
    [field, memberPrincipal, vaultId],
  );

  const reload = useCallback(async () => {
    clearTimer();
    setSurface({ kind: "loading" });
    setSave("idle");
    setSaveError(null);
    try {
      const got = await loadHolderAnnotations(memberPrincipal, vaultId);
      const load = field === "note" ? got.noteLoad : got.originLoad;
      const all = field === "note" ? got.notes : got.origins;
      const text = field === "note" ? got.note : got.origin;
      // Everything past the newest is another writer's — surfaced, ⛔ never dropped.
      setOthers(all.slice(1));
      if (load === "error") {
        serverText.current = null; // ⛔ a failed read is not "empty"
        setSurface({ kind: "error", message: loadErrorCopy });
        return;
      }
      if (!text) {
        serverText.current = "";
        setDraft("");
        draftRef.current = "";
        setSurface({ kind: "empty" });
        return;
      }
      serverText.current = text;
      setDraft(text);
      draftRef.current = text;
      setSurface({ kind: "ready", text });
    } catch (e) {
      // A failed read tells us nothing — ⛔ never assume "empty", and never guess a guard.
      serverText.current = null;
      const msg =
        e instanceof AnnotationVaultMismatchError
          ? NOTES_VAULT_UNTIED_COPY // the read could not be tied to this card's vault: said as it is, no box
          : e instanceof AnnotationError
          ? loadErrorCopy
          : e instanceof Error
            ? e.message
            : String(e);
      setSurface({ kind: "error", message: msg });
    }
  }, [field, loadErrorCopy, memberPrincipal, vaultId]);

  useEffect(() => {
    if (initialLoad) return;
    void reload();
  }, [initialLoad, reload]);

  // One-shot seed from the connect `?msg=` link.
  //
  // ⚠ MEASURED 2026-08-31: on the only shape any call site produces (`seedText` with no
  // `initialLoad`), this seed does ⛔ NOT survive — `reload()` lands underneath it and
  // `setDraft("")` clears it before any net fires. That is a known, pre-existing residual,
  // ⛔ untouched here and ⛔ not fixed by this increment. It is left visible rather than
  // papered over; the fix is a decision about whether a server "empty" may overwrite an
  // unsaved draft, and that is a different cause.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seed || seeded.current) return;
    seeded.current = true;
    setDraft(seed);
    draftRef.current = seed;
    setSurface({ kind: "ready", text: seed });
  }, [seed]);

  /**
   * 🔴 NET 3 — the document is going away and there is unsaved text.
   *
   * ⚠ `pagehide` is the event that fires on a RELOAD, on a back-navigation and on an iOS
   * tab switch; `beforeunload` is ⛔ not used (it is ignored on iOS Safari in exactly the
   * case the holder hits) and `visibilitychange` is added because iOS backgrounds an app without
   * always firing `pagehide` first. Both are cheap and idempotent — the no-op guard inside
   * {@link persist} means a duplicate flush issues no request.
   *
   * ⛔ Registered ONCE. A listener re-registered on every keystroke has been removed and
   * re-added during the tick the person hit reload in.
   */
  useEffect(() => {
    mounted.current = true;
    const flush = () => {
      const pending = draftRef.current;
      const stored = serverText.current;
      if (stored !== null && pending.trim() === stored.trim()) return;
      void persist(pending, true);
    };
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // 🔴 `mounted` goes false BEFORE the flush, ⛔ not after. The flush is deliberately
      // fire-and-forget past this point, so its resolution must not reach setState.
      mounted.current = false;
      // Leaving the card is the same act as leaving the page, for this field: removing a
      // focused element does not reliably emit `focusout`, so blur cannot be relied on here.
      flush();
      clearTimer();
    };
  }, [persist]);

  /** NET 1 — quiet typing. */
  const onChange = useCallback(
    (next: string) => {
      setDraft(next);
      draftRef.current = next;
      const stored = serverText.current;
      const unchanged = stored !== null && next.trim() === stored.trim();
      setSave(unchanged ? "idle" : "pending");
      setSaveError(null);
      clearTimer();
      if (unchanged) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        void persist(draftRef.current);
      }, ANNOTATION_AUTOSAVE_MS);
    },
    [persist],
  );

  /** NET 2 — the person moved on. Write now rather than after the debounce. */
  const onBlur = useCallback(() => {
    void persist(draftRef.current);
  }, [persist]);

  return { surface, draft, others, save, saveError, onChange, onBlur, reload };
}
