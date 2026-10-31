/**
 * What goes into the person card's reserved places (`CardSlots`, the card-look branch): the kind-of-contact CHIPS beside the name (`nameAside`), and
 * "My Note" over "Where / How we met" at the top (`myNote`, `howWeMet`). Both notes are the holder's own, private to them.
 *
 * This file is the adapter of the shared chips (`ContactKindChips` of `stakeholder-contact-header`): the chip is a LABEL here and says so
 * (`meaning="label"`, the tooltip and the help line). In a circle app the same chip is a circle membership (access) and stays as it is.
 *
 * A kind of relationship is a RELATION from the contact to THE VAULT the record is held in (`kind-relation`), and a tie with no specific kind is
 * associated-with; a holder's own kind and the circle labels stay private labels (`contact-labels`).
 *
 * 🔴 NEUTRALITY: nothing here writes a membership, a grant or a rung. A kind relation is private to the holder and grants nothing;
 * the labels are `t:HeldPartyFieldClaim`s kept private. The two notes go through the annotations route (the holder's own vault only: `annotationsFit`).
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { heldNoteKey, type ResolveOutcome } from "@kaigilb/gilbplatformcode-person-connections";
import type { CardSlots } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import {
  AnnotationVaultMismatchError,
  HolderNoteGroup,
  NOTES_VAULT_UNTIED_COPY,
  annotationsFit,
  loadHolderAnnotations,
  type HolderAnnotations,
} from "@kaigilb/gilbplatformcode-contact-annotation";
import { ContactKindChips, GILBAPP_CHIP_HELP } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { hasAnnotationRecord, resolveHeldClaimType, useContactLabels } from "@kaigilb/gilbplatformcode-contact-labels";
import { NO_OWN_VAULT_SAYS } from "@kaigilb/gilbplatformcode-adder-card";
import type { KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { HELD_NOTES_STALE_MS, heldClaimsKey, listHeldClaimsAbout } from "@kaigilb/gilbplatformcode-held-notes";

export interface ContactCardArgs {
  /** The vault that HOLDS the record. */
  vaultId: string | null;
  /** The signed-in holder's own vault (the annotations route reads from there). */
  ownVaultId: string | null;
  principal: string | null;
  /** The record's address (its entity IRI): every claim's `a:heldParty`. */
  recordEntityUri: string | null;
  typeUri: string;
  canEdit: boolean;
  /** The vault that holds the record, as the TARGET of a kind (its entity) and by what it represents. Absent / null = unknown: no kind with a predicate is read, written or offered. */
  kindVault?: KindVault | null;
  /**
   * The vault holds the note, not any of the apps: the person the record is linked to (`a:sameAs`), as the card's
   * person resolver named him (`usePersonCard` -> `party`), or null. When set, My Note and Where / How we met are read and written under this
   * principal (`heldNoteKey`, the same key MyNet uses), ⛔ not the record.
   */
  linkedParty?: string | null;
  /**
   * The record CARRIES a link (`a:sameAs`), whether or not its person could be named. A linked record
   * NEVER uses the record as its key: while `linkedParty` is not known (still being looked up, or the lookup failed: 500, time-out, sign-in)
   * the notes are not read and cannot be written, exactly as while the person is being looked up.
   */
  linked?: boolean;
  /**
   * The person lookup of a linked record ANSWERED without naming a person (500, time-out, sign-in). Same as pending for the notes (no
   * read, no write, no box), but nothing is "loading" any more, so the header does not say "Loading where you met…" for ever.
   */
  linkedLookupFailed?: boolean;
  /**
   * The person resolver's answer kind for the link (`personCard.anchor.kind`), when it answered. A
   * DEFINITE "not a person" (organization) keys the notes to the record, as before the shared key; see `heldNoteKey`. The
   * platform's one 404 ("none") is not definite (it is also sent for a target that cannot be reached), so it gives no key, like a failed lookup.
   */
  linkAnswer?: ResolveOutcome["kind"] | null;
}

