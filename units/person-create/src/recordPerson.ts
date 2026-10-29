// Record a local person from Stakeholders, through the package's
// pick-or-create (`pick-or-create`: `findCandidates`, `createRecord`).
//
// The MECHANISM is the package's; the app hands it the vault, the holder, the writer and what the person typed, and renders.
// ⛔ No kind and no field is named here: the kinds offered are the kinds the master lists that offer a name,
// and the boxes are the text fields the master offers on the chosen kind, and on a record a field
// of it holds (`a:fieldRecordType`, so an organization typed into Employment's text field is
// written as that Employment record, in the same vault, by the same holder).
//
// WHAT THE CREATE WRITES: the name under the name predicate's write
// spelling only (`a:name` on the master), ⛔ no `a:label` and ⛔ no `a:title`. That is the package's
// `createRecord`; this module adds no fact to it.
//
// THE STATER: the source
// (`a:statedBy`) of the record is the card of the person ADDING it, their own card in their own (landing) vault, found by
// the host's `adderCardOf`. ⛔ Never the card of the vault written into, nor of its holder, even when that vault has one, and ⛔ never the
// principal. Adding a stakeholder never needs and never makes the written vault's own card. A person with no card of their own yet gets a basic
// one in their landing vault the first time one is needed; with no landing vault the create is refused before any write. The person may add
// to ANY vault they may write (their own, one inside it, or one shared with write): the audience of the record is the vault's, the source is
// the adder's.
import { QueryClient, skipToken } from "@tanstack/react-query";
import {
  createRecord,
  findCandidates,
  readPickerVocabulary,
  type CreateResult,
  type FieldValue,
  type FindResult,
  type PickerReading,
} from "@kaigilb/gilbplatformcode-pick-or-create";
import { NoTagRoutesError } from "@kaigilb/gilbplatformcode-tag-client";
import type { KindFieldSet, StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { refreshMultiVaultLists, type ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { cardMasterSource } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { platformFetch } from "@kaigilb/gilbplatformcode-platform-fetch";
import { vaultRootOf } from "@kaigilb/gilbplatformcode-plan-self-source";
import { selfCardEntityUri } from "@kaigilb/gilbplatformcode-self-card";
import { canWriteVault } from "./canWriteVault";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * What the host answers for recording a person. Each member replaces one call of the app.
 */
export interface PersonCreateHost {
  /**
   * Replaces `adderCardOf(vaults, qc, { email })`, GilbApp `src/lib/base/recordPerson.ts` line 296 (calling `src/lib/base/adderCard.ts` line 98):
   * the entity address of the card of the person adding the record, their own card in their landing vault (made basic first when they have none),
   * read through the query client it is given. Rejects when the list holds no landing vault. Called once per `recordPerson`, after the write check
   * and before any write, with `deps.queryClient ?? fallbackQueryClient`.
   */
  adderCardOf(vaults: readonly ReachableVault[] | null | undefined, qc: QueryClient, opts: { email?: string | null }): Promise<string>;
  /**
   * Replaces `rememberCreatedIn(qc, recordId, vaultId)`, GilbApp `src/lib/base/recordPerson.ts` line 325 (calling `src/lib/base/recordHooks.ts` line 2842):
   * keeps for the session the vault a create wrote into, for a card opened before any list holds the record. Called once per `afterRecordPerson`,
   * before the lists are marked to be read again.
   */
  rememberCreatedIn(qc: QueryClient, recordId: string, vaultId: string): void;
}

/** For a caller with no query cache of its own (a test): the own-card finding is then read once per process, not once per session. App code passes its client. */
const fallbackQueryClient = new QueryClient();

// ── Which vaults a person may record into ─────────────────────────────────────────────────

/**
 * True when the signed-in person HOLDS the vault: they may write it, and it is their landing vault
 * or nested under it (its parent chain reaches the landing vault). Read from the vault list only.
 */
export function isHeldVault(vault: ReachableVault, vaults: readonly ReachableVault[]): boolean {
  if (!canWriteVault(vault)) return false;
  const landing = vaults.find((v) => v.isLandingVault);
  if (!landing) return false;
  const byId = new Map(vaults.map((v) => [v.vaultId, v]));
  const seen = new Set<string>();
  let at: ReachableVault | undefined = vault;
  while (at && !seen.has(at.vaultId)) {
    if (at.vaultId === landing.vaultId) return true;
    seen.add(at.vaultId);
    at = at.parent ? byId.get(at.parent.vaultId) : undefined;
  }
  return false;
}

// ── The kinds and the boxes, from the field sets ──────────────────────────────────────────

/** The kinds a record can be made of: those whose set offers the name predicate. */
export function recordableKinds(fieldSets: StakeholderFieldSets): KindFieldSet[] {
  const name = fieldSets.kinds.predicates.name.writeKey;
  if (name === null) return [];
  return Object.values(fieldSets.byKind)
    .filter((k) => k.fields.some((f) => f.readKeys.includes(name)))
    .sort((a, b) => (a.label ?? a.name).localeCompare(b.label ?? b.name));
}

/** One text box of the form: a text field of the kind, or of the record a field of it holds. */
export interface PersonBox {
  /** Unique within the form: the field's write spelling, or `<field>/<sub-field>`. */
  key: string;
  label: string;
  /** The kind's field this box writes. */
  field: string;
  /** Set when the box writes a field of the record `field` holds. */
  sub: string | null;
}

// Free text only: `inline-literal:text`. A token field's value must
// be a member of its term's `a:valueSet`, and `:json`, `:uri`, `:date` are not typed text either, so
// none of them gets a box until the form can offer what the term allows. Decided by the encoding
// alone; no field is named.
const isText = (encoding: string | null) => encoding === "inline-literal:text";

/** The boxes for a kind, the name first. Only text fields: a reference is not typed into a box. */
export function personBoxes(fieldSets: StakeholderFieldSets, kind: KindFieldSet): PersonBox[] {
  const name = fieldSets.kinds.predicates.name.writeKey;
  const boxes: PersonBox[] = [];
  for (const f of kind.fields) {
    if (!f.writeKey || f.writeKey === name) continue;
    if (f.record) {
      // A record whose type publishes no type name cannot be written (the package refuses it).
      if (!f.record.typeName) continue;
      for (const s of f.record.fields) {
        if (!s.writeKey || !isText(s.encoding)) continue;
        boxes.push({ key: `${f.writeKey}/${s.writeKey}`, label: s.label ?? s.writeKey, field: f.writeKey, sub: s.writeKey });
      }
    } else if (isText(f.encoding)) {
      boxes.push({ key: f.writeKey, label: f.label ?? f.writeKey, field: f.writeKey, sub: null });
    }
  }
  return boxes;
}

/** The `fields` the package's create takes, from the boxes the person filled. Empty boxes send nothing. */
export function fieldsFromBoxes(boxes: readonly PersonBox[], values: Readonly<Record<string, string>>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  const held = new Map<string, Record<string, string>>();
  for (const b of boxes) {
    const v = (values[b.key] ?? "").trim();
    if (v === "") continue;
    if (b.sub === null) out[b.field] = v;
    else held.set(b.field, { ...(held.get(b.field) ?? {}), [b.sub]: v });
  }
  for (const [field, record] of held) out[field] = { record };
  return out;
}

/**
 * The labels of the filled boxes whose held record was written, when `writtenCount` held records were written before a
 * failure. The package writes one record per field that holds a record (all of that field's filled boxes in it), in the
 * order `fieldsFromBoxes` lists them, so the first `writtenCount` fields are the ones stored. Null when that cannot be
 * told (nothing written, or more records than fields): the caller then names no field.
 */
export function heldLabelsWritten(
  boxes: readonly PersonBox[],
  values: Readonly<Record<string, string>>,
  writtenCount: number,
): string[] | null {
  const byField = new Map<string, string[]>();
  for (const b of boxes) {
    if (b.sub === null || (values[b.key] ?? "").trim() === "") continue;
    byField.set(b.field, [...(byField.get(b.field) ?? []), b.label]);
  }
  const fields = [...byField.values()];
  if (writtenCount < 1 || writtenCount > fields.length) return null;
  return fields.slice(0, writtenCount).flat();
}

// ── The picker ────────────────────────────────────────────────────────────────────────────

export function pickerReadingQueryKey() {
  return ["gilb-stakeholders", "picker-reading", termOrigin()] as const;
}

/** The grammar and the stater's spelling beside the session's field sets, read once per session.
 *  Null field sets are not a reading: the query function is `skipToken`, so nothing is fetched. */
export function pickerReadingQuery(fieldSets: StakeholderFieldSets): {
  queryKey: ReturnType<typeof pickerReadingQueryKey>;
  queryFn: () => Promise<PickerReading>;
  staleTime: number;
  gcTime: number;
  retry: false;
  retryOnMount: false;
};
export function pickerReadingQuery(fieldSets: StakeholderFieldSets | null): {
  queryKey: ReturnType<typeof pickerReadingQueryKey>;
  queryFn: (() => Promise<PickerReading>) | typeof skipToken;
  staleTime: number;
  gcTime: number;
  retry: false;
  retryOnMount: false;
};
export function pickerReadingQuery(fieldSets: StakeholderFieldSets | null) {
  return {
    queryKey: pickerReadingQueryKey(),
    queryFn:
      fieldSets === null
        ? skipToken
        : (): Promise<PickerReading> => readPickerVocabulary(cardMasterSource(), fieldSets),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false as const,
    retryOnMount: false as const,
  };
}

function pickerFor(vaultId: string, reading: PickerReading, fetchImpl?: Fetch) {
  return { platform: { origin: vaultOriginOf(vaultId), fetch: fetchImpl ?? platformFetch() }, reading };
}

type FindPeopleFn = (reading: PickerReading, vaultId: string, text: string, fetchImpl?: Fetch) => Promise<FindResult>;

/** A hook that already imported {@link findPeople} does not see a spy on the export. Tests set this. ⛔ Never set by product code. */
let findPeopleForTest: FindPeopleFn | null = null;

/** Test seam — ⛔ never called by product code. `null` restores the package's find. */
export function __setFindPeopleForTest(fn: FindPeopleFn | null): void {
  findPeopleForTest = fn;
}

/** The holder's records in the vault whose name holds the text (the package's find). */
export function findPeople(reading: PickerReading, vaultId: string, text: string, fetchImpl?: Fetch): Promise<FindResult> {
  if (findPeopleForTest) return findPeopleForTest(reading, vaultId, text, fetchImpl);
  return findCandidates(pickerFor(vaultId, reading, fetchImpl), { vaultId, text });
}

/** The vault was not one the signed-in person may write. */
export class NotTheHolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotTheHolderError";
  }
}

