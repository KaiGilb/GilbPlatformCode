/**
 * The words an online card's fields are shown with, and the one fact key the card keeps to itself.
 *
 * ⛔ No label is typed in this app: a field's label is the person card's own field-set label for it (the master's), else the master's
 * `a:label` of the term, asked once; only while neither has answered is the predicate's own name shown.
 */
import { useCallback, useRef, useState } from "react";
import { attributeLabel } from "@kaigilb/gilbplatformcode-term-slots";

/** The record fact that holds the link. The card manages it (Link / Unlink): it is not an editable "extra" fact and not drawn as one. */
export const ONLINE_CARD_LINK_KEY = "sameAs";

export function isOnlineCardLinkKey(slug: string): boolean {
  return slug === ONLINE_CARD_LINK_KEY || slug === `a:${ONLINE_CARD_LINK_KEY}`;
}

const bareOf = (predicate: string): string => predicate.replace(/^a:/, "");

/** The field-set label for a predicate, or "". Pure. */
export function onlineCardLabelFor(fields: ReadonlyArray<{ label: string | null; factKeys: readonly string[] }>, predicate: string): string {
  const b = bareOf(predicate);
  return fields.find((f) => f.factKeys.includes(b) && f.label)?.label ?? "";
}

/** `labelFor` for the frame: the field set's label, else the master's label of the term (asked once, the frame redraws when it lands). */
export function useOnlineCardLabelFor(fields: ReadonlyArray<{ label: string | null; factKeys: readonly string[] }>): (predicate: string) => string {
  const [, bump] = useState(0);
  const asked = useRef(new Map<string, string | null>());
  return useCallback(
    (predicate: string) => {
      const own = onlineCardLabelFor(fields, predicate);
      if (own) return own;
      const b = bareOf(predicate);
      if (!asked.current.has(b)) {
        asked.current.set(b, null);
        void attributeLabel(b)
          .then((l) => {
            if (l) {
              asked.current.set(b, l);
              bump((v) => v + 1);
            }
          })
          .catch(() => undefined);
      }
      return asked.current.get(b) ?? "";
    },
    [fields],
  );
}
