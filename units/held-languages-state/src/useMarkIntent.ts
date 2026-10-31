/**
 * Cycle214 s8 (fix round: Agent.Scaling Languages Delta1 F2) — "Languages": the contact mark as an INTENT, so acts
 * that overlap leave the mark the person last chose. React-lite.
 *
 * Why: an act on a language (a rung, a removal) takes a round trip, and it decided what to do with the mark from
 * the value it had at the CLICK. Two clicks inside one round trip then left the wrong mark: narrowing the marked
 * entry's rung while marking another brought the OLD mark back; removing the marked entry while marking another
 * wiped the NEW one.
 *
 * The rule (decided at the END of an act, from the mark as it is THEN): an act that finishes touches the mark only
 * when the mark is still the tag that act's entry put on it (`ownsMark`). The mark itself is one write each time
 * (the profile's own commit queue / the record's own save, in the order asked), so the LAST intent wins and there
 * is never a second mark.
 */
import { useMemo, useRef } from "react";

/** The contact language as stored, or as the last act asked it to be. */
export interface MarkValue {
  /** The BCP-47 tag ("" for none). */
  tag: string;
  /** Its rung where the card has rungs; null where it has none. */
  access: string | null;
}

export interface MarkIntent {
  /** The latest value: what the last act asked for, or, when nothing was asked since, what is stored. */
  current: () => MarkValue;
  /** Record what an act asks the mark to become, AT ONCE (every act that finishes meanwhile sees it). */
  set: (next: MarkValue) => void;
  /** Remember which tag this entry put on the mark (so an act on it, started before it was marked, still knows it). */
  put: (language: string, tag: string) => void;
  /** The tag this entry last put on the mark, if any. */
  putBy: (language: string) => string | null;
}

/**
 * Does the mark still belong to the entry that was marked when its act began? `owned` = the tag the entry's
 * mark carried then (null: it was not marked). Pure.
 */
export function ownsMark(owned: string | null | undefined, current: MarkValue): boolean {
  const o = (owned ?? "").trim().toLowerCase();
  return o !== "" && current.tag.trim().toLowerCase() === o;
}

/** @param stored what the store holds now (re-read at every render). */
export function useMarkIntent(stored: MarkValue): MarkIntent {
  const intent = useRef<MarkValue>(stored);
  const seen = useRef<MarkValue>(stored);
  // The store showed something new that no act of ours asked for (another tab, a reload): that is the mark now.
  if (seen.current.tag !== stored.tag || seen.current.access !== stored.access) {
    seen.current = stored;
    intent.current = stored;
  }
  const puts = useRef(new Map<string, string>());
  return useMemo<MarkIntent>(
    () => ({
      current: () => intent.current,
      set: (next) => {
        intent.current = next;
      },
      put: (language, tag) => void puts.current.set(language, tag),
      putBy: (language) => puts.current.get(language) ?? null,
    }),
    [],
  );
}
