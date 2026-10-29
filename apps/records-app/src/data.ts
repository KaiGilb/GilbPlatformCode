// The entries and the holder's own card: what is stored, how it is listed, searched and written.
// GilbVeda terms: the entry type (RECORD_TYPE, pending), a:name, a:description; the own card carries
// a:name, a:email, a:phone, a:profilePhoto (spelling from photo-term). Findings: RUNLOG.md.
import { createRecord, patchRecord, readRecord, writeSource, type BaseRecord, type WriteSource } from "@kaigilb/gilbplatformcode-lws-records";
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

export const RECORD_TYPE = "t:Thing"; // PENDING Agent.Concept: purpose-fit type; t:Thing must not ship.
export const RECORD_LIST_TYPE = RECORD_TYPE.replace(/^t:/, "");

/** VITE_SUPERSEDE_ONLY=1: this run only changes existing records (nothing is added, no picture is stored). */
export const supersedeOnly = (): boolean => import.meta.env.VITE_SUPERSEDE_ONLY === "1";

export class SupersedeOnlyError extends Error {
  constructor(what: string) {
    super(`This run changes existing records only; ${what} is off.`);
    this.name = "SupersedeOnlyError";
  }
}

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

export async function addEntry(vaultId: string, name: string, description: string): Promise<{ id: string }> {
  if (supersedeOnly()) throw new SupersedeOnlyError("adding records");
  const bad = validateEntry(name);
  if (bad) throw new Error(bad);
  const facts: Record<string, string> = { name: name.trim() };
  if (description.trim()) facts.description = description.trim();
  return createRecord(vaultId, RECORD_TYPE, facts, name.trim());
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
export async function saveProfile(card: OwnCard, next: { name: string; email: string; phone: string }): Promise<SaveResult> {
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

// ---- the picture -----------------------------------------------------------------------------

/**
 * PUT {vault}/lws/vault/<vault>/files?name=&face=whole, raw bytes, DPoP write proof, ack { entity }.
 * GilbApp 9a602ea7 src/lib/base/files.ts:189,198,223-239; photo ref `/files/<id>` of the face: vaultProfilePhoto.ts:891.
 */
export async function uploadPhoto(vaultId: string, file: File): Promise<string> {
  if (supersedeOnly()) throw new SupersedeOnlyError("storing pictures");
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

/** Upload, then point the own card at the file: patch `profilePhoto` (vaultProfilePhoto.ts:504). Without a card nothing is uploaded. */
export async function setProfilePhoto(vaultId: string, card: OwnCard | null, file: File): Promise<void> {
  if (supersedeOnly()) throw new SupersedeOnlyError("storing pictures");
  if (!card) throw new Error("No profile card was found in your vault.");
  needAddress(card);
  const location = await uploadPhoto(vaultId, file);
  const slug = (await photoTerm.get()).writeKeyBare;
  await patchRecord(card.id, { [slug]: location }, card.entityUri, card.source[0], { ifMatch: card.etag });
}

/** The picture's bytes need the credential, so fetch them and show a blob address. */
export async function photoObjectUrl(vaultId: string, location: string): Promise<string | null> {
  const url = photoBytesUrl(location, vaultOriginOf(vaultId));
  if (!url) return null;
  const res = await lwsReadFetch(url);
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
