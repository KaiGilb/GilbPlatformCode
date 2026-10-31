/**
 * React binding for the kind-of-contact chips of ONE held record (`heldContactLabel.ts` holds the rules, the unit
 * `contact-kind-catalogue` the master's lists, `contact-kind-model` the ordering and the fit).
 *
 * THE READ is the held-notes one: the claims about THIS contact in THIS vault through the platform's per-person find at the vault's own
 * host, ONE React Query key per (vault, contact) shared with the skill, interest and language sections (`heldClaimsKey`), so a card pays
 * for one read. THE WRITE is serial per (vault, contact) (`runSerial`, the held-notes chain) and reads back only the claim it wrote.
 *
 * WHAT A CARD PAYS:
 *   - no held record about the contact: nothing but the find;
 *   - only the note records (they carry `a:heldParty` too): the claim type, one document, to know they are not chips;
 *   - a chip: the four read terms, then ONE small read per DISTINCT kind a chip names, BY ITS ADDRESS (`readEntryName`, kept 30 minutes). A chip is
 *     drawn with its own words as soon as its own kind has read; until then it says "…", ⛔ never the raw address. The two catalogues are NOT read;
 *   - the lists to ADD from (the master's two catalogues, the holder's own kinds, the type's ancestry) only when the chooser is opened;
 *   - a chip add or remove carries the list the card already holds and re-reads only the claim written, the write terms
 *     (the two a private row needs) only when a chip is written.
 *
 * KIND-AS-RELATION + DEFAULT ASSOCIATED-WITH (`kind-relation`): a kind that names a predicate is read from, written as and ended as ONE private RELATION contact -> the vault's entity, ⛔ not a label
 * claim. A tie with no specific kind is the default `t:AssociatedWith`, shown by the term's own label. Picking a specific kind writes it and THEN ends
 * the default (never both); removing the last specific kind writes the default again (the floor rule); removing the default chip ends it. A label
 * claim made before this (`a:relationshipKind`) is still read and shown (a relation of the same kind wins), and one of a kind with a predicate counts
 * as a specific kind; nothing stored is rewritten. A holder's OWN kind and the circle labels stay private label claims and do not replace the default.
 * WHAT IT ADDS TO A CARD: the record's reverse lookup (the SAME query the header and the relations pane use), and only when a relation touches the
 * vault, the master's kind list (kept 30 minutes) and the user-plane vocabulary (kept for the session).
 */
import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { HELD_NOTES_STALE_MS, heldClaimsKey, listHeldClaimsAbout, mergeClaim, readHeldClaimDoc, runSerial, type HeldClaimDoc } from "@kaigilb/gilbplatformcode-held-notes";
import { useAdderCard } from "@kaigilb/gilbplatformcode-adder-card";
import { sameIri } from "@kaigilb/gilbplatformcode-stated-by";
import {
  CATALOGUE_TTL_MS,
  USER_VOCAB_KEY,
  readHeaderVocab,
  readMasterCatalogue,
  readMasterEntryName,
  readOwnEntryName,
  readOwnKinds,
  typeAncestry,
} from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { notYetChosen, offeredFor, orderEntries, toneOfCircleLabel, type CatalogueEntry, type ContactChip, type KindEntry, type LabelAxis } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { createResource, getResource } from "@kaigilb/gilbplatformcode-vault-resources";
import {
  addContactLabel,
  contactLabelsOf,
  heldTypedClaims,
  isEndedClaimDoc,
  ownContactLabels,
  removeContactLabel,
  resolveContactLabelReadVocab,
  resolveHeldClaimType,
  type ContactLabelClaim,
} from "./heldContactLabel";
import { annotationsFit } from "@kaigilb/gilbplatformcode-contact-annotation";
import { readRelationDoc, readRelations, relationsKey, uriTail } from "@kaigilb/gilbplatformcode-lws-relations";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import {
  defaultTieEntry,
  endTies,
  isDefaultTie,
  isEndedRelationDoc,
  isPartyType,
  matchTies,
  relationKindsOffered,
  relationsTouchingVault,
  vaultMasterType,
  writeTie,
  type KindVault,
  type TieFound,
} from "@kaigilb/gilbplatformcode-kind-relation";

/** The two vault-record calls the holder's own kinds are read and written with (`OwnKindsHost` of `contact-kind-catalogue`), answered by `vault-resources`. */
const ownKindsHost = { createResource, getResource };

