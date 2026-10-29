// The find-before-create part of the create dialog for a stakeholder.
//
// The noun, the kind list, the find and the package create live here, so the dialog calls
// this once. It still runs while the dialog is closed: the call sits above the dialog's
// `if (!open) return null`. Queries, effects and the create are the dialog's own.

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { FindResult } from "@kaigilb/gilbplatformcode-pick-or-create";
import type { FieldSpec } from "@kaigilb/gilbplatformcode-record-types";
import { idFromEntityUri } from "@kaigilb/gilbplatformcode-id-tail";
import { isListedKind } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { stakeholderCardVocabularyQuery, type CardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import {
  afterRecordPerson,
  findPeople,
  heldLabelsWritten,
  isStakeholderKindOption,
  personBoxes,
  pickerReadingQuery,
  recordableKinds,
  recordPerson,
  STAKEHOLDER_FIND_DEBOUNCE_MS,
  STAKEHOLDER_FIND_MIN_CHARS,
  stakeholderTypeOptions,
  stakeholderTypeSearch,
  type PersonCreateHost,
} from "@kaigilb/gilbplatformcode-person-create";
import { moreTypeOptions, orderByShortcuts, startShortcuts } from "@kaigilb/gilbplatformcode-contact-kind-model";
import type { TypeOption, TypeSearchFn } from "@kaigilb/gilbplatformcode-ontology-reads";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { useStakeholderNoun } from "./stakeholderNoun";

/** The five things "+ New" can start. A structural copy of the dialog's own type, so the dialog's value is accepted as it is. */
export type CreateMode = "plain" | "connected" | "connectExisting" | "folder" | "upload";

/** The shipped VirtualFolder record type's id in the app's record types. A copy of the one constant, kept here so no folder module is imported. */
const FOLDER_TYPE_ID = "folder";

/** The part of the signed-in session this hook reads: who the holder is. */
export interface StakeholderFindSession {
  principal: string;
}

/**
 * What the host answers. Each member replaces one call of the app.
 */
export interface StakeholderFindHost {
  /**
   * Replaces `defaultWriteVaultId(writable, contentScope.readVaultId)`, GilbApp `src/lib/base/writableVaults.ts` line 61: the vault on screen when it
   * can be written, else the landing vault, else the first writable one, else `null`.
   */
  defaultWriteVaultId(vaults: readonly ReachableVault[] | null | undefined, viewedVaultId: string | null | undefined): string | null;
  /** The host `stakeholder-card-vocabulary` asks for, for `stakeholderCardVocabularyQuery(host.vocabulary)`. */
  vocabulary: CardVocabularyHost;
  /** The host `person-create` asks for, for `recordPerson(host.person, ...)` and `afterRecordPerson(host.person, ...)`. */
  person: PersonCreateHost;
}

/** Slug prefix for a stakeholder kind's text boxes, so they cannot collide with a type's own fields. */
const BOX_SLUG_PREFIX = "box:";

/**
 * Thrown by the two checks that sit before `recordPerson`. The dialog sets its catch flag
 * before `createStakeholder()` (the branch is one call), and this class tells that catch to
 * keep the generic wording. `recordPerson` and `afterRecordPerson` throw as themselves, so
 * the catch uses `stakeholderErrorText` for those.
 */
export class StakeholderCreateGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StakeholderCreateGuardError";
  }
}

/** Every cached match search of the "already in this vault" list. */
export const STAKEHOLDER_FIND_KEY_PREFIX = ["gilb-stakeholders", "find"] as const;

/**
 * A record was just written, so a search made before it is out of date. Cancels a find still in flight
 * (its pre-create answer must not be stored) and drops the cached answer, so an active search is asked again.
 */
export async function refreshStakeholderFinds(qc: QueryClient): Promise<void> {
  await qc.cancelQueries({ queryKey: STAKEHOLDER_FIND_KEY_PREFIX });
  await qc.resetQueries({ queryKey: STAKEHOLDER_FIND_KEY_PREFIX });
}

/** What the dialog renders in place of the type chooser while the kinds are not in hand. */
export type KindsStandInDecision =
  | null
  | { status: "refused"; detail: string }
  | { status: "pending" };