function HeldContactChips({ vaultId, ownVaultId, principal, recordEntityUri, typeUri, canEdit, kindVault }: ContactCardArgs) {
  const mode = useCardMode();
  // A kind of contact is added and removed in the signed-in person's OWN vault only, as the notes are. On a record held in another
  // vault the chips that are readable are shown, read-only: no (−), no "+ Kind".
  const editing = mode.editing && canEdit && annotationsFit(vaultId, ownVaultId);
  // The master's lists to add from are read when the chooser is opened, ⛔ not on every card and not on entering edit mode.
  const [chooserWanted, setChooserWanted] = useState(false);
  const labels = useContactLabels({ vaultId, ownVaultId, subject: recordEntityUri ?? "", principal, typeUri, kindVault: kindVault ?? null, enabled: !!vaultId && !!recordEntityUri, needOffers: editing && chooserWanted });
  // RuleBaseappSourceIsAdder: a person with no landing vault of their own cannot add a kind (it would have no source). That is said ONCE per card,
  // here, in plain words, to whoever may edit the card; the skill, interest, language and number sections say nothing of it. A reader is told nothing.
  // ⛔ A vault with no card of its own is no longer a reason: the source is the adder's own card, not the vault's.
  if (labels.noOwnVault) return canEdit ? <ContactKindChips chips={null} meaning="label" editing={false} note={NO_OWN_VAULT_SAYS} /> : null;
  return (
    <ContactKindChips
      chips={labels.chips}
      meaning="label"
      help={GILBAPP_CHIP_HELP}
      editing={editing}
      onRemove={(c) => void labels.remove(c)}
      offered={chooserWanted ? labels.offered : undefined}
      loading={labels.offersLoading}
      onOpen={() => setChooserWanted(true)}
      onAdd={(e) => labels.add(e)}
      busy={labels.busy}
      note={labels.readError ?? labels.actError ?? labels.catalogueNote}
    />
  );
}

/** What the card keeps of one read of the holder's two notes, as the route answers it. */
const emptyAnnotations = (heldParty: string): HolderAnnotations => ({ me: "", heldParty, note: null, origin: null, notes: [], origins: [], noteLoad: "empty", originLoad: "empty", vault: null });

/**
 * The two holder-only fields. The route that reads them (`loadHolderAnnotations`, ONE function, so the way they are read can be swapped without
 * touching the card) is asked ONLY when it can matter (the route itself is one function, `loadHolderAnnotations`):
 *   - when the held records about this contact include one that is NOT a held claim (the note and where-we-met records are, and they answer the same
 *     find the chips use): the card then has evidence there is something to show;
 *   - otherwise nothing is asked: the groups are empty, listed under "+ Add Information" and opened there. A card with no held record, or only chips, never pays it.
 * What was read (or written) is kept for a minute, as the claims are, so a card opened again inside it asks nothing.
 */
