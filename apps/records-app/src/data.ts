// The records and the profile: what is stored, how it is listed, searched and written.
// GilbVeda terms used (all found by search, see RUNLOG.md): t:Thing, t:Person, a:name, a:description,
// a:email, a:phone, a:profilePhoto.
import { createRecord, patchRecord, readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { listVaultRecordsPage } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { textHits } from "@kaigilb/gilbplatformcode-text-filter";
import { appendFaceQuery, faceLocationFor, type UploadAck } from "@kaigilb/gilbplatformcode-face-crop";
import { lwsReadFetch } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { dpopWriteAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

export const THING_TYPE = "t:Thing";
export const PERSON_TYPE = "t:Person";

export interface Thing {
  id: string;
  entityUri: string;
  name: string;
  description: string;
}

export interface Profile {
  id: string;
  entityUri: string;
  etag: string | null;
  name: string;
  email: string;
  phone: string;
  photo: string;
}

export const EMPTY_PROFILE_FIELDS = { name: "", email: "", phone: "" };

/** A listed row (with its body) to a Thing. The body is the framed document the vault served. */
export function thingFromRow(row: { id: string; entityUri: string; label?: string | null; body?: Record<string, unknown> }): Thing {
  const b = row.body ?? {};
  const text = (k: string): string => {
    const v = b[k] ?? b[`a:${k}`];
    return typeof v === "string" ? v : "";
  };
  return { id: row.id, entityUri: row.entityUri, name: text("name") || row.label || "(unnamed)", description: text("description") };
}

/** The search: every word of the query must appear in the name or the description. */
export function searchThings(things: readonly Thing[], query: string): Thing[] {
  return things.filter((t) => textHits(query, [t.name, t.description]));
}

/** What a new record must carry; the form refuses an empty name before anything is sent. */
export function validateThing(name: string): string | null {
  return name.trim() === "" ? "Give the record a name." : null;
}

export async function listThings(vaultId: string): Promise<Thing[]> {
  const all: Thing[] = [];
  let offset = 0;
  for (let guard = 0; guard < 50; guard++) {
    const page = await listVaultRecordsPage(vaultId, ["Thing"], offset, { includeBody: true, limit: 100 });
    all.push(...page.records.map(thingFromRow));
    if (page.complete) break;
    offset = page.nextOffset ?? offset + (page.served ?? page.records.length);
  }
  return all;
}

export async function addThing(vaultId: string, name: string, description: string): Promise<{ id: string }> {
  const bad = validateThing(name);
  if (bad) throw new Error(bad);
  const facts: Record<string, string> = { name: name.trim() };
  if (description.trim()) facts.description = description.trim();
  return createRecord(vaultId, THING_TYPE, facts, name.trim());
}

export function profileFromRecord(rec: BaseRecord): Profile {
  const f = rec.facts;
  return {
    id: rec.id,
    entityUri: rec.entityUri ?? "",
    etag: rec.etag ?? null,
    name: f.name ?? "",
    email: f.email ?? "",
    phone: f.phone ?? "",
    photo: f.profilePhoto ?? "",
  };
}

/** The signed-in person's profile: the first t:Person record of their vault, or null when none yet. */
export async function loadProfile(vaultId: string): Promise<Profile | null> {
  const page = await listVaultRecordsPage(vaultId, ["Person"], 0, {});
  const row = page.records[0];
  if (!row) return null;
  const rec = await readRecord(row.id, row.entityUri);
  return rec ? profileFromRecord(rec) : null;
}

/** Create the profile, or change only the facts that differ (a cleared field is removed). */
export async function saveProfile(vaultId: string, current: Profile | null, next: { name: string; email: string; phone: string }): Promise<void> {
  if (!current) {
    const facts: Record<string, string> = {};
    for (const k of ["name", "email", "phone"] as const) if (next[k].trim()) facts[k] = next[k].trim();
    await createRecord(vaultId, PERSON_TYPE, facts, next.name.trim() || "Profile");
    return;
  }
  const patch: Record<string, string | null> = {};
  for (const k of ["name", "email", "phone"] as const) {
    const v = next[k].trim();
    if (v !== current[k]) patch[k] = v === "" ? null : v;
  }
  if (Object.keys(patch).length === 0) return;
  await patchRecord(current.id, patch, current.entityUri || null, undefined, { ifMatch: current.etag });
}

/**
 * Upload the picture and point the profile at it. HOST OBJECT written here (no unit uploads):
 * POST {vault host}/lws/vault/<vault>/files?face=whole with the raw bytes. The route and the `name`
 * query word are from the vault's Capability.Developer.FileUploadByApi text, NOT proven live.
 */
export async function uploadPhoto(vaultId: string, file: File): Promise<string> {
  const params = new URLSearchParams({ name: file.name });
  appendFaceQuery(params, null);
  const url = `${vaultOriginOf(vaultId)}/lws/vault/${encodeURIComponent(vaultId)}/files?${params}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...(await dpopWriteAuth("POST", url)), "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`The picture was not stored (HTTP ${res.status}).`);
  return faceLocationFor((await res.json()) as UploadAck);
}

export async function setProfilePhoto(vaultId: string, profile: Profile | null, file: File): Promise<void> {
  const location = await uploadPhoto(vaultId, file);
  if (!profile) {
    await createRecord(vaultId, PERSON_TYPE, { profilePhoto: location }, "Profile");
    return;
  }
  await patchRecord(profile.id, { profilePhoto: location }, profile.entityUri || null, undefined, { ifMatch: profile.etag });
}

/** The picture's bytes need the credential, so fetch them and show a blob address. */
export async function photoObjectUrl(vaultId: string, location: string): Promise<string | null> {
  if (!location) return null;
  const url = location.startsWith("http") ? location : `${vaultOriginOf(vaultId)}${location}`;
  const res = await lwsReadFetch(url);
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}