/** Ensures the vault's self card through the platform's door; answers the id the door names. */
export type EnsureCard = (vaultId: string, holderName: string) => Promise<{ id: string }>;

/*
 * NOTHING IN THE APP CALLS THE TWO FUNCTIONS BELOW ANY MORE. `recordPerson` takes the stater from the host's `adderCardOf`, ⛔ never from the
 * vault written to. They stay exported only because a rig test of the app still imports `holderSelfCard`.
 */
/**
 * READ ONLY: the vault's self card, as the card says its own `@id`, or null when the vault has none at its
 * derived address (the store answers 404). Makes nothing. Any other failure of the read is thrown.
 *
 * @param vaultId the vault whose own card is read
 * @param read the record read (a seam for tests)
 * @returns the card's entity IRI, or null when the vault has no card of its own
 */
export async function readHolderSelfCard(vaultId: string, read: typeof readRecord = readRecord): Promise<string | null> {
  const root = vaultRootOf(vaultId);
  if (!root) throw new NotTheHolderError(`${vaultId} is not a vault address`);
  const uri = await selfCardEntityUri(root);
  const card = await read(uri.slice(uri.lastIndexOf("/") + 1), uri);
  return card?.entityUri ?? null;
}

/**
 * The self card of the vault, as the card says its own `@id`. When the vault has none yet, it is
 * ensured through the platform's self-card door first (named `holderName`) and read back where the
 * door says it is. Refuses when the door refuses or the card cannot be read back.
 */
