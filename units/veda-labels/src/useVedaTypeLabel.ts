// The ONE React seam for "what does the ontology call this type?".
//
// The ontology's ruling: the UI must display the term's own `a:label`, resolved from the live master. A local registry may
// cache that label; it may never disagree with it. A grid row, a detail chip and a detail row once gave three different answers
// for one record; this hook is the right one (ontology label, then the registry, then the tail), extracted so every surface holds
// it without a copy of the effect.
//
// ⚠ It is an OVERLAY, never a gate. The registry stays the floor and the answer is synchronous
// from the first paint; the live label replaces it only if the master actually serves one. A
// vault or master that cannot be reached leaves the floor standing — ⛔ a label lookup may never
// make a row unreadable. `fetchTermLabel` already memoizes per type name, so a grid of N rows
// over K distinct types makes at most K requests, once per session.

import { useEffect, useState } from "react";

/** The bare term name a type URI or CURIE names (`https://…/base/t/Person` / `t:Person` → `Person`). */
function bareTermName(typeUri: string | null | undefined): string | null {
  if (!typeUri) return null;
  const n = typeUri.includes("/")
    ? typeUri.slice(typeUri.lastIndexOf("/") + 1)
    : typeUri.replace(/^t:/, "");
  return n.trim() || null;
}

/**
 * The live `a:label` for a record's type, or `null` until (or unless) the master answers.
 *
 * @param typeUri the record's own stored type — a URI or a `t:` CURIE, exactly as the vault served it
 * @returns the ontology's label, or null. ⛔ Callers must keep their own floor: `veda ?? spec?.label ?? tail`.
 */
export function useVedaTypeLabel(typeUri: string | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const name = bareTermName(typeUri);
    if (!name) {
      setLabel(null);
      return;
    }
    let live = true;
    // Dynamic import for the same reason RecordDetail already uses one: the label overlay is not
    // on the first-paint path and must not pull the vocabulary client into the grid's bundle.
    void import("./vedaLabels").then(({ fetchTermLabel }) =>
      fetchTermLabel(name).then((l) => {
        if (live && l) setLabel(l);
      }),
    );
    return () => {
      live = false;
    };
  }, [typeUri]);

  return label;
}
