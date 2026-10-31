/**
 * The card of an ONLINE stakeholder the holder holds no local record of (a person he placed in his circles), opened from
 * the Stakeholders grid (`?ons=<principal>`), in the same pane and drawn by today's components: the contact header
 * (`StakeholderContactHeader`: the holder's vault on the left joined to the person on the right, the circle chips, their photo and the
 * chain-link badge) and the one card's body (`OneCardBody`: their rows, marked "Theirs").
 *
 * Read only: opening it writes nothing. Their card is read once per open (the online card controller, the person known, so no
 * resolver request); the placements come from the session's one circles read (`resolvePersonCard`, 0 requests more).
 *
 * "+ Add your own": makes ONE local record of the person in the holder's own vault through the stakeholder
 * create (`recordPerson`, the vault named, ⛔ never the default vault), links it to the person through the card's own link door
 * (`confirmLink`: `a:sameAs`, `patchRecord`), and opens it. From then on the person is one row, the record's, still online.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cardName, createOnlineCardController } from "@kaigilb/gilbplatformcode-online-card";
import { resolvePersonCard } from "@kaigilb/gilbplatformcode-person-connections";
import { PartialCreateError } from "@kaigilb/gilbplatformcode-pick-or-create";
import { bareForm } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { OneCardGroup } from "@kaigilb/gilbplatformcode-one-card-merge";
import { AddYourOwnButton } from "@kaigilb/gilbplatformcode-add-your-own";
import { StakeholderContactHeader } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { OneCardBody, OneCardOwnGroups, useOnlineCardLabelFor, useOnlineCardState } from "@kaigilb/gilbplatformcode-one-card";
import { ownVaultIdOf } from "@kaigilb/gilbplatformcode-plan-self-source";
import {
  canonicaliserFor,
  heldVaultsOwnFirst,
  linkedRecordsOf,
  onlineCardDeps,
  personCardPlatform,
  sessionConnections,
} from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { forgetLinkedFinds, isDeletedLinkedRecord, newestLinkedId, screenRecordLinkedTo } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { fieldOfTerm, stakeholderCardState, termName } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { stakeholderCardVocabularyQuery } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { afterRecordPerson, pickerReadingQuery, recordableKinds, recordPerson } from "@kaigilb/gilbplatformcode-person-create";
import { deleteRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { idFromEntityUri, idFromUri } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { useOnlineStakeholderCardHost } from "./onlineStakeholderCardHost";

export interface OnlineStakeholderCardProps {
  /** The person (their principal). */
  principal: string;
  /** Where the card is drawn: the Card view's centre ("content"), the detail pane ("full"), or the pane beside the Card view ("actions"). */
  placementMode: "content" | "full" | "actions";
}

/** Said when it could not be checked whether the holder already has a card of the person: nothing is made then. */
export const CHECK_FAILED = "It could not be checked whether you already have a card of them, so none was made. Try again.";

/** Said when the link could not be made and the new card was removed again. */
export const LINK_FAILED_REMOVED = "The card could not be linked to their online card, so it was removed again. Nothing was kept. Try again.";
/** Said when the link could not be made and the new card could not be removed either. */
export const LINK_FAILED_KEPT = (name: string) =>
  `The card could not be linked to their online card, and the new card "${name}" could not be removed. Remove it from Records, then try again.`;
/** The card could not be saved (a step after the record was written failed), so it was removed again. */
export const SAVE_FAILED = "The card could not be saved, so it was removed again. Nothing was kept. Try again.";
/** This act's new card could not be removed after a step failed. */
export const REMOVE_FAILED = (name: string) => `The new card "${name}" could not be removed. Remove it from Records, then try again.`;
/** The card was removed but its name (tag) could not be: the same name cannot be saved yet. */
export const LINK_FAILED_TAG_KEPT = (name: string) =>
  `The card could not be linked to their online card, so it was removed again, but the name "${name}" is still taken in your vault. Try again with another name.`;
/** Said for an online card that is not shown (a person not in the holder's circles). */
export const NOT_A_STAKEHOLDER = "This person is not one of your stakeholders.";