export async function holderSelfCard(
  vaultId: string,
  read: typeof readRecord = readRecord,
  ensure?: { card: EnsureCard; holderName: string },
): Promise<string> {
  const found = await readHolderSelfCard(vaultId, read);
  if (found) return found;
  const root = vaultRootOf(vaultId)!;
  if (!ensure)
    throw new NotTheHolderError("this vault has no card of its holder yet, so the person recorded would have no source");
  let made: { id: string };
  try {
    made = await ensure.card(vaultId, ensure.holderName);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new NotTheHolderError(`this vault's own card could not be made, so the person recorded would have no source (${why})`);
  }
  const at = `${root.replace(/\/+$/, "")}/e/${made.id}`;
  const ensured = await read(made.id, at);
  if (!ensured?.entityUri)
    throw new NotTheHolderError("this vault's own card was made but could not be read back, so the person recorded would have no source");
  return ensured.entityUri;
}

export interface RecordPersonInput {
  vault: ReachableVault;
  vaults: readonly ReachableVault[];
  /** The principal of the writing token. */
  agent: string;
  kind: KindFieldSet;
  name: string;
  boxes: readonly PersonBox[];
  values: Readonly<Record<string, string>>;
}

/**
 * Record the person: the package's `createRecord` into the named vault, the ADDER's own card (their card in their landing vault, made basic
 * first when they have none) as the stater. Refuses before any write in a vault the person may not write, and when there is no landing vault
 * to take the stater from. It never reads and never makes the written vault's own card.
 * The record's tag is the PLATFORM's (it makes the master at create; the package reads it back into `made.tag`). This takes no tag.
 */
