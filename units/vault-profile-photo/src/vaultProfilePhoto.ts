/**
 * Vault/user profile photo: finds a vault's profile photo and loads it, and makes the vault's own card when it has none.
 *
 *   - Discovery: vault entity `a:mnbProfile` -> t:Person -> `a:profilePhoto` = `/files/<id>`
 *     (FILE-FIELD via the stored Person link. Never "newest Person-with-photo".)
 *   - Display: authenticated GET `/files/<id>` (a bare <img> cannot carry a Bearer)
 *
 * Filename / newest-file / hasPhoto / device cache are NOT the picture. The cache is paint-only; discovery overwrites it
 * from the Person fact.
 */

import { announceSelfCardMade } from "./selfCardMade";
import { ensureSelfCardRecord } from "./selfCardRecord";
import { entityIdTail, fileIdFromPhotoRef } from "./gilbPhotoRef";
import type { VaultProfilePhotoHost } from "./vaultProfilePhotoHost";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { downloadFile } from "@kaigilb/gilbplatformcode-file-download-outcome";
import { dpopReadAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { photoRefFromFacts } from "@kaigilb/gilbplatformcode-photo-term";
import { typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";
import { atVaultOrigin, selfCardIdForVault, vaultSegmentOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** The photo reference a record carries under ANY live spelling of the term, or null.
 *  Takes the resolved read set — it never consults a list of its own. */
function photoFactOf(facts: Record<string, string>, readKeys: readonly string[]): string | null {
  return photoRefFromFacts(facts, { readKeys }) as string | null;
}

/** The name on a self-card document this discovery already read. Not a second read. */
function personNameOf(facts: { name?: string } | null | undefined): string | null {
  const n = facts?.name?.trim();
  return n ? n : null;
}

/** MyNetBase vault-entity edge to the Person profile resource. */
export const PROFILE_POINTER_ATTR = "mnbProfile";

const localPointerKey = (vaultEntityId: string) => `mnb.profilePointer.${vaultEntityId}`;
/** Survives when Person create/patch is refused — still shows photo after reload. */
const localPhotoKey = (vaultKey: string) => `mnb.profilePhotoRef.${vaultKey}`;

/**
 * The vault ROOT exactly as Base stores and hashes it — `https://<host>/base` or
 * `https://<host>/vault`. ⛔ Built from the SAME decomposition `personEntityUri` uses below, so
 * the address this app derives and the address it writes to cannot drift apart.
 */
export function vaultRootOf(vaultNamespace: string): string | null {
  try {
    const u = new URL(vaultNamespace);
    return `${u.protocol}//${u.host}${vaultSegmentOf(u.href)}`;
  } catch {
    return null;
  }
}

/** In-tab memory so cycling Vaults ↔ Nodes does not flash empty while network rediscovers. */
const memoryPhotoByVault = new Map<string, string>();

function cacheKeys(vaultId: string, vaultEntityUri: string | null | undefined): string[] {
  const keys: string[] = [vaultId];
  if (vaultEntityUri) {
    const tail = entityIdTail(vaultEntityUri);
    if (tail) keys.push(tail);
    keys.push(vaultEntityUri);
  }
  return [...new Set(keys.filter(Boolean))];
}

function readCachedPhotoRef(vaultId: string, vaultEntityUri: string | null | undefined): string | null {
  const mem = memoryPhotoByVault.get(vaultId);
  if (mem && fileIdFromPhotoRef(mem)) return normalizePhotoRef(mem);

  if (typeof localStorage === "undefined") return null;
  for (const k of cacheKeys(vaultId, vaultEntityUri)) {
    try {
      const v = localStorage.getItem(localPhotoKey(k));
      if (v && fileIdFromPhotoRef(v)) {
        const ref = normalizePhotoRef(v);
        memoryPhotoByVault.set(vaultId, ref);
        return ref;
      }
    } catch {
      /* private mode */
    }
  }
  return null;
}

function writeCachedPhotoRef(
  host: VaultProfilePhotoHost,
  vaultId: string,
  vaultEntityUri: string | null | undefined,
  photoRef: string,
): void {
  const ref = normalizePhotoRef(photoRef);
  memoryPhotoByVault.set(vaultId, ref);
  host.noteVaultPicture?.(vaultId, true);
  if (typeof localStorage === "undefined") return;
  for (const k of cacheKeys(vaultId, vaultEntityUri)) {
    try {
      localStorage.setItem(localPhotoKey(k), ref);
    } catch {
      /* private mode */
    }
  }
}

/**
 * Instant photo ref for UI paint (memory + localStorage) — no network.
 * Use on mount so navigating away and back does not blank the avatar first.
 */
export function peekCachedProfilePhoto(
  vaultId: string,
  vaultEntityUri?: string | null,
): string | null {
  return readCachedPhotoRef(vaultId, vaultEntityUri);
}

function clearCachedPhotoRef(host: VaultProfilePhotoHost, vaultId: string, vaultEntityUri: string | null | undefined): void {
  memoryPhotoByVault.delete(vaultId);
  host.noteVaultPicture?.(vaultId, false);
  if (typeof localStorage === "undefined") return;
  for (const k of cacheKeys(vaultId, vaultEntityUri)) {
    try {
      localStorage.removeItem(localPhotoKey(k));
    } catch {
      /* private mode */
    }
  }
}

export interface VaultProfilePhotoState {
  profileId: string | null;
  photoRef: string | null;
  /** Non-fatal note when bytes are saved but Person linkage was refused. */
  warning?: string | null;
  /**
   * `/files/<id>` of the MASTER behind the shown face, when this save made one.
   *
   * ⚠ IN-MEMORY ONLY, for the screen that is already open. It is ⛔ NOT a stored fact and
   * ⛔ must never become one: BVedanta refused a person-level "original photo" predicate
   * outright (BVGATE-BAPP188.4 R2, category `wrong-subject`) because it forces the shared
   * reader plural and creates a second scalar that can silently disagree. The DURABLE link is
   * `a:croppedFrom` on the lean file's own entity, read back with masterBehindFace().
   */
  masterRef?: string | null;
  /** A true sentence when no lean face was made, else null. */
  leanFaceNotice?: string | null;
  /**
   * The name on the owner's own card, taken from the self-card document this discovery
   * already read. Null when that document was not read or carries no name. No extra request.
   */
  personName?: string | null;
}

/**
 * Discovers the profile photo for a vault.
 *
 * FILE-FIELD via the stored Person link (census T16 / C10):
 * `a:mnbProfile` → Person `a:profilePhoto`. That **is** the face.
 * ⛔ Newest Person-with-photo. ⛔ `profile-photo*` filename. A miss is a miss.
 */
export async function discoverVaultProfilePhoto(
  host: VaultProfilePhotoHost,
  vaultEntityUri: string | null | undefined,
  vaultId?: string | null,
): Promise<VaultProfilePhotoState> {
  /** Best Person id found even when the photo attribute is still empty. */
  let knownProfileId: string | null = null;
  /** Name on the self card, from a document this function already reads. */
  let knownName: string | null = null;
  // Resolved ONCE per discovery, from the term — not from a list in this file.
  const readKeys = await host.photoReadKeys();

  if (vaultEntityUri) {
    const vaultEntityId = entityIdTail(vaultEntityUri);
    const fromVault = await readPointerFromVaultEntity(vaultEntityId, vaultEntityUri);
    const fromLocal =
      typeof localStorage !== "undefined" ? localStorage.getItem(localPointerKey(vaultEntityId)) : null;
    const candidates = [fromVault, fromLocal].filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );

    for (const pointer of candidates) {
      const profileId = entityIdTail(pointer);
      // Skip empty / WebID tails / self (vault entity is not a Person card).
      if (!profileId || profileId === vaultEntityId) continue;
      try {
        const rec = await readRecord(profileId, pointer);
        if (!rec) continue;
        knownProfileId = profileId;
        knownName = knownName ?? personNameOf(rec.facts);
        const raw = photoFactOf(rec.facts, readKeys);
        const photoRef = raw ? normalizePhotoRef(raw) : null;
        if (photoRef) {
          if (vaultId) writeCachedPhotoRef(host, vaultId, vaultEntityUri, photoRef);
          try {
            localStorage.setItem(localPointerKey(vaultEntityId), profileId);
          } catch {
            /* private mode */
          }
          return { profileId, photoRef, personName: knownName };
        }
        // Stored Person exists; FILE-FIELD is empty. ⛔ Not newest Person-with-photo.
      } catch {
        /* stale pointer — try next */
      }
    }
  }

  // ── THE DERIVED ROAD — no pointer, no cache, no round trip to another service ─────────────
  //
  // 🔴 THIS IS THE ROAD THAT ACTUALLY WORKS ON A CLEAN RELOAD, and the three above it are each
  // conditional. Measured on production 2026-09-16 for a user vault:
  // the self-card EXISTS at `…/e/vsc-3b3c73c130b73b3db389369c` and carries
  // `a:profilePhoto = "/files/xc1sgm0mcqpb"`, while the vault's own record carries NO pointer
  // to it — `a:vaultSelfCard` has zero writers anywhere, so no vault has one. ⇒ the pointer road
  // can never answer; the localStorage road answers only on the device that saved it; and the
  // photo therefore painted after a save and reverted to initials on reload. The user's words
  // for that were "the profile picture is not saved" — and it was saved the whole time.
  //
  // Base mints the self-card at a DERIVED address (`vsc-` + sha256(vault root), 24 hex), so the
  // address is computable from the vault root alone. ⛔ The derivation lives in `gilb-photo`,
  // ⛔ never inlined here: two apps agreeing on a constant is not interoperability — two apps
  // running the same derivation is. Its test pins it against the measured production address.
  if (vaultId) {
    try {
      const root = vaultRootOf(vaultId);
      if (root) {
        const derivedId = await selfCardIdForVault(root);
        // Address it AT ITS OWN VAULT — Base routes a dereference by the host the request names
        // and answers about no other vault. A default origin here would 404 a card that exists.
        const rec = await readRecord(derivedId, `${root}/e/${derivedId}`);
        if (rec) {
          knownProfileId = knownProfileId ?? derivedId;
          knownName = knownName ?? personNameOf(rec.facts);
          const raw = photoFactOf(rec.facts, readKeys);
          const photoRef = raw ? normalizePhotoRef(raw) : null;
          if (photoRef) {
            writeCachedPhotoRef(host, vaultId, vaultEntityUri, photoRef);
            if (vaultEntityUri) {
              try {
                localStorage.setItem(localPointerKey(entityIdTail(vaultEntityUri)), derivedId);
              } catch {
                /* private mode */
              }
            }
            return { profileId: derivedId, photoRef, personName: knownName };
          }
          // The card is there and its photo field is empty — a real "no photo yet", ⛔ not a
          // failed lookup. Fall through; a later road may still know better.
        }
      }
    } catch {
      // ⛔ A failed read is NOT evidence of absence (RuleBaseevidStateRowNotExistence). Try on.
    }
  }

  // ── OPTION B — the CROSS-APP road, when the vault's own pointer did not answer ────────────
  // "A profile picture made by one app should type it as such in the base db
  // and then any other app that uses a profile picture must use the same type ontology and
  // display the profile picture."
  //
  // This is that road, and it is ⛔ NOT a widening of the Person scan the C10 guard refuses
  // (vaultProfilePhoto.test.ts:175). The difference is the whole point:
  //   • the refused scan asks "is there ANY Person here with a photo?" — in a vault full of
  //     CONTACTS that shows someone else's face as the vault's, which is why it is forbidden;
  //   • this asks Base "what is the published photo OF THIS PRINCIPAL?" — an identity join,
  //     answered by the server, for exactly one person.
  //
  // Measured 2026-09-09: `GET /base/connect/resolve-person?input=<the person's address>/i`
  // returns the principal `<the person's address>/base` — i.e. on this deployment a person vault's
  // ROOT IS the principal, so no Control-gated ACL read is needed to learn who owns it. A
  // non-person vault (company, project, system) answers 404 `not_a_person`, which is the honest
  // "no face" and is why this cannot invent one.
  //
  // MyNetBase already reads contact photos exactly this way (`lib/card/publicCard.ts` →
  // `photoUrl`), so this makes the two apps agree by construction rather than by convention.
  if (vaultId) {
    const url = `${baseOrigin()}/base/connect/public-card?principal=${encodeURIComponent(vaultId)}`;
    try {
      const res = await fetch(url, { headers: { ...(await dpopReadAuth("GET", url)) } });
      if (res.ok) {
        const body = (await res.json()) as { photoUrl?: string | null };
        const photoUrl = body.photoUrl?.trim();
        if (photoUrl) {
          // ⛔ Kept as the MEDIATED path Base handed back. It is rung-gated per viewer and is
          // ⛔ never a raw `/files/<id>` — the card route refuses to disclose one.
          writeCachedPhotoRef(host, vaultId, vaultEntityUri, photoUrl);
          return { profileId: knownProfileId, photoRef: photoUrl, personName: knownName };
        }
      }
      // 404 `not_a_person`, or 200 with photoUrl null, are both real answers: no face. Fall
      // through to the honest miss rather than trying a third road.
    } catch {
      // A transport failure says nothing about whether a photo exists.
    }
  }

  // Ontology says no photo — drop a cached ref so this app cannot show a different face.
  if (vaultId) clearCachedPhotoRef(host, vaultId, vaultEntityUri);
  return { profileId: knownProfileId, photoRef: null, personName: knownName };
}

async function readPointerFromVaultEntity(
  vaultEntityId: string,
  vaultEntityUri: string | null,
): Promise<string | null> {
  try {
    const rec = await readRecord(vaultEntityId, vaultEntityUri);
    if (!rec) return null;
    const edge = rec.facts[PROFILE_POINTER_ATTR];
    return typeof edge === "string" && edge.trim() ? edge.trim() : null;
  } catch {
    return null;
  }
}

function normalizePhotoRef(raw: string): string {
  const id = fileIdFromPhotoRef(raw);
  if (id) return `/files/${id}`;
  if (raw.startsWith("/files/")) return raw;
  // Bare file entity id.
  if (/^[a-z0-9_-]+$/i.test(raw) && !raw.includes(":")) return `/files/${raw}`;
  return raw;
}

/**
 * Fetch photo bytes with the session Bearer and return an object URL.
 * Caller must revoke the URL when done (only on unmount / photoRef change after paint).
 */
export async function loadPhotoObjectUrl(
  photoRef: string,
  /**
   * 🔴 THE VAULT THE FILE LIVES IN — the fix for "Photo is linked but could not be loaded".
   *
   * MEASURED 2026-09-09 (Kai, `danieltesterbil`): discovery SUCCEEDED — the ref was found and
   * the pane said "linked" — and the BYTES 404'd. `normalizePhotoRef` reduces every reference
   * to a bare `/files/<id>`, DISCARDING the host, and `downloadFile(id, null)` then addresses
   * `vaultOriginOf(null)` = `baseOrigin()`. On production that is the APEX, and `files.ts` states
   * it outright: "the APEX, which holds no vault's files."
   *
   * So a host-less ref can never load for any vault but whichever one the apex happens to route
   * to — which is exactly why Kai's landing-vault face appeared and his second vault's did not.
   * ⛔ A 404 from the apex is evidence about our reach, never about the vault
   * (the address is not the container).
   */
  door?: string | null,
): Promise<string | null> {
  // The MEDIATED card path (`/base/connect/profile-photo?principal=…`) is not a file id and
  // must not be run through the file loader — it is Base's own rung-gated byte route, fetched
  // directly with the session credential. ⛔ Never a bare <img src>: the browser attaches no
  // Bearer/DPoP, which silently downgrades an entitled read to the anonymous rung and renders
  // "no photo" for a photo this viewer is entitled to see
  // (a private file is displayed through an authenticated fetch).
  if (photoRef.includes("/base/connect/profile-photo")) {
    // The ref may come from a served card or a record fact: ask only a platform host.
    // A host-less ref is RESOLVED against baseOrigin(), never glued to it as text: glued, the ref's own
    // text chose the host (a ref beginning `.evil.example/…` would have named a host of its own).
    let url: string;
    try {
      url = atVaultOrigin(new URL(photoRef, baseOrigin()).href);
    } catch {
      return null;
    }
    try {
      const res = await fetch(url, { headers: { ...(await dpopReadAuth("GET", url)) } });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }

  const id = fileIdFromPhotoRef(photoRef);
  if (!id) return null;
  try {
    // C144 — `photoRef` may be a fully-qualified `https://<vaultHost>/files/<id>` or
    // `…/base/e/<id>`; when it is, the bytes are fetched at THAT vault's door.
    //
    // ⚠ AND WHEN IT IS NOT, THE CALLER'S VAULT IS THE DOOR — no longer a baseOrigin() fallback.
    // The file belongs to the vault whose profile this is, so that vault's own address is the
    // right one; the apex is the one address guaranteed to hold no file at all.
    const at = photoRef.includes("://") ? photoRef : (door ?? null);
    const blob = await downloadFile(id, at);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * ENSURE the vault's own self card through the platform's idempotent door
 * (`POST /lws/vault/<vaultId>/selfcard`, {@link ensureSelfCardRecord}), and return it.
 *
 * The ONE place GilbApp builds the self card's create body, so the photo paths and the adder's basic
 * card (made in the person's landing vault only, ⛔ never in the vault a stakeholder is written to) send the same
 * card: its type, the facts the caller adds, and the holder's display name under `name` when one
 * is given. An existing card is adopted UNTOUCHED by the platform (200), so the body only ever
 * seeds a card that did not exist.
 *
 * ⚠ The self card's write type is named here,
 * once, and nowhere else in GilbApp.
 */
export async function ensureVaultSelfCard(
  vaultId: string,
  facts: Record<string, string>,
  displayName?: string,
): Promise<{ id: string; etag: string | null; adopted: boolean }> {
  const type = typeUriForVaultNamespace("Person", vaultId);
  const body: Record<string, string> = { ...facts };
  if (displayName?.trim()) body.name = displayName.trim();
  const made = await ensureSelfCardRecord(vaultId, type, body);
  // A card read earlier as "none" is read again (an open card shows its sections at once).
  announceSelfCardMade(vaultId);
  return made;
}