export interface UseStakeholderCreateArgs {
  inStakeholders: boolean;
  open: boolean;
  mode: CreateMode | null;
  option: TypeOption;
  setOption: Dispatch<SetStateAction<TypeOption>>;
  vaultId: string | null;
  setVaultId: Dispatch<SetStateAction<string | null>>;
  displayName: string;
  values: Readonly<Record<string, string>>;
  source: { typeName?: string | null; id?: string; entityUri?: string | null } | null;
  contentScope: { readVaultId: string | null };
  vaults: readonly ReachableVault[];
  /** The dialog's writable list, so "Create in" falls back to the same array the gate uses. */
  writable: readonly ReachableVault[];
  session: StakeholderFindSession | null | undefined;
  queryClient: QueryClient;
  host: StakeholderFindHost;
}

export function useStakeholderCreate({
  inStakeholders,
  open,
  mode,
  option,
  setOption,
  vaultId,
  setVaultId,
  displayName,
  values,
  source,
  contentScope,
  vaults,
  writable,
  session,
  queryClient,
  host,
}: UseStakeholderCreateArgs) {
  const noun = useStakeholderNoun(host.vocabulary, inStakeholders && open);
  // The same session reading `useStakeholderNoun` asks for, so this adds no second request.
  const vocab = useQuery({ ...stakeholderCardVocabularyQuery(host.vocabulary), enabled: inStakeholders && open });
  // The picker starts from the master's shortcuts (`a:createShortcut`), the rest under "More types…". The options are the
  // same ones as before, the shortcuts first (so the first type selected is the master's first shortcut); with none known nothing moves.
  const plainKindOptions = useMemo(
    () => (inStakeholders && vocab.data?.fieldSets ? stakeholderTypeOptions(vocab.data.fieldSets) : null),
    [inStakeholders, vocab.data],
  );
  const shortcuts = useMemo(() => (plainKindOptions ? startShortcuts(vocab.data, plainKindOptions) : []), [plainKindOptions, vocab.data]);
  const kindOptions = useMemo(() => (plainKindOptions ? orderByShortcuts(plainKindOptions, shortcuts) : null), [plainKindOptions, shortcuts]);
  const fieldSets = inStakeholders ? (vocab.data?.fieldSets ?? null) : null;
  const kindSearch: TypeSearchFn | null = useMemo(
    () => (kindOptions ? stakeholderTypeSearch(kindOptions, noun) : null),
    [kindOptions, noun],
  );
  /** "More types…": every type that is not a shortcut (all stay reachable). */
  const moreSearch: TypeSearchFn | null = useMemo(
    () => (kindOptions ? stakeholderTypeSearch(moreTypeOptions(kindOptions, shortcuts), noun) : null),
    [kindOptions, shortcuts, noun],
  );
  /** The KindFieldSet of the chosen option when it is a stakeholder kind inside Stakeholders; else null.
   *  Such a create goes through the package. */
  const stakeholderKind = useMemo(
    () =>
      fieldSets && isStakeholderKindOption(option, kindOptions)
        ? (recordableKinds(fieldSets).find((k) => k.name === option.typeName) ?? null)
        : null,
    [fieldSets, option, kindOptions],
  );
  const boxes = useMemo(
    () => (fieldSets && stakeholderKind ? personBoxes(fieldSets, stakeholderKind) : []),
    [fieldSets, stakeholderKind],
  );
  // Null field sets are skipToken. The query stays disabled until a stakeholder kind is chosen.
  const reading = useQuery({ ...pickerReadingQuery(fieldSets), enabled: !!stakeholderKind && open });
  const [needle, setNeedle] = useState("");
  // Opening is a new act. Clear here so the dialog does not reach into this state.
  useEffect(() => {
    if (open) setNeedle("");
  }, [open]);
  /** A virtual folder is not a stakeholder kind. */
  const folderChosen = option.id === FOLDER_TYPE_ID;
  const folderPath = mode === "plain" && folderChosen;

  // The chosen kind, once the master has named some: the source record's own kind when that
  // name is one of them, else the first. Upload stays `mode === "upload"`. "Create a virtual
  // folder" does not stay `mode === "folder"` — that click sets the shipped folder option and
  // enters plain — so a plain step whose option is that folder is left standing too.
  useEffect(() => {
    if (!inStakeholders || !open || !kindOptions || kindOptions.length === 0) return;
    if (mode === "upload" || mode === "folder") return;
    if (folderPath) return;
    if (isStakeholderKindOption(option, kindOptions)) return;
    const sourceName = (source?.typeName ?? "").split("/").pop() ?? "";
    setOption(kindOptions.find((o) => o.typeName === sourceName) ?? kindOptions[0]!);
  }, [inStakeholders, open, kindOptions, option, source?.typeName, mode, folderPath]);

  // A stakeholder is offered EVERY vault the person may write (their own, the ones inside them, and vaults shared with write), not only the ones nested under the landing vault: a
  // person who manages a second vault saw ONE choice, drawn as plain text, and records landed in the other vault. Correct only a choice that is not writable at all
  // (the list moved); a choice the person made is never moved.
  useEffect(() => {
    if (!inStakeholders || !open) return;
    if (!isStakeholderKindOption(option, kindOptions)) return;
    if (writable.some((v) => v.vaultId === vaultId)) return;
    const next = host.defaultWriteVaultId(writable, contentScope.readVaultId);
    if (next === vaultId) return;
    setVaultId(next);
  }, [inStakeholders, open, option, kindOptions, writable, vaultId, contentScope.readVaultId]);

  // The settle and the floor of the find. `displayName` is already trimmed.
  // Only on the stakeholder path (a kind is chosen and the dialog is open). Otherwise the needle stays "".
  useEffect(() => {
    if (!stakeholderKind || !open) {
      setNeedle("");
      return;
    }
    const t = setTimeout(() => setNeedle(displayName), STAKEHOLDER_FIND_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [displayName, stakeholderKind, open]);

  const found = useQuery({
    queryKey: [...STAKEHOLDER_FIND_KEY_PREFIX, vaultId, needle],
    queryFn: () => findPeople(reading.data!, vaultId!, needle),
    enabled: !!stakeholderKind && open && !!reading.data && !!vaultId && needle.length >= STAKEHOLDER_FIND_MIN_CHARS,
    staleTime: 5_000,
    retry: false,
  });

  // Kinds in hand only on a stakeholder-kind path. The plain folder path and an upload are not
  // one, so a refused kinds read must not block them. A chosen kind still waits on its own gates.
  const stakeholderGateOk =
    !(
      inStakeholders &&
      !folderPath &&
      mode !== "upload" &&
      (!kindOptions || kindOptions.length === 0)
    ) &&
    (!stakeholderKind ||
      (!!reading.data &&
        !!session?.principal &&
        writable.some((v) => v.vaultId === vaultId) &&
        displayName !== ""));

  const kindNotReady = !stakeholderKind
    ? null
    : reading.isPending
      ? "Reading the tag form…"
      : reading.error
        ? `Not known yet: ${reading.error instanceof Error ? reading.error.message : String(reading.error)}`
        : writable.length === 0
          ? "You hold no vault you can write to, so there is nowhere to make this."
          : !session?.principal
            ? "Not signed in."
            : null;

  const vaultChoices = writable;

  // The connect-existing list. The kind filter only once the names are in hand — never an
  // empty stand-in for "no kinds". "pending" while the vocabulary is being read; "refused"
  // when it failed or has no field sets.
  const kindsDetail =
    vocab.data?.fieldSetsRefusal ?? String(vocab.error?.message ?? "the master did not answer");
  const vocabularyRefused = vocab.isError || (vocab.data != null && vocab.data.fieldSets === null);
  const kindsState: "pending" | "refused" | null = !inStakeholders
    ? null
    : vocabularyRefused
      ? "refused"
      : vocab.isPending
        ? "pending"
        : null;
  const linkKeep = useMemo(() => {
    if (!(inStakeholders && kindsState === null && kindOptions)) return undefined;
    const names = kindOptions.map((o) => o.typeName);
    return (t: string) => isListedKind(t, names);
  }, [inStakeholders, kindsState, kindOptions]);

  // In place of the type chooser on the two create steps, and of the connect-existing list,
  // while the kinds are not in hand. `inStakeholders` false never reaches either branch.
  const kindsStandIn: KindsStandInDecision = (() => {
    if (
      !inStakeholders ||
      (mode !== "plain" && mode !== "connected" && mode !== "connectExisting")
    )
      return null;
    // The folder form stays up while the kinds are refused or still being read.
    if (folderPath) return null;
    if (vocabularyRefused) {
      return { status: "refused" as const, detail: kindsDetail };
    }
    if (vocab.isPending) return { status: "pending" as const };
    return null;
  })();

  const extraFieldsFromBoxes: FieldSpec[] = boxes.map((b) => ({
    slug: BOX_SLUG_PREFIX + b.key,
    label: b.label,
    kind: "text" as const,
  }));

  // The package's create: a:name only, the ADDER's own card (their card in their landing vault) as a:statedBy, the master tag. Never the generic create hook.
  const createStakeholder = async (): Promise<{ newId: string; newEntityUri: string | null }> => {
    const vault = writable.find((v) => v.vaultId === vaultId);
    if (!vault) throw new StakeholderCreateGuardError("A stakeholder is made only in a vault you may write to.");
    if (!session?.principal || !reading.data) {
      throw new StakeholderCreateGuardError("Not ready yet: not signed in, or the tag form is not read.");
    }
    // Called only when the dialog has a kind. This keeps the two guards above identical to
    // the old branch and narrows the kind for the package call.
    if (!stakeholderKind) {
      throw new StakeholderCreateGuardError("Not ready yet: not signed in, or the tag form is not read.");
    }
    const made = await recordPerson(
      host.person,
      { reading: reading.data, queryClient },
      {
        vault,
        vaults,
        agent: session.principal,
        kind: stakeholderKind,
        name: displayName,
        boxes,
        values: Object.fromEntries(boxes.map((b) => [b.key, values[BOX_SLUG_PREFIX + b.key] ?? ""])),
      },
    );
    const newId = idFromEntityUri(made.record);
    const newEntityUri = /^https?:\/\//.test(made.record) ? made.record : null;
    await afterRecordPerson(host.person, queryClient, made);
    return { newId, newEntityUri };
  };

  /** The labels of the boxes whose held record was written, when this many held records were. Null: cannot be told. */
  const heldSaved = (writtenCount: number): string[] | null =>
    heldLabelsWritten(
      boxes,
      Object.fromEntries(boxes.map((b) => [b.key, values[BOX_SLUG_PREFIX + b.key] ?? ""])),
      writtenCount,
    );

  // Drop the source record before the list is shown. The find itself is unchanged.
  const foundForList = useMemo(() => {
    const data = found.data;
    if (!data) return { data, error: found.error };
    const candidates = data.candidates.filter((c) => !candidateIsSource(c, source));
    return {
      data: candidates.length === data.candidates.length ? data : { ...data, candidates },
      error: found.error,
    };
  }, [found.data, found.error, source]);

  return {
    noun,
    kindSearch,
    stakeholderKind,
    stakeholderGateOk,
    vaultChoices,
    kindNotReady,
    found: foundForList,
    shortcuts,
    kindOptions,
    moreSearch,
    kindsStandIn,
    extraFieldsFromBoxes,
    linkKeep,
    createStakeholder,
    heldSaved,
  };
}

/** The find query, as the match list reads it. Named so the dialog's prop stays structural. */
export type StakeholderFindResult = {
  data: FindResult | undefined;
  error: Error | null;
};

/**
 * The dialog's own source, so it is never offered as a match for itself.
 * A row is that source when its id tail equals the source id, or the tail of a source id
 * that is an address, or its record is the source's address.
 */
function candidateIsSource(
  c: { record: string },
  source: { id?: string; entityUri?: string | null } | null,
): boolean {
  if (!source) return false;
  const recordId = idFromEntityUri(c.record);
  if (typeof source.id === "string" && source.id !== "") {
    if (recordId === source.id) return true;
    if (source.id.includes("/") && recordId === idFromEntityUri(source.id)) return true;
  }
  return typeof source.entityUri === "string" && source.entityUri !== "" && c.record === source.entityUri;
}
