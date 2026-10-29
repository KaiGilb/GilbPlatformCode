// The entries and the holder's own card: what is stored, how it is listed, searched and written.
// GilbVeda terms: the entry type (RECORD_TYPE, pending), a:name, a:description; the own card carries
// a:name, a:email, a:phone, a:profilePhoto (spelling from photo-term). Findings: RUNLOG.md.
import { createRecord, patchRecord, readRecord, storedSpellings, writeSource, type BaseRecord, type RecordCreateFacts, type WriteSource } from "@kaigilb/gilbplatformcode-lws-records";
import { typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";
import { listVaultRecordsPage, lwsReadFetch } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { textHits } from "@kaigilb/gilbplatformcode-text-filter";
import { appendFaceQuery, faceLocationFor, type UploadAck } from "@kaigilb/gilbplatformcode-face-crop";
import { dpopWriteAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { vaultOriginOf, LWS_VAULT_FILES_URL } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { photoBytesUrl } from "@kaigilb/gilbplatformcode-photo-ref";
import { createPhotoTermResolver, photoRefFromFacts } from "@kaigilb/gilbplatformcode-photo-term";
import { ownCardFindingQuery } from "@kaigilb/gilbplatformcode-plan-self-source";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { VEDA_ORIGIN } from "./platform";
import { sameUrl } from "./sameUrl";

// Minted by Agent.Concept 2026-10-29: https://veda.gilb.com/base/t/CatalogEntry (Suggested; a:name and a:description list it in a:fieldOf).
export const RECORD_TYPE = "t:CatalogEntry";
export const RECORD_LIST_TYPE = RECORD_TYPE.replace(/^t:/, "");

/**
 * Creates of RECORDS are allowed ONLY when VITE_ALLOW_CREATE=1 AND the vault is the pinned one
 * (VITE_VAULT_URL, compared as pickVault compares). Anything else is read and change-only.
 */
export const createsAllowed = (vaultId: string): boolean =>
  import.meta.env.VITE_ALLOW_CREATE === "1" && sameUrl(vaultId, import.meta.env.VITE_VAULT_URL ?? "");

export class CreateNotAllowedError extends Error {
  constructor(what: string) {
    super(`This run changes existing records only; ${what} is off.`);
    this.name = "CreateNotAllowedError";
  }
}

const needCreate = (vaultId: string, what: string): void => {
  if (!createsAllowed(vaultId)) throw new CreateNotAllowedError(what);
};

/**
 * Changes to the signed-in person's OWN card (a patch, the picture, the self-card door) are allowed ONLY when
 * VITE_PROFILE_WRITE=1 AND the profile vault carries "write". Separate from the create gate; the pinned vault does not matter.
 */
export const profileWritesAllowed = (vault: { vaultId: string; modes?: readonly string[] }): boolean =>
  import.meta.env.VITE_PROFILE_WRITE === "1" && (vault.modes ?? []).includes("write");

export class ProfileWriteNotAllowedError extends Error {
  constructor(what: string) {
    super(`Changing your profile is off in this run; ${what} is refused.`);
    this.name = "ProfileWriteNotAllowedError";
  }
}

type ProfileVaultRef = { vaultId: string; modes?: readonly string[] };
const needProfileWrite = (vault: ProfileVaultRef, what: string): void => {
  if (!profileWritesAllowed(vault)) throw new ProfileWriteNotAllowedError(what);
};

export interface Entry {
  id: string;
  entityUri: string;
  name: string;
  description: string;
}

/** A listed row (with its body) to an Entry. The body is the framed document the vault served. */
export function entryFromRow(row: { id: string; entityUri: string; label?: string | null; body?: Record<string, unknown> }): Entry {
  const b = row.body ?? {};
  const text = (k: string): string => {
    const v = b[k] ?? b[`a:${k}`];
    return typeof v === "string" ? v : "";
  };
  return { id: row.id, entityUri: row.entityUri, name: text("name") || row.label || "(unnamed)", description: text("description") };
}

/** The search: every word of the query must appear in the name or the description. */
export function searchEntries(entries: readonly Entry[], query: string): Entry[] {
  return entries.filter((t) => textHits(query, [t.name, t.description]));
}

export function validateEntry(name: string): string | null {
  return name.trim() === "" ? "Give the record a name." : null;
}

export const MAX_LIST_PAGES = 50;

export async function listEntries(vaultId: string): Promise<Entry[]> {
  const all: Entry[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const p = await listVaultRecordsPage(vaultId, [RECORD_LIST_TYPE], offset, { includeBody: true, limit: 100 });
    all.push(...p.records.map(entryFromRow));
    if (p.complete) return all;
    offset = p.nextOffset ?? offset + (p.served ?? p.records.length);
  }
  throw new Error(`The list is longer than ${MAX_LIST_PAGES} pages (${MAX_LIST_PAGES * 100} records); the app stops there rather than show a part as the whole.`);
}

/** Create, then READ THE RECORD BACK by its id and address: confirmed only when the read-back holds the name. */
export async function addEntry(vaultId: string, name: string, description: string): Promise<{ id: string; confirmed: boolean }> {
  needCreate(vaultId, "adding records");
  const bad = validateEntry(name);
  if (bad) throw new Error(bad);
  const facts: Record<string, string> = { name: name.trim() };
  if (description.trim()) facts.description = description.trim();
  const { id } = await createRecord(vaultId, RECORD_TYPE, facts, name.trim());
  const back = await readRecord(id, `${vaultId.replace(/\/+$/, "")}/e/${id}`);
  const served = back?.served?.facts ?? back?.facts ?? {};
  return { id, confirmed: back !== null && (back.facts.name ?? firstText(served.name)) === name.trim() };
}

// ---- the holder's own card -------------------------------------------------------------------

export interface OwnCard {
  id: string;
  entityUri: string;
  etag: string | null;
  road: "pointer" | "derived";
  source: WriteSource[];
  name: string;
  email: string;
  phone: string;
  /** How many more emails / phones the card holds beyond the first (kept untouched on save). */
  moreEmails: number;
  morePhones: number;
  photo: string;
  /** The values as served (a list stays a list), so a save keeps the rows it does not edit. */
  rawEmail: unknown;
  rawPhone: unknown;
}

export type ProfileState = { kind: "none" } | { kind: "card"; card: OwnCard; otherOwnerCards: string[] };

const asList = (v: unknown): unknown[] => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);
const firstText = (v: unknown): string => {
  const x = asList(v)[0];
  return typeof x === "string" ? x : "";
};

const photoTerm = createPhotoTermResolver({ vedaOrigin: VEDA_ORIGIN });

export async function cardFromRecord(rec: BaseRecord, road: "pointer" | "derived"): Promise<OwnCard> {
  const served = rec.served?.facts ?? rec.facts;
  const term = await photoTerm.get();
  return {
    id: rec.id,
    entityUri: rec.entityUri ?? "",
    etag: rec.etag ?? null,
    road,
    source: writeSource(rec),
    name: rec.facts.name ?? firstText(served.name),
    email: firstText(served.email),
    phone: firstText(served.phone),
    moreEmails: Math.max(0, asList(served.email).length - 1),
    morePhones: Math.max(0, asList(served.phone).length - 1),
    photo: photoRefFromFacts(served as Record<string, unknown>, term) ?? "",
    rawEmail: served.email,
    rawPhone: served.phone,
  };
}

/**
 * The holder's own card by hard identity (own-card via plan-self-source's finding): the profile
 * pointer or the derived self-card. Never a listing, never the first t:Person. No card: kind "none".
 */
export async function loadProfile(vault: ReachableVault): Promise<ProfileState> {
  const finding = await ownCardFindingQuery(vault).queryFn();
  if (!finding.cardId || (finding.road !== "pointer" && finding.road !== "derived")) return { kind: "none" };
  const rec = await readRecord(finding.cardId, finding.cardUri);
  if (!rec) return { kind: "none" };
  return { kind: "card", card: await cardFromRecord(rec, finding.road), otherOwnerCards: finding.otherOwnerCards };
}

/** Rebuild a multi-valued contact term with its first value replaced and the rest kept. */
function withFirst(raw: unknown, value: string): unknown {
  const rest = asList(raw).slice(1);
  return rest.length === 0 ? value : [value, ...rest];
}

/** A patch with no address could reach the default vault; refuse it. */
function needAddress(card: OwnCard): void {
  if (!card.entityUri) throw new Error("The profile card was read with no address, so it cannot be changed safely.");
}

export interface SaveResult {
  /** True only when the read-back shows every edited value under the server's READ key (the bare slug). */
  confirmed: boolean;
  failed: string[];
}

/**
 * Change only the facts that differ on the own card, then READ THE CARD AGAIN: a write can be accepted and
 * stored under a key the read does not return (RuleRigdevLwsReadWriteKeyShape), so "saved" needs the read-back.
 */
export async function saveProfile(vault: ProfileVaultRef, card: OwnCard, next: { name: string; email: string; phone: string }): Promise<SaveResult> {
  needProfileWrite(vault, "saving the profile");
  const patch: Record<string, string | readonly unknown[] | null> = {};
  if (next.name.trim() !== card.name) patch.name = next.name.trim() || null;
  for (const k of ["email", "phone"] as const) {
    const v = next[k].trim();
    if (v === card[k]) continue;
    const more = k === "email" ? card.moreEmails : card.morePhones;
    if (v === "" && more === 0) patch[k] = null;
    else patch[k] = (more === 0 ? v : withFirst(k === "email" ? card.rawEmail : card.rawPhone, v)) as string | readonly unknown[];
  }
  if (Object.keys(patch).length === 0) return { confirmed: true, failed: [] };
  needAddress(card);
  await patchRecord(card.id, patch, card.entityUri, card.source[0], { ifMatch: card.etag });
  const back = await readRecord(card.id, card.entityUri);
  const served = back?.served?.facts ?? back?.facts ?? {};
  const failed = Object.entries(patch).filter(([slug, want]) => {
    const got = asList(served[slug]);
    if (want === null) return got.length > 0;
    return Array.isArray(want) ? !(want as unknown[]).every((w) => got.includes(w)) : !got.includes(want);
  }).map(([slug]) => slug);
  return { confirmed: back !== null && failed.length === 0, failed: back === null ? Object.keys(patch) : failed };
}

// ---- the own card: create through the idempotent self-card door ------------------------------
// HOST OBJECT. Library gap: lws-records has createRecord but no ensureSelfCardRecord (RUNLOG.md, batch 6).

/** 409 SelfCardIdentityUnknown: the vault holds an ambiguous pile and says which is yours nowhere. A refusal, never a reason to create. */
export class SelfCardRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfCardRefusedError";
  }
}