export interface ContactLabelsState {
  /** The chips on the contact, circle labels first; null while they are not read (⛔ not "none"). */
  chips: ContactChip[] | null;
  /** What may be added now, per axis: fits the record's type, not already on it, in order. */
  offered: Record<LabelAxis, CatalogueEntry[]>;
  /** The chips could not be read: said, ⛔ never shown as "no chips". */
  readError: string | null;
  /** The person has no landing vault of their own, so a chip they add would have no source. The card says it once, in plain words (`NO_OWN_VAULT_SAYS`). */
  noOwnVault: boolean;
  /** A list that could not be read whole (or at all), said once: the master's, or the holder's own kinds ("Showing N of M"). */
  catalogueNote: string | null;
  /** The last add or remove that did not happen, and why. */
  actError: string | null;
  busy: boolean;
  add: (entry: CatalogueEntry) => Promise<boolean>;
  remove: (chip: ContactChip) => Promise<boolean>;
  /** The lists to add from are being read (the chooser was opened and they have not landed). */
  offersLoading: boolean;
  /** The holder's own kinds changed (one was added): read them again. */
  refreshOwnKinds: () => void;
  /**
   * Per catalogue entry a chip names, its `a:kindPredicate` reference (null = the entry names no predicate; undefined = its
   * document has not read yet). Read from the SAME entry read as the chip's words: no request of its own.
   */
  entryPredicates: ReadonlyMap<string, string | null | undefined>;
  /** The ties (relations contact -> the vault's entity) this card read; null while not read or when no vault entity is known. */
  ties: TieFound[] | null;
}

/** What a chip says while its kind has not read yet, and when it could not be read: ⛔ never the raw address. */
export const CHIP_PENDING_LABEL = "…";
export const CHIP_UNREADABLE_LABEL = "A kind of contact";
/** What `add` and `remove` say on a vault that is not the signer's own. */
export const NOT_OWN_VAULT_SAYS = "Kinds of contact are kept in your own vault only, so none is added or removed here.";
/** What `add` says when the vault cannot be related to (no entity, or the card was not told which vault it is). */
export const NO_VAULT_TIE_SAYS = "This vault has no entity to relate the contact to, so no relation could be saved.";
/** What a floor or default write says when GilbVeda's user relations do not list associated-with (nothing else is written in its place). */
export const DEFAULT_TIE_MISSING_SAYS = "Could not save the relation: GilbVeda's list of relations does not name associated-with right now.";

/** A record's type as the master's address (`…/base/t/<Name>`): the form `a:playableBy` is read in. */
function masterTypeOf(typeUri: string): string {
  const name = typeUri.replace(/\/+$/, "").split("/").pop() ?? "";
  return name ? `${termOrigin()}/base/t/${name.replace(/^t:/, "")}` : "";
}