function useHolderAnnotationsRead({ vaultId, ownVaultId, recordEntityUri, linkedParty, linked, linkedLookupFailed, linkAnswer }: Pick<ContactCardArgs, "vaultId" | "ownVaultId" | "recordEntityUri" | "linkedParty" | "linked" | "linkedLookupFailed" | "linkAnswer">) {
  const fits = !!vaultId && !!recordEntityUri && annotationsFit(vaultId, ownVaultId);
  // ONE key per person (`heldNoteKey` of `person-connections`): the linked principal, else the record. Notes written earlier under the
  // record of a linked person are no longer read; they stay in the vault.
  const byPrincipal = !!linkedParty?.trim();
  // Null for a linked record whose person is not named (now): no read, no write, never the record.
  const key = heldNoteKey({ linkedPrincipal: linkedParty, linked: !!linked, linkAnswer: linkAnswer ?? null, record: recordEntityUri });
  const keyKnown = key !== null;
  const noteKey = key ?? "";
  const annKey = ["contact-annotations", vaultId ?? "", noteKey] as const;
  const claimsQ = useQuery({
    queryKey: heldClaimsKey(vaultId ?? "", recordEntityUri ?? ""),
    queryFn: () => listHeldClaimsAbout(vaultId ?? "", recordEntityUri ?? ""),
    enabled: fits,
    staleTime: HELD_NOTES_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const claimCount = claimsQ.data?.length ?? 0;
  const heldTypeQ = useQuery({ queryKey: ["contact-labels", "held-type"] as const, queryFn: resolveHeldClaimType, enabled: fits && claimCount > 0, staleTime: Infinity, retry: false });
  const evidence = claimsQ.data && claimCount === 0 ? false : claimsQ.data && heldTypeQ.data ? hasAnnotationRecord(claimsQ.data, heldTypeQ.data) : null;
  // A claims read that FAILED is not evidence of nothing: the notes are then asked for, as before.
  // The claims find is keyed by the RECORD, so it says nothing about notes under the linked principal: those are always asked
  // (one request per open of a linked card), once the person is resolved.
  const readNow = fits && keyKnown && (byPrincipal || evidence === true || claimsQ.isError || heldTypeQ.isError);
  const q = useQuery({
    queryKey: annKey,
    queryFn: () => loadHolderAnnotations(noteKey, vaultId!),
    enabled: readNow,
    staleTime: HELD_NOTES_STALE_MS,
    gcTime: HELD_NOTES_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  // Still finding out: the claims are being read, or the notes are.
  const pending = fits && ((!keyKnown && !linkedLookupFailed) || (!byPrincipal && evidence === null && !claimsQ.isError && !heldTypeQ.isError) || (readNow && q.isPending));
  return { fits, annKey, evidence, q, pending, noteKey, keyKnown, byPrincipal };
}

/**
 * The Where / How we met line for the shared contact header (`ContactHeader` wide): the SAME read as the card's own
 * "Where / How we met" group (the same query keys, so the two share one request and an edit in the group shows in the header at once).
 * ⛔ No read of its own, no write.
 */
export function useHolderOriginLine(
  args: Pick<ContactCardArgs, "vaultId" | "ownVaultId" | "recordEntityUri" | "linkedParty" | "linked" | "linkedLookupFailed" | "linkAnswer">,
): { origin: string | null; loading: boolean } {
  const r = useHolderAnnotationsRead(args);
  const text = r.q.data?.origin?.trim() ?? "";
  return { origin: text ? text : null, loading: !text && r.pending };
}

function HolderNotes({ field, vaultId, ownVaultId, recordEntityUri, linkedParty, linked, linkedLookupFailed, linkAnswer }: ContactCardArgs & { field: "note" | "origin" }) {
  const qc = useQueryClient();
  const { fits, annKey, evidence, q, noteKey, keyKnown, byPrincipal } = useHolderAnnotationsRead({ vaultId, ownVaultId, recordEntityUri, linkedParty, linked, linkedLookupFailed, linkAnswer });
  // A group shown empty STAYS mounted when a later read of the claims finds a record: the person may be typing in it.
  const shownEmpty = useRef(false);
  if (evidence === false && !byPrincipal && keyKnown) shownEmpty.current = true;
  // A linked record whose person is not named (still looked up, or the lookup failed) has no key, so no box is drawn
  // and nothing is read (a box would show and write under the record).
  if (!fits || !keyKnown) return null;
  const data = q.data ?? (shownEmpty.current ? emptyAnnotations(noteKey) : undefined);
  if (!data) return q.isError ? <NotesFailed field={field} vaultId={vaultId!} heldParty={noteKey} onReload={() => void q.refetch()} errorCopy={q.error instanceof AnnotationVaultMismatchError ? NOTES_VAULT_UNTIED_COPY : undefined} /> : null;
  const landed = (text: string | null) =>
    qc.setQueryData<HolderAnnotations>(annKey, (old) => {
      const base = old ?? emptyAnnotations(noteKey);
      const load = text && text.length > 0 ? ("ok" as const) : ("empty" as const);
      return field === "note" ? { ...base, note: text, noteLoad: load } : { ...base, origin: text, originLoad: load };
    });
  return (
    <HolderNoteGroup
      // A box under another key (the record became linked) is a new box: its draft and what it knows the vault holds start over.
      key={noteKey}
      field={field}
      vaultId={vaultId!}
      heldParty={noteKey}
      initialText={field === "note" ? data.note : data.origin}
      initialLoad={field === "note" ? data.noteLoad : data.originLoad}
      onReload={() => void q.refetch()}
      onSaved={landed}
    />
  );
}

/** The notes could not be read: said in the group, ⛔ never an empty box over a failed read. */
function NotesFailed({ field, vaultId, heldParty, onReload, errorCopy }: { field: "note" | "origin"; vaultId: string; heldParty: string; onReload: () => void; errorCopy?: string }) {
  return <HolderNoteGroup field={field} vaultId={vaultId} heldParty={heldParty} initialText={null} initialLoad="error" onReload={onReload} {...(errorCopy ? { errorCopy } : {})} />;
}

/** The card's reserved places, filled. Pass the result to the card's slots (`RecordDetail` merges it under any `slots` it is given). */
export function contactCardSlots(args: ContactCardArgs): CardSlots {
  if (!args.vaultId || !args.recordEntityUri) return {};
  return {
    nameAside: <HeldContactChips {...args} />,
    myNote: <HolderNotes {...args} field="note" />,
    howWeMet: <HolderNotes {...args} field="origin" />,
  };
}