export interface ProfileInput {
  name: string;
  email: string;
  phone: string;
}

/** The id out of a `…/lws/r/<id>` address (the Location header or the body's @id), as createRecord reads it. */
const idFromResourceUrl = (url: string): string => {
  const marker = "/lws/r/";
  const i = url.indexOf(marker);
  return i === -1 ? url : url.slice(i + marker.length);
};

/**
 * POST {origin}/lws/vault/<vault>/selfcard: 201 created, 200 ADOPTED (the existing card, untouched, our facts NOT written).
 * Copied from GilbApp bf1d681c src/lib/base/records.ts:561-602; server GilbPlatform src/lws/routes.ts:772-807 (route at 783).
 * No Slug header: this door mints at a derived address. 409 is a refusal; any other status throws with the status.
 */
export async function ensureSelfCard(vault: ProfileVaultRef, input: ProfileInput): Promise<{ id: string; etag: string | null; adopted: boolean }> {
  needProfileWrite(vault, "creating the profile card");
  const vaultId = vault.vaultId;
  const url = `${vaultOriginOf(vaultId)}/lws/vault/${encodeURIComponent(vaultId)}/selfcard`;
  const given: RecordCreateFacts = {};
  for (const k of ["name", "email", "phone"] as const) if (input[k].trim() !== "") given[k] = input[k].trim();
  // Same wire spelling createRecord uses for facts it authors: the stored spelling of each slug (a: + slug).
  const spell = await storedSpellings(Object.keys(given), undefined);
  const facts: Record<string, unknown> = {};
  for (const [slug, value] of Object.entries(given)) {
    const key = spell(slug);
    if (key !== null) facts[key] = value;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { ...(await dpopWriteAuth("POST", url)), "content-type": "application/json" },
    body: JSON.stringify({ type: typeUriForVaultNamespace("Person", vaultId), facts }),
    keepalive: true,
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { message?: unknown };
    throw new SelfCardRefusedError(typeof body.message === "string" && body.message ? body.message : "The vault could not tell which card is yours, so it made none.");
  }
  if (res.status !== 200 && res.status !== 201) throw new Error(`The profile card was not created (HTTP ${res.status}).`);
  const location = res.headers.get("location");
  const id = location ? idFromResourceUrl(location) : idFromResourceUrl(String(((await res.json().catch(() => ({}))) as Record<string, unknown>)["@id"] ?? ""));
  return { id, etag: res.headers.get("etag"), adopted: res.status === 200 };
}