export async function recordPerson(
  host: PersonCreateHost,
  deps: { reading: PickerReading; fetchImpl?: Fetch; queryClient?: QueryClient; email?: string | null },
  input: RecordPersonInput,
): Promise<CreateResult> {
  // A person may be recorded in ANY vault the signer may write (their own,
  // one inside it, or one shared with write). The source is the adder's own card in every one of them.
  if (!canWriteVault(input.vault)) throw new NotTheHolderError("you may not write to this vault, so a person cannot be recorded in it");
  const holder = await host.adderCardOf(input.vaults, deps.queryClient ?? fallbackQueryClient, { email: deps.email });
  try {
    return await createRecord(pickerFor(input.vault.vaultId, deps.reading, deps.fetchImpl), {
      vaultId: input.vault.vaultId,
      holder,
      agent: input.agent,
      kind: input.kind.kind,
      name: input.name,
      fields: fieldsFromBoxes(input.boxes, input.values),
    });
  } catch (e) {
    // A newer app on an older platform. The platform has no tag routes, so the record the create wrote has no tag, and ⛔ it is KEPT: data is never
    // deleted, retracted or rolled back because tags are missing. The create is a success without a tag; the Tags section says "This platform does not make tags
    // yet" (once), and the record is shown without a tag.
    if (e instanceof NoTagRoutesError && e.created) {
      return { created: true, record: e.created.record, vaultId: e.created.vaultId, tag: null, tagHandle: null, held: e.created.written.slice(0, -1) };
    }
    throw e;
  }
}

/**
 * After a create: the vault the create wrote into is remembered for the card, and the vault's own
 * list and every multi-vault list are read again, so the record shows at once in the Stakeholders
 * list it was recorded from. ⛔ No tag is shown or held here: the shown tag is the main tag (`useMainTag`).
 */
export function afterRecordPerson(host: PersonCreateHost, qc: QueryClient, made: CreateResult): Promise<void> {
  // The vault the create wrote into, for a card opened before any list holds the record (in Card view
  // no snapshot is on screen, so none is read again).
  host.rememberCreatedIn(qc, made.record.slice(made.record.lastIndexOf("/") + 1), made.vaultId);
  void qc.invalidateQueries({ queryKey: recordsKey(made.vaultId) });
  return refreshMultiVaultLists(qc);
}