/**
 * Remove what this act wrote, newest first (the ONE clean-up of "+ Add your own", for a failed link and for
 * a create another tab won). Each address is deleted at its own address through the app's record delete.
 *
 * @param written this act's writes, oldest first (the record, then its tag)
 * @returns the addresses that could NOT be removed
 */
async function removeWritten(written: readonly string[]): Promise<Set<string>> {
  const left = new Set<string>();
  for (const uri of [...written].reverse()) {
    try {
      await deleteRecord(idFromEntityUri(uri), uri);
    } catch {
      left.add(uri);
    }
  }
  return left;
}

/** The kind an online stakeholder with no record is drawn as. */
const PERSON = "Person";

/** The type address of a person row. */
const ONLINE_ROW_TYPE = "t:Person";

export function OnlineStakeholderCard({ principal, placementMode }: OnlineStakeholderCardProps) {
  const host = useOnlineStakeholderCardHost();
  const { session, vaults, contentScope, openRecordFromList } = host.useShell();
  const qc = useQueryClient();
  const holder = session?.principal ?? null;
  const ownVaultId = ownVaultIdOf({ reach: contentScope.reach, vaults, sessionVaultEntity: session?.vault?.entity ?? null });
  const ownVault = vaults.find((v) => v.vaultId === ownVaultId) ?? null;

  // Their placements: the session's one circles read (0 requests more).
  const personCardQ = useQuery({
    queryKey: ["person-card", "principal", holder ?? "", ownVaultId ?? "", principal] as const,
    queryFn: () =>
      resolvePersonCard(
        { platform: personCardPlatform(), connections: () => sessionConnections(qc, holder!, ownVaultId!), canonical: canonicaliserFor(holder!) },
        { principal },
      ),
    enabled: !!holder && !!ownVaultId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Their card, read once per open, and ONLY for a person in the holder's circles (a refused `?ons=`
  // reads nothing about that person). The person is known, so the resolver is not asked; ⛔ nothing can be written through it.
  const placed = !!holder && principal !== holder && personCardQ.data?.how === "placement";
  const controller = useMemo(
    () =>
      placed && holder
        ? createOnlineCardController({
            platform: personCardPlatform(),
            subject: { uri: principal, holder, link: { state: "linked", target: principal } },
            canWrite: false,
            resolve: async () => ({ kind: "person", principal, entity: principal }),
            writeLink: async () => {
              throw new Error("An online stakeholder's card is read only.");
            },
          })
        : null,
    [principal, holder, placed],
  );
  useEffect(() => () => controller?.dispose(), [controller]);
  const state = useOnlineCardState(controller);
  const theirs = state?.online.status === "ready" ? state.online.card : null;
  const theirName = theirs ? cardName(theirs) : null;


  // The person kind's fields, in the card's order (the session's card vocabulary: no read of its own).
  const cardVocab = useQuery(stakeholderCardVocabularyQuery(host.vocabulary));
  const stakeholder = stakeholderCardState(ONLINE_ROW_TYPE, { data: cardVocab.data, error: cardVocab.error, pending: cardVocab.isPending });
  const fields = stakeholder.state === "ready" ? stakeholder.fields : [];
  const fieldOrder = stakeholder.state === "ready" ? stakeholder.kind.fields : [];
  const labelFor = useOnlineCardLabelFor(fields);
  const photoKeys = host.photoReadKeysSync().map((k) => k.replace(/^a:/, ""));
  // Every group of their card is its own group here (the person has no record of the holder's to place it in); the photo is the
  // header's picture, ⛔ not a row.
  const groupOf = () => null;
  const skip = (g: OneCardGroup) => photoKeys.includes(bareForm(g.field));
  // Nickname sits directly under the family name. Found the same way the record card finds those terms.
  const familyField = fieldOfTerm(fields, "familyName");
  const nicknameField = fieldOfTerm(fields, "nickname");
  const fi = familyField ? fieldOrder.findIndex((f) => f.term === familyField.term) : -1;
  const ni = nicknameField ? fieldOrder.findIndex((f) => f.term === nicknameField.term) : -1;
  const positionOfTerm = (term: string | null | undefined) => {
    const i = fieldOrder.findIndex((f) => f.term === term);
    if (i < 0) return Number.MAX_SAFE_INTEGER;
    // Both terms are in the kind: nickname takes the slot just after family. The sorts subtract, so the fraction stands.
    if (fi >= 0 && ni >= 0 && termName(term) === "nickname") return fi + 0.5;
    return i;
  };
  const order = (g: OneCardGroup) => positionOfTerm(g.term);
  // Each field is its own card (`groupOf` is null), so placeOneCard's within-group sort never pairs them.
  // The merge walks this list, and that walk is the card order. Same positions: nickname at fi+0.5, every other field at its index.
  const shownFieldOrder = fi >= 0 && ni >= 0 ? [...fieldOrder].sort((a, b) => positionOfTerm(a.term) - positionOfTerm(b.term)) : fieldOrder;

  // "+ Add your own": the create in the holder's own vault, then the card's own link door, then open the new record.
  // ONE create per press, also for two presses in the same task: the guard is a ref (a state update
  // would only be seen on the next render).
  const busy = useRef(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const canAdd = !!holder && !!ownVault && ownVault.modes.includes("write") && !!cardVocab.data?.fieldSets;
  const addOwn = async (name?: string) => {
    if (!canAdd || busy.current) return;
    busy.current = true;
    setAdding(true);
    setAddError(null);
    try {
      // ⛔ Never a second local record of a person the holder already holds, and ⛔ never
      // another holder's or a deleted record. First the record that is the person's row on THIS holder's screen now (no request),
      // unless it was deleted; else the store's find over every held vault (the list's own door: per holder, deleted and ended records
      // left out). A check that could not be made makes nothing (⛔ never a second record on a guess).
      const onScreen = screenRecordLinkedTo(holder!, principal);
      const loaded = onScreen && !isDeletedLinkedRecord(onScreen) ? onScreen : null;
      let found: Awaited<ReturnType<typeof linkedRecordsOf>> | null = null;
      if (!loaded) {
        try {
          found = await linkedRecordsOf(host.doors, holder!, heldVaultsOwnFirst(vaults, ownVaultId), [principal]);
        } catch {
          setAddError(CHECK_FAILED);
          return;
        }
      }
      // The person's row is their NEWEST linked record; a cold deep link opens the same one.
      const existing = loaded ?? (found ? newestLinkedId(found.map((f) => idFromUri(f.record.recordId))) : null);
      if (existing) {
        host.refreshOnlineStakeholders();
        openRecordFromList(existing);
        return;
      }
      const fieldSets = cardVocab.data!.fieldSets!;
      const kind = recordableKinds(fieldSets).find((k) => k.name === PERSON);
      if (!kind) throw new Error("The person kind is not known yet, so a card cannot be made now.");
      const reading = await qc.fetchQuery(pickerReadingQuery(fieldSets) as never);
      const wantedName = (name ?? theirName ?? "").trim();
      // One tag rule, the platform's: the package's create gives no tag and takes none. The platform makes the record's tag when it
      // creates it, so there is no tag to try, no "taken" form to look up again and no second create. The duplicate guard is the find above
      // (the person's row on screen, else the store's find over every held vault): a person the holder already holds opens, nothing is made.
      let made: Awaited<ReturnType<typeof recordPerson>>;
      try {
        made = await recordPerson(
          host.person,
          { reading: reading as never, queryClient: qc },
          { vault: ownVault!, vaults, agent: holder!, kind, name: wantedName, boxes: [], values: {} },
        );
      } catch (e) {
        // The card WAS written and a later step failed. This act's writes are removed first, newest first.
        if (e instanceof PartialCreateError) {
          if ((await removeWritten(e.written)).size > 0) {
            setAddError(REMOVE_FAILED(wantedName));
            return;
          }
          setAddError(SAVE_FAILED);
          return;
        }
        throw e;
      }
      const id = idFromEntityUri(made.record);
      const entityUri = /^https?:\/\//.test(made.record) ? made.record : `${made.vaultId}/e/${id}`;
      // The record and its link are one act. The link is tried twice; when it cannot be made, the new
      // record is removed again (⛔ never an unlinked copy of the person), and the card says what happened.
      let linked = false;
      for (let attempt = 0; attempt < 2 && !linked; attempt++) {
        const link = createOnlineCardController(
          onlineCardDeps({ record: { id, entityUri }, vaultId: made.vaultId, holder: holder!, canWrite: true, link: { state: "none" }, onLinkChanged: () => {} }),
        );
        try {
          await link.confirmLink({ principal });
          linked = !link.getState().error && link.getState().link.state === "linked";
        } catch {
          linked = false;
        } finally {
          link.dispose();
        }
      }
      if (!linked) {
        // The record AND its tag go, so "Nothing was kept" is true and the same name can be saved again.
        const left = await removeWritten(made.tagHandle ? [entityUri, made.tagHandle] : [entityUri]);
        const shown = (name ?? theirName ?? "").trim();
        setAddError(left.has(entityUri) ? LINK_FAILED_KEPT(shown) : left.size > 0 ? LINK_FAILED_TAG_KEPT(shown) : LINK_FAILED_REMOVED);
        forgetLinkedFinds();
        await afterRecordPerson(host.person, qc, made).catch(() => undefined);
        host.refreshOnlineStakeholders();
        return;
      }
      forgetLinkedFinds();
      await afterRecordPerson(host.person, qc, made);
      host.refreshOnlineStakeholders();
      openRecordFromList(id);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      setAdding(false);
    }
  };

  const shownName = theirName ?? "";
  const addControl = canAdd ? (
    <div className="flex flex-col gap-1">
      <AddYourOwnButton noun="card" onPress={() => void addOwn()} disabled={adding} />
      {addError ? (
        <p role="alert" className="text-[13px] text-[var(--warn)]" data-testid="online-stakeholder-add-error">
          {addError}
        </p>
      ) : null}
    </div>
  ) : null;
  // A card only for a person in the signed-in holder's circles (the placements the
  // session's one circles read holds). Anything else (a stranger, a foreign or broken address, the holder himself, an old link carried
  // over a sign-in) shows nothing and offers nothing.
  if (!holder || principal === holder || personCardQ.data?.how !== "placement") {
    // Once the answer is in, a refused card says so in one plain line (⛔ a blank pane).
    // Nothing more is said or offered: who the person is stays unread.
    if (!holder || personCardQ.isPending || personCardQ.isFetching) return null;
    return (
      <div className="h-full p-4" data-placement={placementMode}>
        <p className="text-[13px] text-[var(--ink-soft)]" data-testid="online-stakeholder-refused">
          {NOT_A_STAKEHOLDER}
        </p>
      </div>
    );
  }
  // Beside the Card view the pane holds the actions, as it does for a record (the card itself is in the centre): for an online
  // stakeholder there is nothing to change (their card is theirs; "+ Add your own" is on the card).
  if (placementMode === "actions") {
    return (
      <div className="h-full flex flex-col gap-3 p-4" data-placement={placementMode} data-testid="online-stakeholder-actions">
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">Actions</h2>
        <p className="text-[12.5px] uppercase tracking-wide text-[var(--ink-faint)]">{shownName ? `${shownName} · ${PERSON}` : PERSON}</p>
        <p className="text-[13px] text-[var(--ink-soft)]">Their online card is theirs: nothing of it can be changed here.</p>
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col" data-placement={placementMode} data-testid="online-stakeholder-card">
      {ownVault ? (
        <StakeholderContactHeader
          holderVault={ownVault}
          ownVaultId={ownVaultId}
          viewer={holder}
          principal={holder}
          canEdit={false}
          record={{ id: principal, entityUri: null, typeUri: ONLINE_ROW_TYPE }}
          ownName={shownName}
          kind={stakeholder.state === "ready" ? stakeholder.kind : { kind: ONLINE_ROW_TYPE, ancestors: [] }}
          kindLabel={PERSON}
          personCard={personCardQ.data ?? null}
          onlineCard={controller}
          ownPicture={null}
        />
      ) : null}
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col gap-4">
        <OneCardBody
          controller={controller}
          labelFor={labelFor}
          searchName={shownName}
          canWrite={false}
          fieldOrder={shownFieldOrder}
          servedFacts={{}}
          skillPredicate={fieldOfTerm(fields, "skill")?.writeKey ?? null}
          groupOf={groupOf}
          skip={skip}
          order={order}
          personCard={personCardQ.data ?? null}
        >
          <OneCardOwnGroups labelFor={labelFor} />
        </OneCardBody>
        {addControl}
      </div>
    </div>
  );
}