/** True when the card holds every non-empty value typed (the read-back test for "created"). */
export function cardHolds(card: OwnCard, typed: ProfileInput): boolean {
  return (["name", "email", "phone"] as const).every((k) => typed[k].trim() === "" || card[k] === typed[k].trim());
}

/**
 * Ensure the card through the door. An ADOPTED card was returned untouched, so the typed values follow by the saveProfile patch
 * (the card is read first for its etag). The caller refetches the own-card finding and checks {@link cardHolds}.
 */
export async function createProfileCard(vault: ReachableVault, typed: ProfileInput): Promise<{ id: string; etag: string | null; adopted: boolean; save?: SaveResult }> {
  const made = await ensureSelfCard(vault, typed);
  if (!made.adopted) return made;
  const state = await loadProfile(vault);
  if (state.kind !== "card") return made;
  return { ...made, save: await saveProfile(vault, state.card, typed) };
}

// ---- the picture -----------------------------------------------------------------------------

/**
 * PUT {vault}/lws/vault/<vault>/files?name=&face=whole, raw bytes, DPoP write proof, ack { entity }.
 * GilbApp 9a602ea7 src/lib/base/files.ts:189,198,223-239; photo ref `/files/<id>` of the face: vaultProfilePhoto.ts:891.
 */
export async function uploadPhoto(vault: ProfileVaultRef, file: File): Promise<string> {
  needProfileWrite(vault, "storing pictures");
  const vaultId = vault.vaultId;
  const params = new URLSearchParams({ name: file.name });
  appendFaceQuery(params, null);
  const url = `${LWS_VAULT_FILES_URL(vaultId)}?${params}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...(await dpopWriteAuth("PUT", url)), "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`The picture was not stored (HTTP ${res.status}).`);
  return faceLocationFor((await res.json()) as UploadAck);
}

/**
 * Upload, then point the own card at the file (patch `profilePhoto`, vaultProfilePhoto.ts:504), then READ THE CARD AGAIN:
 * confirmed only when the card's photo fact equals the uploaded location under the read key. Without a card nothing is uploaded.
 */
export async function setProfilePhoto(vault: ProfileVaultRef, card: OwnCard | null, file: File): Promise<SaveResult> {
  needProfileWrite(vault, "storing pictures");
  if (!card) throw new Error("No profile card was found in your vault.");
  needAddress(card);
  const location = await uploadPhoto(vault, file);
  const slug = (await photoTerm.get()).writeKeyBare;
  await patchRecord(card.id, { [slug]: location }, card.entityUri, card.source[0], { ifMatch: card.etag });
  const back = await readRecord(card.id, card.entityUri);
  const held = back ? (await cardFromRecord(back, card.road)).photo : "";
  return held === location ? { confirmed: true, failed: [] } : { confirmed: false, failed: [slug] };
}

/** The picture's bytes need the credential, so fetch them and show a blob address. */
export async function photoObjectUrl(vaultId: string, location: string): Promise<string | null> {
  const url = photoBytesUrl(location, vaultOriginOf(vaultId));
  if (!url) return null;
  const res = await lwsReadFetch(url);
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
