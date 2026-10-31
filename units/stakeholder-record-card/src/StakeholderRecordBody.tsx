// The card of a person the holder keeps a record of: Edit and +, the groups in their order, autosave with the record's version, the link to
// their online card. The body of the entry `StakeholderRecordCard`: it takes the record, the door and the shell already read.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { bareForm } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { OneCardGroup } from "@kaigilb/gilbplatformcode-one-card-merge";
import { ContactRows } from "@kaigilb/gilbplatformcode-contact-rows";
import { entityDisplayName, isTempId, refreshRecordInCaches } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { openTypeNameSlug } from "@kaigilb/gilbplatformcode-entity-name";
import { resolveType, type FieldSpec } from "@kaigilb/gilbplatformcode-record-types";
import { prefetchVedaLabels, useVedaTypeLabel } from "@kaigilb/gilbplatformcode-veda-labels";
import { clearFreshlyCreated, consumeFreshlyCreated } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { CarrierRenameRefusedError, rebaseOnStored, useUpdateRecord } from "@kaigilb/gilbplatformcode-record-update";
import { createdInVaultOf, rememberVaultOf } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { uriTail } from "@kaigilb/gilbplatformcode-lws-relations";
import { readRecord, RecordConflictError, RecordForbiddenError, type BaseRecord, type RecordFacts } from "@kaigilb/gilbplatformcode-lws-records";
import { ENTITY_READ_ONLY_REASON, isEntityWriteDenied, markEntityWriteDenied, useEntityCanWrite } from "@kaigilb/gilbplatformcode-entity-write-access";
import { recordWriteAllowed } from "@kaigilb/gilbplatformcode-record-write";
import {
  cardPartyName,
  extraFactEditable,
  factsTheCardKeeps,
  fieldOfTerm,
  legacyShownInNameBox,
  partyNameOf,
  registryFieldsBesideName,
  splitSetFields,
  stakeholderCardState,
  termName,
} from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { stakeholderCardVocabularyQuery, type StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { attributeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { StakeholderSetFields, isChannelField, setFieldHasContent, setFieldKind } from "@kaigilb/gilbplatformcode-stakeholder-set-fields";
import { CardGroup, CardSection, CardTopSlots, type CardSlots } from "@kaigilb/gilbplatformcode-card-group";
import { CardModeActions, CardModeHint, CardModeProvider, useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { headerLayout, useElementWidth } from "@kaigilb/gilbplatformcode-header-layout";
import { contactCardSlots } from "@kaigilb/gilbplatformcode-contact-card-slots";
import { kindVaultOf } from "@kaigilb/gilbplatformcode-kind-relation";
import { joinPersonName, ownVaultIdOf } from "@kaigilb/gilbplatformcode-plan-self-source";
import { AddInformationButton, AddInformationSheet } from "@kaigilb/gilbplatformcode-add-information";
import { PersonFieldRow } from "@kaigilb/gilbplatformcode-person-field-row";
import {
  ONLINE_CARD_LINK_KEY,
  OneCardBody,
  OneCardOwnGroups,
  useOnlineCardController,
  useOnlineCardLabelFor,
  usePersonCard,
} from "@kaigilb/gilbplatformcode-one-card";
import { OwnFieldRow } from "@kaigilb/gilbplatformcode-one-card-context";
import { PersonPlacementChips, StakeholderContactHeader } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { OtherLinkedRecords } from "@kaigilb/gilbplatformcode-other-linked-records";
import { OwnCardBand, useOwnCard } from "@kaigilb/gilbplatformcode-own-card-state";
import { RelatedChildren } from "@kaigilb/gilbplatformcode-related-children";
import { isEntityRefValue } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { photoRefFromFacts } from "@kaigilb/gilbplatformcode-photo-term";
import { personCardOrder, personSectionOrder, splitPersonName } from "@kaigilb/gilbplatformcode-person-name";
import { editorFacts, extraKeysFromFacts, linkTargetOf, sameEditorFacts, effectiveFields } from "./recordFacts";
import { ExtraFact } from "./ExtraFact";
import { FieldEditor } from "./FieldEditor";
import { unambiguousVaultOfRecord } from "./unambiguousVaultOfRecord";
import { useStakeholderRecordCardHost, type StakeholderRecordCardShell } from "./stakeholderRecordCardHost";

/** How long typing settles before a keystroke autosaves on its own (blur / leave still
 * flush immediately — this is the belt-and-braces "never lose a keystroke" floor). */
const AUTOSAVE_DEBOUNCE_MS = 600;

/** The master's term for who recorded a record (`a:statedBy`): not drawn on the card. */
const STATED_BY_TERM = "statedBy";

/** The placements of the record detail this card was cut from. The unit draws the `content` one only. */
type RecordDetailPlacement = "full" | "content" | "actions";

/** A fact slug -> a spaced, human-first label (`taskStatus` -> `Task status`). Pure display formatting. */
function humanizeSlug(slug: string): string {
  const spaced = slug.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : slug;
}

/**
 * The Record group was opened from "+ Add information" this edit. The chooser adds a whole group, not one field
 * (`CardMode.opened`); nickname, which is not its own group, follows that open into the Name group.
 */
function RecordGroupOpenedSync({ onChange }: { onChange: (opened: boolean) => void }) {
  const mode = useCardMode();
  const opened = mode.managed && mode.opened.has("record");
  useEffect(() => {
    onChange(opened);
  }, [opened, onChange]);
  return null;
}

export function StakeholderRecordBody({
  record,
  vaultId,
  writeGuard,
  identityKeys,
  slots,
}: {
  slots?: CardSlots;
  record: BaseRecord;
  vaultId: string;
  /** Whether this pane may write back at all, and why not when it may not. Every editing
   * affordance in here is gated on it: fields go read-only and the delete control is
   * ABSENT rather than disabled, with the reason stated above the fields. */
  writeGuard: StakeholderRecordCardShell["writeGuard"];
  /** Principal + short WebID — match framed directReader/directWriter. */
  identityKeys: readonly string[];
}) {
  const host = useStakeholderRecordCardHost();
  const { openRecordFromList, session, vaults: shellVaults, contentScope } = host.useShell();
  // The card is the `content` placement of the record detail: the only one this unit draws.
  const placementMode = "content" as RecordDetailPlacement;
  const qc = useQueryClient();
  // H14. Every open from inside the card hands the host the TARGET's vault when it is sure (the host reads it back with `knownVaultOf` and passes it
  // on as the record's door); otherwise the id alone is opened and the opened card says it does not know the vault. Never the card's own vault.
  // A sure vault is remembered unconditionally (it replaces an older, different one, which the host would otherwise open with); an unsure one stores nothing.
  //  - `uri`: the target's own address; sure when it names a vault the holder holds and none is nested under it (`unambiguousVaultOfRecord`).
  //  - `vaultId`: the vault a screen row names; sure only when it is one of the shell's vaults (trailing `/` ignored).
  const openWithVault = (id: string, hint?: { uri?: string | null; vaultId?: string | null }) => {
    const held = shellVaults ?? [];
    const strip = (v: string) => v.replace(/\/+$/, "");
    const named = hint?.vaultId ? strip(hint.vaultId) : "";
    const ofRow = named ? (held.find((v) => v.vaultId && strip(v.vaultId) === named)?.vaultId ?? null) : null;
    const sure = ofRow ?? unambiguousVaultOfRecord(hint?.uri, held);
    if (sure) rememberVaultOf(qc, id, sure);
    openRecordFromList(id);
  };
  const openByAddress = (id: string, uri?: string) => openWithVault(id, { uri });
  const [photoReadKeysNow, setPhotoReadKeysNow] = useState<readonly string[]>(() => host.photoReadKeysSync());
  useEffect(() => {
    let alive = true;
    void host.photoReadKeys().then((k) => alive && setPhotoReadKeysNow(k));
    return () => {
      alive = false;
    };
  }, []);
  const showContent = placementMode === "full" || placementMode === "content";
  const spec = resolveType(record.typeUri);
  const vedaTypeLabel = useVedaTypeLabel(record.typeUri);
  const registryFields = spec?.fields;

  const registryOwnsFields = (registryFields?.length ?? 0) > 0;
  const cardVocab = useQuery(
    { ...stakeholderCardVocabularyQuery(host.vocabulary), enabled: !registryOwnsFields } as UseQueryOptions<StakeholderCardVocabulary>,
  );
  // Memoised: `fields` below is derived from it, and effects keyed on `fields` must not re-run on
  // every render.
  const stakeholder = useMemo(
    () =>
      registryOwnsFields
        ? ({ state: "not-a-stakeholder-kind" } as const)
        : (() => {
            const reading = { data: cardVocab.data, error: cardVocab.error, pending: cardVocab.isPending };
            const own = stakeholderCardState(record.typeUri, reading);
            return own;
          })(),
    [registryOwnsFields, record.typeUri, cardVocab.data, cardVocab.error, cardVocab.isPending],
  );
  const stakeholderLocked = stakeholder.state === "fields-not-known";
  const setSplit = useMemo(
    () => (stakeholder.state === "ready" ? splitSetFields(stakeholder.fields, record.facts) : null),
    [stakeholder, record.facts],
  );
  const setFactKeys = useMemo(
    () => new Set(stakeholder.state === "ready" ? stakeholder.fields.flatMap((f) => f.factKeys) : []),
    [stakeholder],
  );
  const party = useMemo(
    () =>
      cardPartyName(
            stakeholder,
            cardVocab.data,
            record.facts,
            setSplit?.editable.map((f) => f.slug!) ?? [],
            spec?.fieldsFrom === "stakeholder-package",
          ),
    [stakeholder, cardVocab.data, record.facts, setSplit, spec?.fieldsFrom],
  );
  const partyNever = useMemo(
    () => (party.rule ? new Set<string>([...party.rule.keys.legacy, "title"]) : null),
    [party.rule],
  );
  // The Name box's slug: the party's own name slot; for a party whose slot is not known yet, none
  // (the name is shown, not edited); otherwise the registry type's own nameField, or the canonical
  // `a:label`, falling back to a legacy `a:title` only for a record that actually carries one.
  const nameSlug = party.nameSlot ?? spec?.nameField ?? openTypeNameSlug(record.facts);
  const nameBox = party.rule && !party.nameSlot ? null : nameSlug;
  const setFieldSpecs = useMemo<readonly FieldSpec[] | null>(() => {
    return setSplit?.editable.map((f) => ({ slug: f.slug!, label: f.label ?? f.slug!, kind: "text" as const })) ?? null;
  }, [stakeholder, setSplit]);
  const cardRegistryFields = useMemo(
    () => registryFieldsBesideName(registryFields, spec?.nameField, party.nameSlot),
    [party.nameSlot, spec?.nameField, registryFields],
  );
  const fields = useMemo(
    () => setFieldSpecs ?? (nameBox ? effectiveFields(cardRegistryFields, nameBox) : cardRegistryFields),
    [setFieldSpecs, cardRegistryFields, nameBox],
  );
  const setFieldsAll = stakeholder.state === "ready" ? stakeholder.fields : [];
  const givenSlug = fieldOfTerm(setFieldsAll, "givenName")?.slug ?? null;
  const familySlug = fieldOfTerm(setFieldsAll, "familyName")?.slug ?? null;
  const nicknameSlug = fieldOfTerm(setFieldsAll, "nickname")?.slug ?? null;
  const emailField = fieldOfTerm(setFieldsAll, "email");
  // It4: MyNet's Phone and Social sections, found by term as email is (`a/phone`, `a/account`).
  const phoneField = fieldOfTerm(setFieldsAll, "phone");
  const accountField = fieldOfTerm(setFieldsAll, "account");
  // It5: MyNet's Skills section, found by term as the others are (`a/skill`).
  const skillField = fieldOfTerm(setFieldsAll, "skill");
  // It6: MyNet's Address section, found by term (`a/postalAddress`, the master's "Postal Address").
  const addressField = fieldOfTerm(setFieldsAll, "postalAddress");
  // It7: MyNet's Employment section, found by term (`a/employment`, the master's "Employment").
  const employmentField = fieldOfTerm(setFieldsAll, "employment");
  const contactLangField = fieldOfTerm(setFieldsAll, "contactLanguage");
  const contactLangSlug = contactLangField?.slug ?? contactLangField?.factKeys[0] ?? null;
  const personNames =
    !!givenSlug && !!familySlug && fields.some((f) => f.slug === givenSlug) && fields.some((f) => f.slug === familySlug);
  const logoField = fieldOfTerm(setFieldsAll, "logo");
  const orgCard = !personNames && stakeholder.state === "ready" && !!logoField;
  const partyCard = personNames || orgCard;
  const photoKeys = photoReadKeysNow.map((k) => k.replace(/^a:/, ""));
  const photoSlug = fields.find((f) => photoKeys.includes(f.slug))?.slug ?? null;
  const photoVaultId = (host.holdingVaultOf ?? createdInVaultOf)(qc, record.id) ?? vaultId ?? null;
  const photoVault = photoVaultId ? ((shellVaults ?? []).find((v) => v.vaultId === photoVaultId) ?? null) : null;
  const hasPhotoField = personNames && !!photoVault && !!photoSlug;
  const photoRefNow =
    (photoRefFromFacts(record.facts as Record<string, string>, { readKeys: photoReadKeysNow }) as string | null) ?? null;
  const showPhoto = !!photoVault && (hasPhotoField || !!photoRefNow);
  const contactSections = partyCard
    ? (
        [
          ["email", emailField],
          ["phone", phoneField],
          // It6: MyNet sites the Address card directly under Phone (`Profile.tsx`: "place it under Phone").
          ["address", addressField],
          ["social", accountField],
          ["skill", skillField],
          // It7: MyNet sites Employment after the sections and Skills (`Profile.tsx`: `<EmploymentCard>`
          // follows the Skills card, before My Note).
          ["employment", employmentField],
        ] as const
      ).flatMap(([kind, field]) => {
        const key = field ? (field.slug ?? field.factKeys[0] ?? null) : null;
        return field && key ? [{ kind, field, key }] : [];
      })
    : [];
  const sectionOf = (slug: string) => contactSections.find((c) => c.key === slug) ?? null;
  const isSectionField = (f: { term?: string; slug?: string | null }) =>
    contactSections.some((c) => f.term === c.field.term || (!!c.field.slug && f.slug === c.field.slug));
  const hasContactRows = contactSections.length > 0;
  const languagesShown = contactSections.some((c) => c.kind === "skill") && !!record.entityUri && !!host.renderLanguages;
  // MyNet's sidecar fact (the rows' labels, order and pairing): its spelling is the master's (type lookup).
  const [metaKey, setMetaKey] = useState<string | null>(null);
  useEffect(() => {
    if (!hasContactRows) return;
    let alive = true;
    void attributeSpelling("fieldMeta").then((k) => alive && setMetaKey(k));
    return () => {
      alive = false;
    };
  }, [hasContactRows]);
  const holdingVault = (host.holdingVaultOf ?? createdInVaultOf)(qc, record.id) ?? unambiguousVaultOfRecord(record.entityUri, shellVaults ?? []);
  const optimistic = isTempId(record.id);
  /** Live type not in the short registry — only name + free fields (expected after retype). */
  const isOpenType = !spec;

  const update = useUpdateRecord(vaultId);
  // Vault write + framed grant attrs + 403 pin (entity-share read ≠ write on same vault).
  const entityCanWrite = useEntityCanWrite(writeGuard.allowed, record, identityKeys);
  const ownCard = useOwnCard(record, photoVaultId, shellVaults ?? null);
  const ownCardLocked = ownCard.own || ownCard.pending;
  const canWrite = entityCanWrite && !ownCardLocked;
  const canEdit = canWrite && !stakeholderLocked;
  const onlineCard = useOnlineCardController({
    enabled: stakeholder.state === "ready" && personNames && !ownCardLocked,
    record,
    vaultId: photoVaultId,
    holder: session?.principal ?? null,
    canWrite: canEdit,
  });
  const onlineCardLabelFor = useOnlineCardLabelFor(stakeholder.state === "ready" ? stakeholder.fields : []);
  const holderOwnVaultId = ownVaultIdOf({ reach: contentScope.reach, vaults: shellVaults, sessionVaultEntity: session?.vault?.entity });
  const oneCardLinked = useSyncExternalStore(
    (l) => (onlineCard ? onlineCard.subscribe(l) : () => {}),
    () => onlineCard?.getState().link.state === "linked",
    () => onlineCard?.getState().link.state === "linked",
  );
  // Their nickname is a value of the Name group too (right after family), found by the field's term, as given and family are.
  const theirNickname = useSyncExternalStore(
    (l) => (onlineCard ? onlineCard.subscribe(l) : () => {}),
    () => {
      const online = onlineCard?.getState().online;
      if (online?.status !== "ready") return false;
      return online.card.fields.some((f) => termName(f.predicate) === "nickname" && f.value.trim() !== "");
    },
    () => false,
  );
  const personCard = usePersonCard({ controller: onlineCard, recordUri: record.entityUri ?? null, holder: session?.principal ?? null, ownVaultId: holderOwnVaultId });

  const [draft, setDraft] = useState<RecordFacts>(() => ({ ...record.facts }));
  // "+ Add information" → Record (the chooser opens a group, not one field). While that group is open this edit, an empty
  // nickname is drawn in the Name group. Cleared when edit mode is left (`CardMode.leave` drops `opened`).
  const [recordGroupOpened, setRecordGroupOpened] = useState(false);
  // Nickname joins the Name group (given, family, nickname) when it should be visible: the holder has a value, their
  // online card shows one, or the Record group was opened from "+ Add information". Otherwise it stays a Record field.
  const nicknameOwnText = !!nicknameSlug && (draft[nicknameSlug] ?? "").trim() !== "";
  const nicknameOwnVisible = nicknameOwnText || recordGroupOpened;
  const nicknameInName = personNames && !!nicknameSlug && (nicknameOwnVisible || theirNickname);
  const nicknameLead = nicknameInName && nicknameSlug && fields.some((f) => f.slug === nicknameSlug) ? nicknameSlug : null;
  const orderedFields =
    personNames && givenSlug && familySlug
      ? personCardOrder(fields, givenSlug, familySlug, [party.nameSlot, hasPhotoField ? photoSlug : null], nicknameLead)
      : fields;
  // MyNet's order: the names, then Email, Phone, Address, Social, Skills, Employment; the remaining fields follow.
  // An organization has one name box (orgSectionOrder); the person's lead is two names, or three when nickname leads.
  const sectionSpecs = contactSections.map((c) => ({ slug: c.key, label: c.field.label ?? c.key, kind: "text" as const }));
  const cardFields = hasContactRows
    ? personSectionOrder(orderedFields, sectionSpecs, nicknameLead)
    : orderedFields;
  const [notice, setNotice] = useState<string | null>(null);
  // Extra metadata keys the user adds (any node) — stored as bare fact slugs (a:<slug> on wire).
  // Seed from live facts so phone/etc. reappear after reload.
  const [extraKeys, setExtraKeys] = useState<string[]>(() =>
    extraKeysFromFacts(fields, record.facts),
  );
  const [attrLabels, setAttrLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const slugs = [...fields.map((f) => f.slug), ...extraKeys];
    if (slugs.length === 0) return;
    let live = true;
    void prefetchVedaLabels({ attrs: slugs }).then(({ attrs }) => {
      if (!live) return;
      const next: Record<string, string> = {};
      for (const [k, v] of attrs) next[k] = v;
      setAttrLabels(next);
    });
    return () => {
      live = false;
    };
  }, [fields, extraKeys]);
  const [wasFresh] = useState(() => consumeFreshlyCreated(record.id));
  const headerRef = useRef<HTMLDivElement>(null);
  const headerWidth = useElementWidth(headerRef);

  // Refs the leave-time flush reads so unmount / tab-hide / beforeunload capture the LATEST
  // draft even though those fire outside React's render (stale-closure guard).
  const draftRef = useRef(draft);
  const extraKeysRef = useRef(extraKeys);
  const dirtyRef = useRef(false);
  const recordRef = useRef(record);
  const fieldsRef = useRef(fields);
  const wasFreshRef = useRef(wasFresh);
  const mountedRef = useRef(true);
  const discardedRef = useRef(false);
  // Re-entrancy guard for flushSave: without this, a debounce-timer autosave and a field's
  // onBlur autosave can both be in flight at once (classic "finish typing right as you tab
  // away" timing). Both would read the SAME pre-save ETag and PUT concurrently — the first
  // succeeds and advances the vault's ETag, the second's now-stale If-Match 412s, surfacing a
  // false "changed elsewhere" notice even though nothing external touched the record. Fix:
  // a second call while one is in flight just flags `pendingRef` and returns; the in-flight
  // call loops once more afterward, reading the now-fresh recordRef/draftRef.
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const partyRuleRef = useRef(party.rule);
  const keepRef = useRef<string[]>([]);
  draftRef.current = draft;
  extraKeysRef.current = extraKeys;
  fieldsRef.current = fields;
  partyRuleRef.current = party.rule;
  keepRef.current = [
    ...factsTheCardKeeps(stakeholder, record.facts),
    ONLINE_CARD_LINK_KEY,
    ...(hasPhotoField ? photoKeys : []),
    ...contactSections.map((c) => c.key),
    ...(hasContactRows && metaKey ? [metaKey] : []),
    // Structured lines and Intent's title/about are shown or hidden, never written as text.
  ];
  // recordRef is intentionally NOT resynced here (every render, incl. ones triggered purely
  // by internal state like a keystroke or a mutation status flip) — see the effect below.

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (savingRef.current) return;
    if (dirtyRef.current && recordRef.current.id === record.id) {
      const keptEtag = recordRef.current.etag;
      recordRef.current = {
        ...record,
        etag: keptEtag ?? record.etag,
      };
      return;
    }
    recordRef.current = record;
    const nextExtras = extraKeysFromFacts(fields, record.facts);
    setExtraKeys((prev) => {
      const merged = [...new Set([...prev, ...nextExtras])];
      return merged.length === prev.length && merged.every((s, i) => s === prev[i]) ? prev : merged;
    });
    setDraft((prev) => {
      const keys = [
        ...fields.map((f) => f.slug),
        ...extraKeysFromFacts(fields, { ...prev, ...record.facts }),
      ];
      return sameEditorFacts(prev, record.facts, keys) ? prev : { ...record.facts };
    });
  }, [record, fields]);

  // Persist the current draft iff it differs from vault truth. NEVER discards, NEVER blocks
  // the UI (optimistic PUT/If-Match, no spinner). A 412 reconciles + notices; a hard error
  // rolls the cache back and notices.
  const flushSave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (discardedRef.current) return;
    // No write affordance — do not autosave (vault read-only or entity 403-pin).
    if (!recordWriteAllowed(writeGuard.allowed, recordRef.current, identityKeys, isEntityWriteDenied(recordRef.current.id))) return;
    // Coalesce with an already-in-flight save instead of racing it (see savingRef comment
    // above) — flag a re-run and let that save's loop pick up the latest draft/ETag.
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    try {
      do {
        pendingRef.current = false;
        const rec = recordRef.current;
        const next = editorFacts(fieldsRef.current, draftRef.current, extraKeysRef.current);
        const keys = Object.keys(next);
        if (sameEditorFacts(next, rec.facts, keys)) {
          dirtyRef.current = false;
          continue;
        }
        dirtyRef.current = false;
        try {
          const { etag } = await update.mutateAsync({
            record: rec,
            facts: next,
            party: partyRuleRef.current ?? undefined,
            keep: keepRef.current,
          });
          // Update the ref SYNCHRONOUSLY on resolve — don't wait for the query-cache write to
          // flow back through a re-render, or a queued re-run (below) could still read the
          // pre-save ETag and 412 against its own just-completed sibling.
          recordRef.current = { ...rec, facts: next, etag };
          wasFreshRef.current = false;
          if (mountedRef.current) setNotice(null);
        } catch (e) {
          if (!mountedRef.current) return;
          if (e instanceof CarrierRenameRefusedError) {
            const rolled = { ...rec.facts };
            draftRef.current = rolled;
            dirtyRef.current = false;
            setDraft(rolled);
            setNotice(e.message);
            pendingRef.current = false;
            break;
          }
          if (e instanceof RecordForbiddenError) {
            // Per-entity read-only (entity share): pin session so Access + fields close.
            markEntityWriteDenied(rec.id);
            const rolled = { ...rec.facts };
            draftRef.current = rolled;
            dirtyRef.current = false;
            setDraft(rolled);
            setNotice(ENTITY_READ_ONLY_REASON);
            pendingRef.current = false;
            break;
          }
          if (e instanceof RecordConflictError) {
            try {
              const fresh = await readRecord(rec.id, rec.entityUri ?? null);
              if (fresh?.etag) {
                const { facts: rebased, conflicts } = rebaseOnStored(rec.facts ?? {}, next, fresh.facts);
                const { etag } = await update.mutateAsync({
                  record: { ...rec, ...fresh, etag: fresh.etag },
                  facts: rebased,
                  party: partyRuleRef.current ?? undefined,
                  keep: keepRef.current,
                  skipEmpty: true,
                });
                recordRef.current = { ...fresh, facts: rebased, etag };
                wasFreshRef.current = false;
                // Show what the store holds now; a field edited since this save read the editor
                // keeps the person's newer value (and is saved by the loop's next turn).
                const nowDraft = draftRef.current;
                const shown: RecordFacts = { ...nowDraft };
                for (const k of Object.keys(rebased)) {
                  if ((nowDraft[k] ?? "") === (next[k] ?? "") || !(k in nowDraft)) shown[k] = rebased[k]!;
                }
                draftRef.current = shown;
                if (mountedRef.current) {
                  setDraft(shown);
                  setNotice(
                    conflicts.length > 0
                      ? "This record changed elsewhere. The latest is shown; your change to a field that was also changed there was not saved."
                      : null,
                  );
                }
                continue;
              }
            } catch (retryErr) {
              if (retryErr instanceof RecordForbiddenError) {
                markEntityWriteDenied(rec.id);
                const rolled = { ...rec.facts };
                draftRef.current = rolled;
                dirtyRef.current = false;
                setDraft(rolled);
                setNotice(ENTITY_READ_ONLY_REASON);
                pendingRef.current = false;
                break;
              }
              /* fall through to honest notice */
            }
            dirtyRef.current = true;
            setNotice(
              "This record changed elsewhere — reloaded the latest. Re-apply your edit if needed.",
            );
          } else {
            dirtyRef.current = true; // leave it dirty so a later blur/leave retries
            setNotice("Couldn't save — your change was rolled back. Try again.");
          }
        }
      } while (pendingRef.current);
    } finally {
      savingRef.current = false;
    }
  }, [update, writeGuard.allowed, identityKeys]);

  // Leave-time: always try to save pending edits. Never auto-DELETE an empty +New —
  // that false-positive path made notes "pop then vanish" (remount / list churn).
  // Empty Untitled drafts stay on the vault until the user hits Delete.
  const flushFinal = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (discardedRef.current) return;
    if (wasFreshRef.current) clearFreshlyCreated(recordRef.current.id);
    void flushSave();
  }, [flushSave]);

  // Keep the newest closures reachable from the once-registered listeners below.
  const flushSaveRef = useRef(flushSave);
  const flushFinalRef = useRef(flushFinal);
  flushSaveRef.current = flushSave;
  flushFinalRef.current = flushFinal;

  // Never lose a keystroke: tab-hide + page-unload + unmount all flush pending saves.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushSaveRef.current();
    };
    const onBeforeUnload = () => {
      void flushSaveRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushFinalRef.current();
    };
  }, []);

  useEffect(() => {
    if (!wasFresh) return;
    const el = fieldRefs.current[nameSlug];
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
    // Mount-only: the fresh flag is a one-shot for this record's first open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFieldChange = (slug: string, value: string) => {
    dirtyRef.current = true;
    // First real keystroke ends the "fresh create" auto-focus window for later opens.
    clearFreshlyCreated(record.id);
    if (value.trim()) wasFreshRef.current = false;
    if (personNames && givenSlug && familySlug && party.nameSlot && (slug === givenSlug || slug === familySlug)) {
      const shown = shownPersonNames();
      const given = slug === givenSlug ? value : shown.given;
      const family = slug === familySlug ? value : shown.family;
      const nameSlot = party.nameSlot;
      setDraft((d) => ({ ...d, [givenSlug]: given, [familySlug]: family, [nameSlot]: joinPersonName(given, family) }));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void flushSaveRef.current(), AUTOSAVE_DEBOUNCE_MS);
      return;
    }
    setDraft((d) => ({ ...d, [slug]: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void flushSaveRef.current(), AUTOSAVE_DEBOUNCE_MS);
  };

  const commitField = (slug: string, value: string) => {
    onFieldChange(slug, value);
    draftRef.current = { ...draftRef.current, [slug]: value };
    void flushSaveRef.current();
  };

  // Tab (native) and Enter (in the name field) advance name → next field.
  const advanceFromName = () => {
    const idx = cardFields.findIndex((f) => f.slug === (personNames ? givenSlug : nameSlug));
    const next = cardFields[idx + 1];
    if (next) fieldRefs.current[next.slug]?.focus();
  };


  // The party's name as the card shows it, from the draft, so the title follows an edit.
  const partyName = party.rule
    ? partyNameOf(draft, stakeholder.state === "ready" ? (cardVocab.data?.fieldSets?.kinds.predicates ?? null) : null)
    : null;
  const displayTitle = partyName ?? entityDisplayName(draft, { nameField: nameSlug });
  /**
   * The given and family name the boxes show: what is stored (or being typed), else — for a record
   * made with one name only, such as "Jason Test" from "+ New" — that name split as MyNet splits it
   * (first word / the rest). Nothing is written until the person edits a box.
   */
  function shownPersonNames(): { given: string; family: string } {
    const given = givenSlug ? (draft[givenSlug] ?? "") : "";
    const family = familySlug ? (draft[familySlug] ?? "") : "";
    if (given.trim() || family.trim()) return { given, family };
    return splitPersonName(partyName);
  }
  const nameBoxShowsLegacy = (slug: string): boolean => legacyShownInNameBox(slug, party, draft);

  /** What a plain field of the card shows: the person's names (given and family, split from the name where the card holds only the whole),
   *  the party's own name slot, or the draft. The one reading for the box and for "is there anything to show". */
  const fieldValue = (f: { slug: string }): string =>
    personNames && f.slug === givenSlug
      ? shownPersonNames().given
      : personNames && f.slug === familySlug
        ? shownPersonNames().family
        : f.slug === party.nameSlot && draft[f.slug] === undefined
          ? (partyName ?? "")
          : (draft[f.slug] ?? "");

  const termOfSlug = (slug: string) => setFieldsAll.find((c) => c.slug === slug)?.term ?? null;
  const oneCardOwnFacts = ((): Record<string, unknown> | null => {
    const served = record.served?.facts as Record<string, unknown> | undefined;
    if (!served) return null;
    if (!personNames || !givenSlug || !familySlug) return served;
    const held = (k: string) => {
      const v = served[k];
      return Array.isArray(v) ? v.some((x) => String(x ?? "").trim() !== "") : typeof v === "string" ? v.trim() !== "" : v != null;
    };
    if (held(givenSlug) || held(familySlug)) return served;
    const shown = shownPersonNames();
    const add: Record<string, string> = {};
    if (shown.given.trim()) add[givenSlug] = shown.given.trim();
    if (shown.family.trim()) add[familySlug] = shown.family.trim();
    return Object.keys(add).length ? { ...served, ...add } : served;
  })();
  /** Given and family, plus nickname when it belongs in the Name group. An organization keeps its one name box. */
  const isNameBox = (f: { slug: string }) =>
    personNames ? f.slug === givenSlug || f.slug === familySlug || (nicknameInName && f.slug === nicknameSlug) : orgCard && f.slug === nameSlug;
  /** The card's group an own plain field is drawn in (the name boxes, the time zone, the Record group; Details off a party card). */
  const ownKindOf = (f: { slug: string }) =>
    isNameBox(f) ? "name" : !partyCard ? "details" : termName(setFieldsAll.find((c) => c.slug === f.slug)?.term) === "timeZone" ? "time-zone" : "record";
  const oneCardGroupOf = (g: OneCardGroup): string | null => {
    if (!g.term) return null;
    const cf = setFieldsAll.find((c) => c.term === g.term);
    if (!cf) return null;
    const section = contactSections.find((c) => c.field.term === g.term);
    if (section) return section.kind;
    if (!cf.slug || !cardFields.some((f) => f.slug === cf.slug)) return null;
    if (languagesShown && contactLangSlug && cf.slug === contactLangSlug) return null;
    return ownKindOf({ slug: cf.slug });
  };
  const oneCardOrder = (g: OneCardGroup) => {
    const slug = setFieldsAll.find((c) => c.term === g.term)?.slug;
    const i = slug ? cardFields.findIndex((f) => f.slug === slug) : -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const oneCardSkip = (g: OneCardGroup) =>
    (!!photoSlug && !!g.term && g.term === termOfSlug(photoSlug)) || photoKeys.includes(bareForm(g.field));

  /** One field of the card, drawn by its own component: a MyNet section (found by term), the plain row, or the legacy box. */
  const renderCardField = (f: FieldSpec) => {
    const section = sectionOf(f.slug);
    return section?.kind === "address" ? (
      record.entityUri && host.renderAddress ? (
        <Fragment key="address-rows">
          {host.renderAddress({
            title: section.field.label ?? attrLabels[section.key] ?? section.key,
            legacyText: record.facts[section.key] ?? "",
            vaultId: photoVaultId,
            recordEntityUri: record.entityUri,
            principal: session?.principal ?? null,
            canEdit,
          })}
        </Fragment>
      ) : null
    ) : section?.kind === "employment" ? (
      record.entityUri && host.renderEmployment ? (
        <Fragment key="employment-rows">
          {host.renderEmployment({
            title: section.field.label ?? attrLabels[section.key] ?? section.key,
            recordId: record.id,
            recordEntityUri: record.entityUri,
            vaultId: photoVaultId,
            edgeKey: section.key,
            servedEdges: record.served ? record.served.facts[section.key] : record.facts[section.key],
            servedReady: !!record.served || (record as { hydrated?: boolean }).hydrated !== false,
            canEdit,
            onSaved: () =>
              void refreshRecordInCaches(qc, photoVaultId ?? vaultId ?? "", { id: record.id, entityUri: record.entityUri ?? null }),
          })}
        </Fragment>
      ) : null
    ) : section?.kind === "skill" && record.entityUri ? (
      <div key="skill-rows" className="flex flex-col gap-4">
        {host.renderSkillsAndInterests ? (
          host.renderSkillsAndInterests({
            skills: {
              vaultId: photoVaultId,
              principal: session?.principal ?? null,
              recordId: record.id,
              recordEntityUri: record.entityUri,
              title: section.field.label ?? attrLabels[section.key] ?? section.key,
              valueKey: section.key,
              metaKey,
              etag: record.etag ?? null,
              served: {
                values: record.served?.facts[section.key] ?? record.facts[section.key],
                meta: metaKey ? record.served?.facts[metaKey] : undefined,
              },
              canEdit,
              onSaved: () =>
                void refreshRecordInCaches(qc, photoVaultId ?? vaultId ?? "", { id: record.id, entityUri: record.entityUri ?? null }),
            },
            interests: {
              vaultId: photoVaultId,
              principal: session?.principal ?? null,
              recordEntityUri: record.entityUri,
              canEdit,
            },
          })
        ) : (
          <ContactRows
            kind="skill"
            recordId={record.id}
            recordEntityUri={record.entityUri}
            title={section.field.label ?? attrLabels[section.key] ?? section.key}
            valueKey={section.key}
            metaKey={metaKey}
            etag={record.etag ?? null}
            served={{
              values: record.served?.facts[section.key] ?? record.facts[section.key],
              meta: metaKey ? record.served?.facts[metaKey] : undefined,
            }}
            canEdit={canEdit}
            onSaved={() =>
              void refreshRecordInCaches(qc, photoVaultId ?? vaultId ?? "", { id: record.id, entityUri: record.entityUri ?? null })
            }
          />
        )}
        {host.renderLanguages
          ? host.renderLanguages({
              vaultId: photoVaultId,
              principal: session?.principal ?? null,
              recordEntityUri: record.entityUri,
              canEdit,
              contactTag: contactLangSlug ? (draft[contactLangSlug] ?? record.facts[contactLangSlug] ?? "") : "",
              writeContact: contactLangSlug ? (tag: string) => commitField(contactLangSlug, tag) : null,
            })
          : null}
      </div>
          ) : section ? (
            <ContactRows
              key={`${section.kind}-rows`}
              kind={section.kind}
              recordId={record.id}
              recordEntityUri={record.entityUri ?? null}
              title={section.field.label ?? attrLabels[section.key] ?? section.key}
              valueKey={section.key}
              metaKey={metaKey}
              etag={record.etag ?? null}
              served={{
                values: record.served?.facts[section.key] ?? record.facts[section.key],
                meta: metaKey ? record.served?.facts[metaKey] : undefined,
              }}
              canEdit={canEdit}
              onSaved={() =>
                void refreshRecordInCaches(qc, photoVaultId ?? vaultId ?? "", { id: record.id, entityUri: record.entityUri ?? null })
              }
            />
          ) : languagesShown && contactLangSlug && f.slug === contactLangSlug ? null : partyCard && (f.slug === nicknameSlug || !isNameBox(f)) && !isEntityRefValue(draft[f.slug] ?? "") ? (
            // It8: a person card's remaining plain field is MyNet's FieldRow (sub-label, value, tap to
            // edit), saved through the card's own save: the draft, then the same versioned flush.
            <OwnFieldRow key={f.slug} kind={ownKindOf(f)} term={termOfSlug(f.slug)} value={draft[f.slug] ?? ""}>
            <PersonFieldRow
              key={f.slug}
              label={attrLabels[f.slug] ?? f.label}
              value={draft[f.slug] ?? ""}
              termName={termName(setFieldsAll.find((c) => c.slug === f.slug)?.term)}
              readOnly={!canEdit}
              onCommit={(v) => commitField(f.slug, v)}
            />
            </OwnFieldRow>
          ) : (
            <OwnFieldRow key={f.slug} kind={ownKindOf(f)} term={termOfSlug(f.slug)} value={fieldValue(f)}>
            <FieldEditor
              key={f.slug}
              field={attrLabels[f.slug] ? { ...f, label: attrLabels[f.slug]! } : f}
              isName={personNames ? f.slug === givenSlug : f.slug === nameSlug}
              autoFocus={wasFresh && canEdit && (personNames ? f.slug === givenSlug : f.slug === nameSlug)}
              value={fieldValue(f)}
              registerRef={(el) => {
                fieldRefs.current[f.slug] = el;
              }}
              readOnly={!canEdit}
              onChange={(v) => onFieldChange(f.slug, v)}
              onBlur={() => void flushSave()}
              onEnterAdvance={(personNames ? f.slug === givenSlug : f.slug === nameSlug) ? advanceFromName : undefined}
              vaultId={vaultId}
              onOpenRef={openByAddress}
            />
            </OwnFieldRow>
    );
  };

  const managedCard = stakeholder.state === "ready" && !orgCard;
  // The states that have a line of their own above (not known yet) say so there; the others get this one.
  const cardStatusLine =
    stakeholder.state === "reading"
      ? "Reading the fields of this card…"
      : stakeholder.state === "kinds-not-known" || stakeholder.state === "fields-not-known"
        ? null
        : "This card draws the card of a person only.";
  const cardSlots: CardSlots | undefined = ownCardLocked
    ? undefined
    : managedCard
    ? {
        ...contactCardSlots({
          vaultId: photoVaultId,
          ownVaultId: holderOwnVaultId,
          principal: session?.principal ?? null,
          recordEntityUri: record.entityUri ?? null,
          typeUri: record.typeUri,
          canEdit,
          kindVault: kindVaultOf(photoVault),
          linkedParty: personCard?.party ?? null,
          linked: oneCardLinked || linkTargetOf(record) !== null,
          linkedLookupFailed: !!personCard && !personCard.party,
          // Round 3: a definite "not a person" answer keys the notes to the record (heldNoteKey).
          linkAnswer: personCard?.anchor?.kind ?? null,
        }),
        ...slots,
      }
    : slots;
  const servedFacts = (record.served?.facts as RecordFacts | undefined) ?? record.facts;
  const hasText = (f: { slug: string }) => fieldValue(f).trim() !== "";
  const nameFields = partyCard ? cardFields.filter(isNameBox) : [];
  const plainFields = cardFields.filter(
    (f) =>
      !sectionOf(f.slug) &&
      !nameFields.includes(f) &&
      !(languagesShown && contactLangSlug && f.slug === contactLangSlug),
  );
  const isTimeZone = (f: { slug: string }) => termName(setFieldsAll.find((c) => c.slug === f.slug)?.term) === "timeZone";
  const prefPlainFields = partyCard ? plainFields.filter(isTimeZone) : [];
  const recordPlainFields = partyCard ? plainFields.filter((f) => !isTimeZone(f)) : [];
  const otherSetFields = (hasContactRows ? (setSplit?.other ?? []).filter((f) => !isSectionField(f)) : (setSplit?.other ?? []));
  const channelSetFields = otherSetFields.filter(isChannelField);
  const relationSetFields = otherSetFields.filter((f) => !isChannelField(f));
  const recordExtraKeys = extraKeys.filter(
    (k) =>
      !setFactKeys.has(k) &&
      !fields.some((f) => f.slug === k) &&
      !nameBoxShowsLegacy(k) &&
      !(hasContactRows && !!metaKey && k === metaKey) &&
      bareForm(k) !== STATED_BY_TERM,
  );

  const factLabel = (slug: string) =>
    attrLabels[slug] ?? humanizeSlug(slug);
  // A Value's measures link steps Back to the Function. Every other record keeps the list-row replace.
  const openThisRef = openByAddress;
  const extraFactNodes = recordExtraKeys.map((slug) => {
                        const val = draft[slug] ?? "";
                        const asRef = isEntityRefValue(val);
                        const editable = extraFactEditable(slug, asRef, stakeholder) && !partyNever?.has(slug);
                        return (
                          <OwnFieldRow key={slug} kind="record" value={val} fold={false}>
                          <ExtraFact
                            key={slug}
                            label={factLabel(slug)}
                            value={val}
                            asRef={asRef}
                            editable={canEdit && editable}
                            vaultId={vaultId}
                            onOpen={openThisRef}
                            onChange={(v) => onFieldChange(slug, v)}
                            onBlur={() => void flushSave()}
                          />
                          </OwnFieldRow>
                        );
                      });

  const hl = headerLayout(headerWidth, placementMode as "full" | "content" | "actions");
  const wideHeader = placementMode === "content" && showContent && managedCard && partyCard && !!photoVault;
  const view = (
    <div className="h-full flex flex-col" data-placement={placementMode} data-testid="record-detail">
      {wideHeader && photoVault ? (
        <>
          <StakeholderContactHeader
            holderVault={photoVault}
            ownVaultId={holderOwnVaultId}
            viewer={session?.principal ?? null}
            principal={session?.principal ?? null}
            canEdit={canEdit}
            record={{ id: record.id, entityUri: record.entityUri ?? null, typeUri: record.typeUri }}
            ownName={displayTitle}
            kind={stakeholder.state === "ready" ? stakeholder.kind : null}
            kindLabel={vedaTypeLabel ?? spec?.label ?? (uriTail(record.typeUri) || "Node")}
            personCard={personCard}
            onlineCard={onlineCard}
            ownCard={ownCardLocked}
            ownPicture={
              showPhoto && photoVault && host.renderRecordPicture
                ? ({ shape, size, cssSize }, initials) =>
                    host.renderRecordPicture!({
                      vault: photoVault,
                      shape,
                      size,
                      cssSize,
                      initials,
                      person: {
                        id: record.id,
                        entityUri: record.entityUri ?? null,
                        photoRef: hasPhotoField || photoRefNow ? photoRefNow : null,
                        name: displayTitle,
                        canEdit,
                      },
                      onSaved: () => {
                        void refreshRecordInCaches(qc, photoVaultId ?? "", { id: record.id, entityUri: record.entityUri ?? null });
                      },
                    })
                : null
            }
          />
          {canEdit ? (
            <div
              data-testid="record-header-actions"
              className="flex flex-none flex-nowrap items-center justify-end gap-1 border-b border-[var(--line-2)] px-4 py-1"
            >
              <CardModeActions />
            </div>
          ) : null}
        </>
      ) : (
      <>
      <div
        ref={headerRef}
        data-testid="record-header"
        data-header-tier={hl.tier}
        className={`flex-none ${hl.tier === "l" ? "px-4" : "px-2"} py-3 flex items-center ${hl.gap === 12 ? "gap-3" : hl.gap === 8 ? "gap-2" : "gap-1.5"} border-b border-[var(--line-2)]`}
      >
        {showPhoto && photoVault && host.renderRecordPicture
          ? host.renderRecordPicture({
              vault: photoVault,
              size: hl.avatar,
              person: {
                id: record.id,
                entityUri: record.entityUri ?? null,
                photoRef: hasPhotoField || photoRefNow ? photoRefNow : null,
                name: displayTitle,
                canEdit,
              },
              onSaved: () => {
                void refreshRecordInCaches(qc, photoVaultId ?? "", { id: record.id, entityUri: record.entityUri ?? null });
              },
            })
          : host.renderBandIcon
            ? host.renderBandIcon({
                typeId: spec?.id ?? "note",
                typeName: spec?.typeName ?? record.typeUri,
                facts: record.facts,
                className:
                  (hl.tier === "s" ? "w-10 h-10" : hl.tier === "m" ? "w-12 h-12" : placementMode === "content" ? "w-24 h-24" : "w-32 h-32") +
                  " shrink-0 text-[var(--accent)]",
              })
            : null}
        <div className="min-w-0 flex-1 flex flex-col gap-1">
            <h2 className="min-w-0 break-words line-clamp-2 font-[var(--serif)] text-[16px] font-semibold text-[var(--ink)]">
              {placementMode === "actions" ? "Actions" : displayTitle}
            </h2>
          {placementMode !== "actions" && host.renderTypeDescription
            ? host.renderTypeDescription({
                ownDoes: record.facts.does ?? record.facts["a:does"],
                typeUri: record.typeUri,
                specTypeName: spec?.typeName,
              })
            : null}
        </div>
        {showContent && managedCard ? (
          <div data-testid="record-header-actions" className={`flex shrink-0 flex-nowrap items-center ${hl.compact ? "gap-0" : "gap-1"}`}>
            <CardModeActions compact={hl.compact} />
          </div>
        ) : null}
      </div>
      </>
      )}

      <div data-testid="record-body" className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        {showContent && !wideHeader && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-ghost)]">
            {vedaTypeLabel ?? spec?.label ?? (uriTail(record.typeUri) || "Node")}
            {isOpenType && " · open type"}
            {optimistic && " · saving…"}
          </p>
        )}
        {notice && (
          <p role="alert" className="rounded-[var(--r-sm)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--warn)]">
            {notice}
          </p>
        )}

        {showContent && !entityCanWrite && !ownCard.own && (writeGuard.reason || ENTITY_READ_ONLY_REASON) && (
          <p role="status" className="text-[12.5px] text-[var(--ink-faint)]">
            {!writeGuard.allowed ? writeGuard.reason : ENTITY_READ_ONLY_REASON}
          </p>
        )}

        {showContent ? <OwnCardBand state={ownCard} onOpen={openByAddress} /> : null}

        {showContent && (stakeholder.state === "kinds-not-known" || stakeholder.state === "fields-not-known") && (
          <p role="status" data-testid="stakeholder-fields-state" className="text-[12.5px] text-[var(--ink-faint)]">
            {stakeholder.state === "kinds-not-known"
              ? `Not known yet whether this is a stakeholder kind (${stakeholder.reason}). If it is, the fields below are not its own field list. Reload to ask again.`
              : `Fields not known yet for this stakeholder kind, so nothing can be edited here (${stakeholder.reason}). Reload to ask again.`}
          </p>
        )}
        {showContent && stakeholder.state === "ready" && !stakeholder.complete && (
          <p role="status" data-testid="stakeholder-fields-floor" className="text-[12.5px] text-[var(--ink-faint)]">
            The field list may not be whole: {stakeholder.incompleteAt.join("; ")}.
          </p>
        )}

        {/* Content: typed + free-form field values only (+ attachments on main Card). */}
        {showContent && (
        <div className="flex flex-col gap-4" data-testid="record-detail-content" data-stakeholder-state={stakeholder.state}>
          {managedCard ? (
            <>
              {wideHeader ? null : <PersonPlacementChips card={personCard} />}
              <OneCardBody
                controller={onlineCard}
                labelFor={onlineCardLabelFor}
                searchName={partyName ?? ""}
                canWrite={canEdit}
                fieldOrder={stakeholder.state === "ready" ? stakeholder.kind.fields : []}
                servedFacts={oneCardOwnFacts}
                recordUri={record.entityUri ?? null}
                skillPredicate={skillField?.writeKey ?? null}
                addressPredicate={addressField?.writeKey ?? null}
                addressVaultId={photoVaultId}
                addressSubject={record.entityUri ?? null}
                groupOf={oneCardGroupOf}
                skip={oneCardSkip}
                order={oneCardOrder}
                personCard={personCard}
              >
              <div className="flex flex-col gap-4" data-testid="person-card-groups">
                {session?.principal && linkTargetOf(record) ? (
                  <OtherLinkedRecords holder={session.principal} principal={linkTargetOf(record)!} selfId={record.id} onOpen={(id, vaultId) => openWithVault(id, { vaultId })} />
                ) : null}
                <CardModeHint />
                <CardTopSlots slots={cardSlots} />
                {/* Name: given, family, and nickname when the holder has one, their card has one, or Record was added.
                    Their nickname draws the own row here as well; presentation still hides an empty row. */}
                {partyCard ? (
                  <CardGroup kind="name" title="Name" icon="name" aside={cardSlots?.nameAside} keepInEdit empty={!nameFields.some(hasText)}>
                    {nameFields.filter((f) => f.slug !== nicknameSlug || nicknameOwnVisible || theirNickname).map(renderCardField)}
                  </CardGroup>
                ) : null}
                {/* Each repeating set is its own framed group (email, phone, address, online account, skills, interests, languages, employment). */}
                {cardFields.filter((f) => !!sectionOf(f.slug)).map(renderCardField)}
                <OneCardOwnGroups labelFor={onlineCardLabelFor} />
                {!partyCard && (plainFields.length > 0 || recordExtraKeys.length > 0) ? (
                  <CardGroup kind="details" title="Details" icon="record" aside={cardSlots?.nameAside} keepInEdit empty={!plainFields.some(hasText) && !recordExtraKeys.some((k) => (draft[k] ?? "").trim() !== "")}>
                    {plainFields.map(renderCardField)}
                    {extraFactNodes}
                  </CardGroup>
                ) : null}
                {party.notKnownYet && (
                  <div className="flex flex-col gap-1" data-testid="party-name-not-known">
                    <span className="text-[12px] font-medium text-[var(--ink)]">Name</span>
                    <span className="text-[14px] text-[var(--ink)] break-words">{partyName ?? "—"}</span>
                    <span className="text-[11.5px] text-[var(--ink-faint)]">
                      Not edited here yet: where this kind holds its name is not known yet.
                    </span>
                  </div>
                )}
                {stakeholder.state === "ready" && setSplit && cardVocab.data?.fieldSets && (
                  <>
                    <CardSection title="Relations" testId="card-section-relations" kinds={relationSetFields.map(setFieldKind)} empty={!relationSetFields.some((f) => setFieldHasContent(f, servedFacts))}>
                      <StakeholderSetFields
                        only="relations"
                        fields={relationSetFields}
                        facts={servedFacts}
                        fieldSets={cardVocab.data.fieldSets}
                        canEdit={canEdit}
                        holdingVault={holdingVault}
                        agent={session?.principal ?? null}
                        carrier={record.entityUri ?? null}
                        vaultId={vaultId}
                        onOpenRef={openByAddress}
                        recordId={record.id}
                        carrierKind={stakeholder.kind}
                      />
                    </CardSection>
                    <CardSection
                      title="Contact preferences"
                      testId="card-section-preferences"
                      kinds={[...channelSetFields.map(setFieldKind), "time-zone"]}
                      empty={!channelSetFields.some((f) => setFieldHasContent(f, servedFacts)) && !prefPlainFields.some(hasText)}
                    >
                      <StakeholderSetFields
                        only="preferences"
                        fields={channelSetFields}
                        facts={servedFacts}
                        fieldSets={cardVocab.data.fieldSets}
                        canEdit={canEdit}
                        holdingVault={holdingVault}
                        agent={session?.principal ?? null}
                        carrier={record.entityUri ?? null}
                        vaultId={vaultId}
                        onOpenRef={openByAddress}
                        recordId={record.id}
                        carrierKind={stakeholder.kind}
                      />
                      {prefPlainFields.length > 0 ? (
                        <CardGroup kind="time-zone" title="Time zone" icon="clock" empty={!prefPlainFields.some(hasText)}>
                          {prefPlainFields.map(renderCardField)}
                        </CardGroup>
                      ) : null}
                    </CardSection>
                  </>
                )}
                {/* Record: the plain facts the card holds (a web address, a label, a level …) and the facts it only shows. */}
                {partyCard && (recordPlainFields.length > 0 || recordExtraKeys.length > 0) ? (
                  <CardGroup
                    kind="record"
                    title="Record"
                    icon="record"
                    empty={!recordPlainFields.some(hasText) && !recordExtraKeys.some((k) => (draft[k] ?? "").trim() !== "")}
                  >
                    {recordPlainFields.map(renderCardField)}
                    {extraFactNodes}
                  </CardGroup>
                ) : null}
                {orgCard ? null : <RelatedChildren record={record} vaultId={vaultId} onOpen={(id, entityUri) => openWithVault(id, { uri: entityUri })} />}
                {!optimistic && host.renderAttachments ? (
                  <div data-testid="record-detail-attachments">
                    {host.renderAttachments({
                      recordId: record.id,
                      vaultId,
                      recordEntityUri: record.entityUri ?? null,
                      canWrite,
                      recordFacts: record.servedKeys ? record.facts : null,
                    })}
                  </div>
                ) : null}
                {/* MyNet's foot of the card: the card shows what it has; the kinds of information it does not show yet are added from here. */}
                <AddInformationButton />
                <AddInformationSheet />
              </div>
              </OneCardBody>
            </>
          ) : (
            cardStatusLine ? (
              <p role="status" data-testid="stakeholder-card-status" className="text-[12.5px] text-[var(--ink-faint)]">
                {cardStatusLine}
              </p>
            ) : null
          )}
        </div>
        )}

      </div>
    </div>
  );
  return managedCard ? (
    <CardModeProvider canEdit={canEdit} startEditing={wasFresh} rootClassName="contents">
      <RecordGroupOpenedSync onChange={setRecordGroupOpened} />
      {view}
    </CardModeProvider>
  ) : (
    view
  );
}
