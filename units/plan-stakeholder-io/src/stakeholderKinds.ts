// The stakeholder type set, as the Plan card reads it: through the one shared kind reader of the master (`stakeholder-kinds`), kept by the page's query
// cache. No kind is named here; the set is the master's answer to which types may play the Stakeholder role.

import { KIND_SET_MAX_AGE_MS, createStakeholderKindReader, kindLabelOf, stakeholderKindReader, type StakeholderKindReader, type StakeholderKindSet } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import type { StakeholderTypeSet } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterSource, type TermFetch } from "@kaigilb/gilbplatformcode-vocabulary-source";

export function stakeholderTypeSetQueryKey() {
  return ["gilb-stakeholders", "type-set", termOrigin()] as const;
}

/**
 * The kind reader this page uses for the master.
 *
 * @param fetchImpl a fetch of its own (a test or an agent run): a memory-only reader over it, made for this call, keeping nothing
 *   and checking nothing in the background. Without it: THE page's shared reader (`stakeholderKindReader`), kept on this device.
 * @returns the reader
 */
export function masterKindReader(fetchImpl?: TermFetch): StakeholderKindReader {
  if (!fetchImpl) return stakeholderKindReader({ vedaOrigin: termOrigin() });
  return createStakeholderKindReader({
    source: masterSource({ vedaOrigin: termOrigin(), fetchImpl }),
    origin: termOrigin(),
    store: null,
    defer: () => {},
  });
}

/**
 * The list's form of the reader's set.
 *
 * @param set the kind set as the reader answered it
 * @returns the names, how complete, and each type with its word
 */
export function toStakeholderTypeSet(set: StakeholderKindSet): StakeholderTypeSet {
  const names: string[] = [];
  for (const n of set.names) if (n && !names.includes(n)) names.push(n);
  const types: StakeholderTypeSet["types"] = [];
  for (const t of set.types) {
    if (!t.name || types.some((x) => x.name === t.name)) continue;
    types.push({ term: t.term, name: t.name, label: t.label, parents: [...(t.parents ?? [])] });
  }
  return { names, complete: set.complete, types };
}

/** The one set of React Query options for the type set: the nav's read and its press share it, so
 *  the two cannot drift. Stale after the reader's own max age, so a refocus asks the reader
 *  again (it answers from memory and checks the master in the background); a kind found by such a check also reaches the cache at
 *  once through `subscribeStakeholderTypeSet`. Never retried silently, so a failure shows on the entry at once.
 *  `queryKey` is read each time the options are used: the term origin is set at start-up, after this module loads. */
export const STAKEHOLDER_TYPE_SET_QUERY = {
  get queryKey() {
    return stakeholderTypeSetQueryKey();
  },
  queryFn: () => readStakeholderTypeSet(),
  staleTime: KIND_SET_MAX_AGE_MS,
  retry: false,
} as const;

/**
 * Keep the cached type set in step with the reader: each time a background check finds the master's answer changed, the new set
 * is written into the query cache, so a new kind is drawn within the session.
 *
 * @param setTypeSet writes the set where the page keeps it (`qc.setQueryData(stakeholderTypeSetQueryKey(), …)`)
 * @param reader the reader to follow (the page's shared one by default)
 * @returns the unsubscribe
 */
export function subscribeStakeholderTypeSet(
  setTypeSet: (set: StakeholderTypeSet) => void,
  reader: StakeholderKindReader = masterKindReader(),
): () => void {
  return reader.subscribe((set) => setTypeSet(toStakeholderTypeSet(set)));
}

/**
 * The master's word for a row's type, from the type set (the package's `kindLabelOf`: any spelling of the type, never throws).
 *
 * @param set the type set, or undefined while it is read
 * @param type the row's type, in any spelling
 * @returns the word, or null when the set does not know it
 */
export function kindWordOf(set: StakeholderTypeSet | null | undefined, type: string | null | undefined): string | null {
  // `kindLabelOf` reads only each type's `name` and `label`, which this set keeps as the reader served them.
  return kindLabelOf(set ? { types: set.types as StakeholderKindSet["types"] } : null, type);
}

/** Read the set from the master through the kind reader. Throws the package's `VocabularyUnavailableError` on any failure,
 *  including a role with no players — ⛔ never an empty set, which would look like a person who has recorded no one. */
export async function readStakeholderTypeSet(fetchImpl?: TermFetch): Promise<StakeholderTypeSet> {
  return toStakeholderTypeSet(await masterKindReader(fetchImpl).get());
}
