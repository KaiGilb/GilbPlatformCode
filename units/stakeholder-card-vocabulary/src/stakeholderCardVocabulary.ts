// Reads the vocabulary the Stakeholder card needs from the ontology master, once per app session: the stakeholder kinds, their
// field sets and the reference rules, as plain functions and as query options a page can share. No kind and no field is named
// here; they are the master's answers. The ontology origin is not a literal: it is `termOrigin()`, read each time it is needed.

import { KIND_SET_MAX_AGE_MS, createStakeholderKindReader, kindDescendants, type StakeholderKindReader } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { resolveFieldSets, type StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readReferenceVocabulary } from "@kaigilb/gilbplatformcode-holder-reference";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { VocabularyUnavailableError, masterSource, type TermFetch, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";

/**
 * What the host answers for the card vocabulary's query options. Each member replaces one expression of the app.
 */
export interface CardVocabularyHost {
  /**
   * The kind reader this page uses for the master. Replaces `masterKindReader(fetchImpl ? masterFetch(fetchImpl) : undefined)`
   * (GilbApp `src/lib/base/stakeholderCard.ts` line 198, calling `stakeholderKinds.ts` line 68 `masterKindReader`): with a fetch of its own,
   * a memory-only reader over it; without, the page's shared reader.
   */
  masterKindReader(fetchImpl?: TermFetch): StakeholderKindReader;
  /**
   * Whether the last reading is kept on this device and shown at once on the next load. Optional: a host without it persists.
   * Replaces `import.meta.env?.MODE !== "test"` (GilbApp `src/lib/base/stakeholderCard.ts` line 168), asked each time the copy is
   * read or stored.
   */
  persistVocabulary?(): boolean;
}

// ── The host fetch the package is handed ──────────────────────────────────────────────

/**
 * The fetch the host hands the package for master reads: the browser's own, with the request init
 * PASSED ON. The package asks for `cache: "no-cache"` on every read; a wrapper
 * that dropped `init` would let the browser answer a reload from its own cache for up to an hour
 * (the master serves `public, max-age=3600`), and a field added on the master would not show.
 */
export function masterFetch(inner: TermFetch = (url, init) => fetch(url, init)): TermFetch {
  return (url, init) => inner(url, init);
}

/**
 * Page size of the card's carrier read (`/base/vocab?status=all&carries=a:fieldOf&limit=…`).
 *
 * The package's default is 100, and the master held 320 carriers of `a:fieldOf` on
 * 2026-10-22, so every app session paid 4 dependent requests for one list.
 * At 400 it is one request; past 400 carriers the package still follows `next`, so nothing is
 * cut off. The master accepts up to 2,000 (GilbPlatform `VOCAB_PAGE_MAX`).
 * ⚠ The cost moves to a master WITHOUT the carrier selector: it answers this read with up to this
 * many nodes of the whole listing before the package refuses it ("not known yet"). Production
 * has the selector.
 */
export const CARD_CARRIER_PAGE_SIZE = 400;

/** The master as the package reads it, through `masterFetch`, its carriers in one page (`CARD_CARRIER_PAGE_SIZE`). */
export function cardMasterSource(fetchImpl?: TermFetch): VocabularySource {
  return masterSource({ vedaOrigin: termOrigin(), fetchImpl: masterFetch(fetchImpl), carrierPageSize: CARD_CARRIER_PAGE_SIZE });
}

// ── The session reading ───────────────────────────────────────────────────────────────

/** What a card needs from the master, read once per app session. */
export interface StakeholderCardVocabulary {
  /** Bare names of every stakeholder kind, in served order. */
  kindNames: string[];
  kindsComplete: boolean;
  /** The field sets, or `null` when the package refused: see `fieldSetsRefusal`. */
  fieldSets: StakeholderFieldSets | null;
  /** The package's own words when the field sets are not known yet. ⛔ Never "no fields". */
  fieldSetsRefusal: string | null;
  /** The master's `a:label` of the stakeholder role (`t/Stakeholder`): the word a screen uses for
   *  "a stakeholder". `null` when the master gave none or the read refused; `undefined` on a
   *  reading made before this field existed. ⛔ Never filled with a word typed into the app. */
  roleLabel?: string | null;
  /**
   * Create shortcuts: the New-record picker's shortcuts, the master's `a:createShortcut` on the role, in the master's order (`[]` when the master
   * carries none, or its term did not answer: the picker then lists every type alike). `undefined` on a reading made before this existed.
   * ⛔ Never filled with a typed list.
   */
  createShortcuts?: { term: string; name: string; label: string | null }[];
  /** For each shortcut (by type name): the types below it by is-a, nearest first, as the master gave them (the System step's choices). */
  shortcutSteps?: Record<string, { name: string; label: string | null; depth: number }[]>;
}

/**
 * Read the kinds, then the field sets from the same source. The kinds are read FIRST and on their
 * own, so that on a master without the carrier selector the card still knows that the record is a
 * stakeholder kind, and can say that its fields are not known yet. Any failure of the kinds read
 * rejects: a card then cannot tell a stakeholder kind from any other type, and says so.
 *
 * The kinds, their words and the role's own word come from the kind reader, ⛔ not
 * from a walk of this card's own. The page passes its shared reader (`masterKindReader()`), so a card opened after the list sends
 * no kind read at all (0 children listings), and the field sets are read on that set (`resolveFieldSets({ kindSet })`: no role,
 * no kind walk).
 *
 * @param source the master, for the field sets
 * @param kindReader the kind reader; without it a memory-only reader over `source`, for this call alone (a test or an agent run)
 */
export async function readStakeholderCardVocabulary(
  source: VocabularySource,
  kindReader: StakeholderKindReader = createStakeholderKindReader({ source, origin: termOrigin(), store: null, defer: () => {} }),
): Promise<StakeholderCardVocabulary> {
  const set = await kindReader.get();
  const kindNames: string[] = [];
  for (const n of set.names) if (n && !kindNames.includes(n)) kindNames.push(n);
  const picker = {
    createShortcuts: set.createShortcuts.map(({ term, name, label }) => ({ term, name, label })),
    shortcutSteps: Object.fromEntries(
      set.createShortcuts.map((sc) => [sc.name, kindDescendants(set, sc.term).map((d) => ({ name: d.name, label: d.label, depth: d.depth }))]),
    ),
  };
  // The role's word came with its players, in the same read: ⛔ no read of its own. Null when the role carries none.
  const roleLabel = set.roleLabel;
  try {
    const fieldSets = await resolveFieldSets(source, { kindSet: set });
    return { kindNames, kindsComplete: set.complete, fieldSets, fieldSetsRefusal: null, roleLabel, ...picker };
  } catch (err) {
    // The package's "not known yet" (`CarrierSelectorMissingError` among them) is an answer the
    // card shows. Anything else is a defect and is not dressed up as one.
    if (!(err instanceof VocabularyUnavailableError)) throw err;
    return { kindNames, kindsComplete: set.complete, fieldSetsRefusal: err.message, fieldSets: null, roleLabel, ...picker };
  }
}

export function stakeholderCardVocabularyQueryKey() {
  return ["gilb-stakeholders", "card-vocabulary", termOrigin()] as const;
}

/**
 * The one set of React Query options for the session reading. Held for the session: never stale,
 * never collected, never retried or re-read on a remount, a focus or a reconnect. A reload of the
 * app is a new session, and reads again.
 */
/**
 * The master's reading takes seconds on a cold load, and until it lands the card
 * does not know a person card. The LAST reading is kept on this device and shown at once as a
 * placeholder while the session's own read runs; the live reading replaces it the moment it lands
 * (the same last-known-good-first pattern as the photo term). Only a reading WITH
 * field sets is stored, so a refused read never becomes the next session's start.
 */
function cardVocabularyStoreKey(): string {
  return `gilbapp.cardVocabulary.v1.${termOrigin()}`;
}
/** The two functions below keep the device copy unless the host's `persistVocabulary` says no (a host turns it off under a test
 *  runner: a test's late read would otherwise seed the next test's card). Their `force` argument overrides it. */
export function readStoredCardVocabulary(
  force = false,
  storeKey = cardVocabularyStoreKey(),
  host?: Pick<CardVocabularyHost, "persistVocabulary">,
): StakeholderCardVocabulary | undefined {
  if (!(host?.persistVocabulary?.() ?? true) && !force) return undefined;
  try {
    if (typeof localStorage === "undefined") return undefined;
    const raw = localStorage.getItem(storeKey);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as StakeholderCardVocabulary;
    return v && Array.isArray(v.kindNames) && v.fieldSets ? v : undefined;
  } catch {
    return undefined;
  }
}

export function storeCardVocabulary(
  v: StakeholderCardVocabulary,
  force = false,
  storeKey = cardVocabularyStoreKey(),
  host?: Pick<CardVocabularyHost, "persistVocabulary">,
): void {
  if (!(host?.persistVocabulary?.() ?? true) && !force) return;
  if (!v.fieldSets) return;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(storeKey, JSON.stringify(v));
  } catch {
    /* a full or unavailable store costs only the warm start */
  }
}