const hostOf = (u: string): string => {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Remove label claims. A delete the vault REFUSED is done when every claim reads back gone or ended: another tab or device removed it first, and
 * this card's list was read before that (never a message from a list read before the write). A claim that still reads live, or
 * cannot be read, keeps the refusal. A sign-in failure is never read back.
 */
async function removeLabelsConfirmed(vaultId: string, claims: readonly ContactLabelClaim[]): Promise<void> {
  try {
    await removeContactLabel(vaultId, claims);
  } catch (e) {
    if (e instanceof NotSignedInError) throw e;
    for (const c of claims) {
      const got = await readHeldClaimDoc(vaultId, c).catch(() => undefined);
      if (got === undefined || (got !== null && !isEndedClaimDoc(got.doc))) throw e;
    }
  }
}

export function useContactLabels(args: {
  /** The vault that HOLDS the record. */
  vaultId: string | null | undefined;
  /** The contact's record (its entity IRI): every claim's `a:heldParty`. */
  subject: string;
  /** The signed-in principal: the claim's own read. */
  principal: string | null | undefined;
  /**
   * The signed-in person's OWN vault: a kind of contact is written, and removed, only in it, as the notes are. In another person's
   * vault a delegate's label would be private to the delegate: the owner could neither see it (find 0, GET 404) nor remove it (DELETE 403). The chips that
   * are there are still READ (read-only); `add` and `remove` refuse. `null` = not known: nothing may be written.
   */
  ownVaultId: string | null | undefined;
  /** The record's type (any spelling). */
  typeUri: string;
  /**
   * The vault the record is held in, as the TARGET of a tie (its entity) and by what it represents (which kinds fit it). null / absent = unknown:
   * no tie is read or written and no kind with a predicate is offered (⛔ never guessed).
   */
  kindVault?: KindVault | null;
  enabled?: boolean;
  /** The chooser was opened: the lists to ADD from are wanted. Until then none of them is read. */
  needOffers?: boolean;
}): ContactLabelsState {
  const { vaultId, subject, principal, typeUri, ownVaultId } = args;
  const mayWrite = annotationsFit(vaultId, ownVaultId);
  const on = (args.enabled ?? true) && !!vaultId && !!subject;
  const qc = useQueryClient();
  // A NEW label is stated by the viewer's OWN card (`adder.resolve()` makes the basic card when there is none). Whose chip it is
  // is another matter: a chip is always private to its `a:claimSubject`, the principal, so edit and remove match on THAT, ⛔ not on `a:statedBy`
  // (a chip written earlier is stated by a vault card and is still its writer's to remove).
  const adder = useAdderCard(on);
  const claimsKey = heldClaimsKey(vaultId ?? "", subject);
  const claimsQ = useQuery({
    queryKey: claimsKey,
    queryFn: () => listHeldClaimsAbout(vaultId ?? "", subject),
    enabled: on,
    staleTime: HELD_NOTES_STALE_MS,
    retry: false,
  });
  const claims = claimsQ.data ?? null;
  // STAGE 1 — the held claim type (one document), asked only when some held record about the contact exists: it tells a chip's claim from the
  // note records that carry the same `a:heldParty`. STAGE 2 — the four read terms, only when a claim of that type exists.
  const heldTypeQ = useQuery({ queryKey: ["contact-labels", "held-type"] as const, queryFn: resolveHeldClaimType, enabled: on && (claims?.length ?? 0) > 0, staleTime: Infinity, retry: false });
  const typed = useMemo(() => (claims && heldTypeQ.data ? heldTypedClaims(claims, heldTypeQ.data) : null), [claims, heldTypeQ.data]);
  const readVocabQ = useQuery({ queryKey: ["contact-labels", "read-vocab"] as const, queryFn: resolveContactLabelReadVocab, enabled: on && (typed?.length ?? 0) > 0, staleTime: Infinity, retry: false });
  const [actError, setActError] = useState<string | null>(null);
  const [busyN, setBusyN] = useState(0);

  const vocab = readVocabQ.data ?? null;

  /** Every chip the platform returned about this contact, whoever stated it. */
  const stored = useMemo<ContactLabelClaim[] | null>(() => {
    if (!claims) return null;
    if (claims.length === 0) return []; // no held record about this contact at all: no chip, and no term needs asking to know it
    if (!typed) return null;
    if (typed.length === 0) return []; // only the note records: no chip
    return vocab ? contactLabelsOf(typed, vocab, subject) : null;
  }, [claims, typed, vocab, subject]);

  // THE NAME OF EACH KIND A CHIP NAMES, by its address: one small read per distinct kind, the master's or the holder's own.
  const entryIds = useMemo(() => [...new Set((stored ?? []).map((c) => c.entry))], [stored]);
  const nameQs = useQueries({
    queries: entryIds.map((id) => ({
      queryKey: ["contact-labels", "entry-name", id, hostOf(id) === hostOf(vaultId ?? "") ? (vaultId ?? "") : ""] as const,
      queryFn: () => (hostOf(id) === hostOf(vaultId ?? "") ? readOwnEntryName(ownKindsHost, id, vaultId ?? "") : readMasterEntryName(id)),
      enabled: on,
      staleTime: CATALOGUE_TTL_MS,
      retry: false,
    })),
  });
  const names = useMemo(() => {
    const m = new Map<string, { label: string; order: number | null; predicate: string | null } | null | undefined>();
    entryIds.forEach((id, i) => m.set(id, nameQs[i]?.isPending ? undefined : (nameQs[i]?.data ?? null)));
    return m;
  }, [entryIds, nameQs]);

  // THE TIES: the contact's relations to THIS vault's entity (the reverse lookup: the SAME query the header and the relations pane use), and only when
  // one touches the vault, the master's kind list and the user-plane vocabulary, to say which kind each predicate stands for (and which are symmetric).
  const kindVault = args.kindVault ?? null;
  const vaultEntity = kindVault?.entity ?? null;
  const subjectId = uriTail(subject);
  const tieOn = on && !!vaultEntity;
  const tiesKey = useMemo(() => ["contact-labels", "ties", vaultId ?? "", subject, vaultEntity ?? ""] as const, [vaultId, subject, vaultEntity]);
  const readTies = useCallback(
    async (fresh: boolean): Promise<TieFound[]> => {
      if (!vaultEntity || !vaultId) return [];
      const rows = await qc.fetchQuery({ queryKey: relationsKey(subjectId, subject), queryFn: () => readRelations(subjectId, subject), staleTime: fresh ? 0 : 15_000 });
      const touching = await relationsTouchingVault(rows, vaultEntity, vaultId);
      if (touching.length === 0) return [];
      // The vocabulary only names the default and says which predicates read both ways: unreadable, the ties are still read (the default by its name).
      const [cat, vocab] = await Promise.all([
        readMasterCatalogue("relationshipKind"),
        qc.fetchQuery({ queryKey: USER_VOCAB_KEY, queryFn: readHeaderVocab, staleTime: Infinity }).catch(() => null),
      ]);
      return matchTies(touching, cat.entries, subject, vaultEntity, { defaultEntry: defaultTieEntry(vocab), catalog: vocab });
    },
    [qc, subjectId, subject, vaultEntity, vaultId],
  );
  const tiesQ = useQuery({ queryKey: tiesKey, queryFn: () => readTies(false), enabled: tieOn, staleTime: HELD_NOTES_STALE_MS, retry: false });
  const ties = tieOn ? (tiesQ.data ?? null) : null;
  const tiesReady = !tieOn || tiesQ.isSuccess || tiesQ.isError;
  const tieEntryIds = useMemo(() => new Set((ties ?? []).map((t) => t.entryId)), [ties]);
  /** A label claim made before this, of a kind that names a predicate, counts as a specific kind (the dual-read window). */
  const isSpecificLabel = useCallback((c: ContactLabelClaim) => c.axis === "relationshipKind" && !!names.get(c.entry)?.predicate, [names]);
  const hasSpecific = (ties ?? []).some((t) => !t.isDefault) || (stored ?? []).some(isSpecificLabel);
  /** Per tie chip: the relation(s) it stands for (unpicking ends all of them) and whether it is the default. */
  const tieByKey = useMemo(() => {
    const m = new Map<string, { uris: string[]; ties: TieFound[]; isDefault: boolean; entryId: string }>();
    for (const t of ties ?? []) {
      const key = `rel:${t.entryId}`;
      const had = m.get(key);
      m.set(key, { uris: [...(had?.uris ?? []), t.relationUri], ties: [...(had?.ties ?? []), t], isDefault: t.isDefault, entryId: t.entryId });
    }
    return m;
  }, [ties]);

  const chips = useMemo<ContactChip[] | null>(() => {
    const labels = stored;
    if (!labels || !tiesReady) return null;
    const rows = labels.filter((c) => !(c.axis === "relationshipKind" && tieEntryIds.has(c.entry))).map((c) => {
      const n = names.get(c.entry);
      const label = n === undefined ? CHIP_PENDING_LABEL : n === null ? CHIP_UNREADABLE_LABEL : n.label;
      const chip: ContactChip = {
        key: `${c.id}:${c.axis}`,
        axis: c.axis,
        entryId: c.entry,
        label,
        tone: c.axis === "circleLabel" && n ? toneOfCircleLabel(label) : "neutral",
        claimId: c.id,
        // A chip whose claim subject is not this viewer reads, and has no remove for them.
        ...(!!principal && c.claimSubject.length === 1 && sameIri(c.claimSubject[0], principal, c.uri) ? {} : { readOnly: true }),
      };
      return { chip, order: n ? n.order : null };
    });
    // The ties: one chip per kind (a kind made twice by hand is still one chip, and unpicking ends both). The default is shown only while no
    // specific kind is there: if ending it failed after a pick, it is hidden here and ended by the next change.
    const seen = new Set<string>();
    for (const t of ties ?? []) {
      if (seen.has(t.entryId)) continue;
      seen.add(t.entryId);
      if (t.isDefault && hasSpecific) continue;
      rows.push({ chip: { key: `rel:${t.entryId}`, axis: "relationshipKind", entryId: t.entryId, label: t.label, tone: "neutral" }, order: t.isDefault ? -Infinity : t.order });
    }
    return rows
      .sort((a, b) => {
        if (a.chip.axis !== b.chip.axis) return a.chip.axis === "circleLabel" ? -1 : 1;
        if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
        if ((a.order === null) !== (b.order === null)) return a.order === null ? 1 : -1;
        return a.chip.label.localeCompare(b.chip.label);
      })
      .map((r) => r.chip);
  }, [stored, principal, names, tiesReady, tieEntryIds, ties, hasSpecific]);

  // THE LISTS TO ADD FROM: only when the chooser is open (a card with chips does not read both catalogues and every own kind).
  const wantLists = on && !!args.needOffers;
  const circleQ = useQuery({ queryKey: ["contact-labels", "catalogue", "circleLabel", termOrigin()] as const, queryFn: () => readMasterCatalogue("circleLabel"), enabled: wantLists, staleTime: CATALOGUE_TTL_MS, retry: false });
  const kindQ = useQuery({ queryKey: ["contact-labels", "catalogue", "relationshipKind", termOrigin()] as const, queryFn: () => readMasterCatalogue("relationshipKind"), enabled: wantLists, staleTime: CATALOGUE_TTL_MS, retry: false });
  const ownQ = useQuery({ queryKey: ["contact-labels", "own-kinds", vaultId ?? ""] as const, queryFn: () => readOwnKinds(ownKindsHost, vaultId ?? ""), enabled: wantLists, staleTime: 60_000, retry: false });
  const masterType = masterTypeOf(typeUri);
  const ancestryQ = useQuery({ queryKey: ["contact-labels", "ancestry", masterType] as const, queryFn: () => typeAncestry(masterType), enabled: wantLists && !!masterType, staleTime: CATALOGUE_TTL_MS, retry: false });
  const all = useMemo<KindEntry[]>(() => [...(circleQ.data?.entries ?? []), ...(kindQ.data?.entries ?? []), ...(ownQ.data?.entries ?? [])], [circleQ.data, kindQ.data, ownQ.data]);
  // The kinds fit the TYPE of the vault they are said toward (`a:kindForVault`), read up is-a like the record's. Unknown = no kind with a predicate is offered.
  const vaultMasterT = vaultEntity ? vaultMasterType(kindVault?.represents) : "";
  const vaultAncQ = useQuery({ queryKey: ["contact-labels", "ancestry", vaultMasterT] as const, queryFn: () => typeAncestry(vaultMasterT), enabled: wantLists && !!vaultMasterT, staleTime: CATALOGUE_TTL_MS, retry: false });
  const vaultTypes = useMemo<Set<string> | null>(() => (vaultMasterT ? new Set<string>(vaultAncQ.data ?? [vaultMasterT]) : null), [vaultMasterT, vaultAncQ.data]);
  const vocabQ = useQuery({ queryKey: USER_VOCAB_KEY, queryFn: readHeaderVocab, enabled: wantLists && !!vaultEntity, staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnWindowFocus: false });

  const offered = useMemo<Record<LabelAxis, CatalogueEntry[]>>(() => {
    const types = new Set<string>(ancestryQ.data ?? (masterType ? [masterType] : []));
    const chosen = new Set([...(stored ?? []).map((c) => c.entry), ...tieEntryIds]);
    const kinds = orderEntries(notYetChosen(relationKindsOffered(all.filter((e) => e.axis === "relationshipKind"), types, vaultTypes), chosen));
    // associated-with is offered while the contact has no tie to this vault at all (picking it beside a specific kind would keep both).
    const dflt = defaultTieEntry(vocabQ.data ?? null);
    const noTie = (ties ?? []).length === 0 && !(stored ?? []).some(isSpecificLabel);
    const offerDefault = !!dflt && noTie && !!vaultTypes && isPartyType(all, types);
    return {
      circleLabel: orderEntries(notYetChosen(offeredFor(all.filter((e) => e.axis === "circleLabel"), types), chosen)),
      relationshipKind: offerDefault ? [dflt, ...kinds] : kinds,
    };
  }, [all, ancestryQ.data, masterType, stored, tieEntryIds, vaultTypes, vocabQ.data, ties, isSpecificLabel]);

  const readError = heldTypeQ.isError
      ? (heldTypeQ.error as Error).message
      : readVocabQ.isError
        ? (readVocabQ.error as Error).message
        : claimsQ.isError
          ? `Could not read the kinds of contact: ${(claimsQ.error as Error).message}`
          : tiesQ.isError && tieOn
            ? `Could not read the relations to this vault: ${(tiesQ.error as Error).message}`
            : null;
  const ownIncomplete = ownQ.data && !ownQ.data.complete ? `Showing ${ownQ.data.entries.length} of ${ownQ.data.totalIsFloor ? "more than " : ""}${ownQ.data.total} of your own kinds. The search looks only in these.` : null;
  const catalogueNote =
    circleQ.isError || kindQ.isError || ownQ.isError
      ? `${[circleQ.error, kindQ.error, ownQ.error].filter(Boolean).map((e) => (e as Error).message).join(" ")}`
      : circleQ.data?.complete === false || kindQ.data?.complete === false
        ? ["The list of kinds may not be whole.", ownIncomplete].filter(Boolean).join(" ")
        : ownIncomplete;

  const chainKey = `contact-label\u0000${vaultId ?? ""}\u0000${subject}`;

  /** The chips among a list of held claims whose claim subject is the viewer's principal (needs the read terms, asked once). */
  const chipsOf = useCallback(
    async (list: readonly HeldClaimDoc[], owner: string): Promise<ContactLabelClaim[]> => {
      const v = await resolveContactLabelReadVocab();
      return ownContactLabels(contactLabelsOf(heldTypedClaims(list, v.heldClaimType), v, subject), owner);
    },
    [subject],
  );

  /** The chips of the viewer's that this card ALREADY holds (the list it read, merged with what it wrote), or a FRESH read when it holds none yet. null = the read failed. */
  const currentChips = useCallback(async (owner: string): Promise<ContactLabelClaim[] | null> => {
    if (!vaultId) return null;
    try {
      const have = qc.getQueryData<HeldClaimDoc[]>(heldClaimsKey(vaultId, subject));
      if (have) return await chipsOf(have, owner);
      const fresh = await listHeldClaimsAbout(vaultId, subject);
      qc.setQueryData(heldClaimsKey(vaultId, subject), fresh);
      return await chipsOf(fresh, owner);
    } catch {
      return null;
    }
  }, [qc, vaultId, subject, chipsOf]);

  /** The ties as they are now: the card's own list, or a fresh read (after a write, the reverse lookup is asked again). */
  const freshTies = useCallback(() => qc.fetchQuery({ queryKey: tiesKey, queryFn: () => readTies(true), staleTime: 0 }), [qc, tiesKey, readTies]);
  /** A fresh read after a write or end; `fresh` is false when it failed and `fallback` stands in. */
  const readNow = useCallback(
    (fallback: TieFound[]): Promise<{ ties: TieFound[]; fresh: boolean }> =>
      freshTies().then(
        (t) => ({ ties: t, fresh: true }),
        () => ({ ties: fallback, fresh: false }),
      ),
    [freshTies],
  );
  /** Keep `next` as the card's ties. `fresh`: it came from a fresh read, which already refreshed the header's reverse lookup; else the header asks again. */
  const tiesChanged = useCallback(
    (next: TieFound[], fresh = false) => {
      qc.setQueryData<TieFound[]>(tiesKey, next);
      if (!fresh) void qc.invalidateQueries({ queryKey: relationsKey(subjectId, subject) });
    },
    [qc, tiesKey, subjectId, subject],
  );

  /**
   * THE FLOOR RULE: once a tie has been made, at least one stays. After a specific kind is removed, when no specific
   * kind is left (no tie of one, no label claim of a kind with a predicate) and the default is not there, the default is written again. Returns the
   * ties after it and, when it could not be written, what to say (the kind is removed either way).
   * Decided from a FRESH read after the end, ⛔ never from the list the card held before it: another tab or device may have removed
   * or added a kind meanwhile, and a stale list leaves the contact with no tie, or writes a default that is ended again. What this card just ended
   * (`goneTies`) is left out even if the read lags; unreadable, the card's own list stands in. The LABELS are the card's held list (`labelsNow`,
   * a remove lists no claims again): old label claims are no longer written, only removed, and each removal is read back.
   */
  const floor = useCallback(
    async (goneTies: readonly string[], fallbackTies: TieFound[], labelsNow: readonly ContactLabelClaim[]): Promise<{ ties: TieFound[]; fresh: boolean; note: string | null }> => {
      if (!kindVault?.entity || !principal) return { ties: fallbackTies, fresh: false, note: null };
      const read = await readNow(fallbackTies);
      const tiesNow = read.ties.filter((t) => !goneTies.includes(t.relationUri));
      const fresh = read.fresh && tiesNow.length === read.ties.length;
      if (tiesNow.length > 0 || labelsNow.some(isSpecificLabel)) return { ties: tiesNow, fresh, note: null };
      try {
        const dflt = defaultTieEntry(await qc.fetchQuery({ queryKey: USER_VOCAB_KEY, queryFn: readHeaderVocab, staleTime: Infinity }));
        if (!dflt) return { ties: tiesNow, fresh, note: DEFAULT_TIE_MISSING_SAYS };
        const res = await writeTie({ vault: kindVault, subject, curie: dflt.kindPredicate!.curie, holder: principal });
        // Not live: another tab or device gave the contact a specific kind meanwhile, so the default was ended again (never both).
        if (!res.live) return { ...(await readNow(tiesNow)), note: null };
        return { ties: [...tiesNow, { relationUri: res.uri, curie: dflt.kindPredicate!.curie, entryId: dflt.id, label: dflt.label, order: null, isDefault: true }], fresh: false, note: null };
      } catch (e) {
        // `writeTie` reads the ties back before it throws: a refusal of a tie that is live anyway does not reach here.
        return { ties: tiesNow, fresh, note: `The kind was removed, but associated-with could not be saved: ${(e as Error).message}` };
      }
    },
    [kindVault, principal, subject, qc, isSpecificLabel, readNow],
  );

  /**
   * Pick a kind that names a predicate (or the default): write the tie, read it back, then END the default (replace, never both). The ending is
   * done inside `writeTie` (its heal, after the write): it also ends a default another tab or device wrote meanwhile.
   */
  const addTie = useCallback(
    (entry: KindEntry, holder: string): Promise<boolean> =>
      runSerial(chainKey, async () => {
        try {
          if (!kindVault?.entity) {
            setActError(NO_VAULT_TIE_SAYS);
            return false;
          }
          const before = await freshTies();
          if (entry.defaultTie ? before.length > 0 : before.some((t) => t.entryId === entry.id)) return true;
          const curie = entry.kindPredicate!.curie;
          const res = await writeTie({ vault: kindVault, subject, curie, holder });
          // What is shown and said is decided from a FRESH read AFTER the write, ⛔ never from `before`: another tab or device may have
          // written the same kind and ended the default between that read and this write, and `before` still holds the default. The tie this write
          // confirmed counts, and the ties its heal ended do not, even if the read lags.
          const read = await readNow(before);
          const endedNow = new Set(res.ended.map((t) => t.uri));
          let next = read.ties.filter((t) => !endedNow.has(t.relationUri));
          if (res.live && !next.some((t) => t.relationUri === res.uri)) {
            next = [...next, { relationUri: res.uri, curie, entryId: entry.id, label: entry.label, order: entry.order, isDefault: !!entry.defaultTie }];
          }
          const asRead = read.fresh && next.length === read.ties.length && next.every((t, i) => t === read.ties[i]);
          // Said only when the vault REFUSED to end the default AND the default reads back live: the specific kind is kept, the default stays
          // hidden beside it and is ended by the next change. A default someone else already ended is no failure.
          let note: string | null = null;
          for (const t of entry.defaultTie ? [] : res.notEnded.filter((o) => isDefaultTie(o.curie))) {
            const back = await readRelationDoc(t.uri, kindVault.vaultId).catch(() => null);
            if (back && isEndedRelationDoc(back)) continue;
            note = `${entry.label} was added. The earlier ${[...next, ...before].find((x) => x.relationUri === t.uri || x.isDefault)?.label ?? t.curie} could not be ended (${res.endError ?? "the vault gave no reason"}); it is hidden and will be ended next time.`;
            break;
          }
          tiesChanged(next, asRead);
          setActError(note);
          return true;
        } catch (e) {
          setActError(`Could not save the relation: ${(e as Error).message}`);
          return false;
        } finally {
          setBusyN((n) => n - 1);
        }
      }),
    [chainKey, kindVault, freshTies, readNow, subject, tiesChanged],
  );

  const add = useCallback(
    (entry: CatalogueEntry): Promise<boolean> => {
      if (!mayWrite) {
        setActError(NOT_OWN_VAULT_SAYS);
        return Promise.resolve(false);
      }
      // A kind that names a predicate is a TIE (a relation to the vault): it needs no stater; a label claim does (the adder's own card).
      const asTie = entry.axis === "relationshipKind" && !!(entry as KindEntry).kindPredicate;
      if (!vaultId || !principal) {
        setActError("Not signed in to a vault, so there is nowhere to keep this.");
        return Promise.resolve(false);
      }
      setBusyN((n) => n + 1);
      if (asTie) return addTie(entry as KindEntry, principal);
      return runSerial(chainKey, async () => {
        try {
          // The source first: with no own vault (or no card that can be made) nothing is written.
          let stater: string;
          try {
            stater = await adder.resolve();
          } catch (e) {
            setActError((e as Error).message);
            return false;
          }
          const before = await currentChips(principal);
          if (before === null) {
            setActError("The kinds of contact could not be read, so this was not added. Try again.");
            return false;
          }
          const res = await addContactLabel({ vaultId, subject, entry, existing: before, stater, holder: principal });
          if (res.kind === "none") return true;
          const got = await readHeldClaimDoc(vaultId, res.claim);
          if (!got) {
            setActError("The store accepted this but did not keep it, so it is not added. Try again.");
            return false;
          }
          mergeClaim(qc, heldClaimsKey(vaultId, subject), res.claim.id, got);
          setActError(null);
          return true;
        } catch (e) {
          setActError(`Could not add this: ${(e as Error).message}`);
          return false;
        } finally {
          setBusyN((n) => n - 1);
        }
      });
    },
    [mayWrite, chainKey, vaultId, subject, principal, adder.resolve, currentChips, qc, addTie],
  );

  const remove = useCallback(
    (chip: ContactChip): Promise<boolean> => {
      if (!mayWrite) {
        setActError(NOT_OWN_VAULT_SAYS);
        return Promise.resolve(false);
      }
      // A TIE chip ends its relation(s), never a delete. A label claim of the same kind made before goes with it, or it would show again.
      // Removing the last specific kind brings the default back (the floor); removing the default chip ends the tie itself.
      const tie = tieByKey.get(chip.key);
      if (tie && vaultId) {
        setBusyN((n) => n + 1);
        return runSerial(chainKey, async () => {
          try {
            // Ended AND remembered (by holder, contact and kind), so picking the kind again in this tab revives the same relation.
            await endTies({ vaultId, entity: kindVault?.entity ?? null, represents: kindVault?.represents ?? null }, principal ?? "", subject, tie.ties);
            // The card's own list, only as a stand-in when the fresh read after the end fails.
            const held0 = (qc.getQueryData<TieFound[]>(tiesKey) ?? ties ?? []).filter((t) => !tie.uris.includes(t.relationUri));
            let labelsNow: ContactLabelClaim[] = [];
            if (principal) {
              const held = (await currentChips(principal)) ?? [];
              const legacy = held.filter((c) => c.axis === "relationshipKind" && c.entry === tie.entryId);
              if (legacy.length > 0) {
                await removeLabelsConfirmed(vaultId, legacy);
                for (const c of legacy) mergeClaim(qc, heldClaimsKey(vaultId, subject), c.id, null);
              }
              labelsNow = held.filter((c) => !legacy.includes(c));
            }
            let note: string | null = null;
            let next: TieFound[];
            let fresh: boolean;
            if (!tie.isDefault) {
              const after = await floor(tie.uris, held0, labelsNow);
              ({ ties: next, fresh, note } = after);
            } else {
              const read = await readNow(held0);
              next = read.ties.filter((t) => !tie.uris.includes(t.relationUri));
              fresh = read.fresh && next.length === read.ties.length;
            }
            tiesChanged(next, fresh);
            setActError(note);
            return true;
          } catch (e) {
            // Read the ties again whatever failed (the fresh read also refreshes the header's list): a stale list keeps showing a tie that may be
            // gone and stops offering its kind (s142 D2).
            await freshTies().catch(() => null);
            setActError(`Could not remove this: ${(e as Error).message}`);
            return false;
          } finally {
            setBusyN((n) => n - 1);
          }
        });
      }
      // A chip the viewer did not state has no remove for them (it is read, not changed).
      if (!vaultId || !chip.claimId || chip.readOnly) return Promise.resolve(false);
      setBusyN((n) => n + 1);
      return runSerial(chainKey, async () => {
        try {
          if (!principal) return false;
          const before = await currentChips(principal);
          if (before === null) {
            setActError("The kinds of contact could not be read, so this was not removed. Try again.");
            return false;
          }
          const mine = before.filter((c) => c.id === chip.claimId);
          if (mine.length === 0) return true;
          await removeLabelsConfirmed(vaultId, mine);
          for (const c of mine) {
            const got = await readHeldClaimDoc(vaultId, c);
            if (got && !isEndedClaimDoc(got.doc)) {
              setActError("This could not be confirmed removed. Try again.");
              return false;
            }
            mergeClaim(qc, heldClaimsKey(vaultId, subject), c.id, null);
          }
          // A label of a kind that names a predicate was a specific kind: removing the last one brings the default back (the floor).
          let note: string | null = null;
          if (mine.some(isSpecificLabel)) {
            const tiesNow = qc.getQueryData<TieFound[]>(tiesKey) ?? ties ?? [];
            const after = await floor([], tiesNow, before.filter((c) => !mine.includes(c)));
            tiesChanged(after.ties, after.fresh);
            note = after.note;
          }
          setActError(note);
          return true;
        } catch (e) {
          setActError(`Could not remove this: ${(e as Error).message}`);
          return false;
        } finally {
          setBusyN((n) => n - 1);
        }
      });
    },
    [mayWrite, chainKey, vaultId, subject, currentChips, qc, tieByKey, tiesKey, ties, floor, tiesChanged, isSpecificLabel, kindVault, principal, freshTies, readNow],
  );

  const refreshOwnKinds = useCallback(() => void qc.invalidateQueries({ queryKey: ["contact-labels", "own-kinds", vaultId ?? ""] }), [qc, vaultId]);

  const offersLoading =
    !!args.needOffers && (circleQ.isPending || kindQ.isPending || ownQ.isPending || ancestryQ.isPending || (!!vaultMasterT && vaultAncQ.isPending) || (!!vaultEntity && vocabQ.isPending));
  const entryPredicates = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    for (const [id, n] of names) m.set(id, n === undefined ? undefined : (n?.predicate ?? null));
    return m;
  }, [names]);

  return { chips, offered, offersLoading, readError, noOwnVault: adder.noOwnVault, catalogueNote, actError, busy: busyN > 0, add, remove, refreshOwnKinds, entryPredicates, ties };
}