export function stakeholderCardVocabularyQuery(host: CardVocabularyHost, fetchImpl?: TermFetch) {
  return {
    queryKey: stakeholderCardVocabularyQueryKey(),
    queryFn: async () => {
      // The page's shared kind reader; a fetch of its own (a test) gets a memory-only one over that fetch.
      const v = await readStakeholderCardVocabulary(cardMasterSource(fetchImpl), host.masterKindReader(fetchImpl ? masterFetch(fetchImpl) : undefined));
      storeCardVocabulary(v, false, undefined, host);
      return v;
    },
    placeholderData: () => readStoredCardVocabulary(false, undefined, host),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } as const;
}

/** The reference reading (what the pickers show and offer: DISPLAY only; the write-time check reads its sets live). */
export function stakeholderReferenceReadingQueryKey() {
  return ["gilb-stakeholders", "reference-reading", termOrigin()] as const;
}

/**
 * The reference reading's query: through the page's shared, kept kind and
 * type-tree readers (`{ vedaOrigin }`), so a warm device's first picker sends about 6 requests to the master and 0 children
 * listings (78 every session before). Stale after the readers' own max age, so a kind a background check found reaches the pickers
 * within the session.
 *
 * @param fieldSets the card's field sets
 * @param fetchImpl a fetch of its own (a test or an agent run): memory-only readers over it, for this reading alone
 */
export function referenceReadingQuery(fieldSets: StakeholderFieldSets, fetchImpl?: TermFetch) {
  return {
    queryKey: stakeholderReferenceReadingQueryKey(),
    queryFn: () =>
      fetchImpl
        ? readReferenceVocabulary(cardMasterSource(fetchImpl), fieldSets)
        : readReferenceVocabulary(cardMasterSource(), fieldSets, { vedaOrigin: termOrigin() }),
    staleTime: KIND_SET_MAX_AGE_MS,
    gcTime: Infinity,
    retry: false,
  } as const;
}
