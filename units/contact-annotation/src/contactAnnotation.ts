// The client of the holder-only My Note and Where / How we met: `GET /base/connect/annotations?heldParty=` and `PUT /base/connect/annotations`
// (`t:ContactPrivateNote` / `a:contactPrivateNote`, `t:ConnectionOrigin` / `a:connectionOrigin`, keyed to `a:heldParty`, written private by the route).
// The shapes, the strict reads and the failure rules are the same as the MyNet app's client of the same route. What differs, and why:
//   - the transport is the host's own DPoP credential (`lws-session-bridge`), asked at the node that holds the card's vault (`vaultOriginOf`), as the
//     held-claim find is. The card's vault is NAMED by the caller (a card is a record in a vault, not always the signed-in holder's own);
//   - the route resolves the READ's vault from the authenticated principal and the WRITE's from the body's `vaultId`: the two agree only for the
//     principal's own vault, so a card held in another vault is offered no note here (`annotationsFit`);
//   - the favourite half of the route is not carried (a held card has no favourite).
// Measured on a scratch rig: PUT 201, GET 200; another signed-in caller reads `notes: []`, anonymous 401. A note and a "where we met" line are the
// holder's only.
//
// The two requests are addressed differently, and that is deliberate (the measured route table of the MyNet app):
//   - PUT carries the vault in the BODY (`vaultId`) and is ADDRESSED at that vault's node (`vaultOriginOf(vaultId)`);
//   - GET is ADDRESSED at the node and names the party only (`?heldParty=`). The first read never carries `?vaultId=`: the route's query schema refuses
//     an unknown parameter (400). The named form is asked once, only after a read that could not be tied to the card's vault; a 400/404/422 on it is
//     learned as "this platform does not take it" (`vaultParamSupport`) and the read then fails safe.

import { dpopReadAuth, dpopWriteAuth, invalidateDpop, NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

export const ANNOTATIONS_PATH = "/base/connect/annotations";

export type AnnotationLoad = "ok" | "empty" | "error";

/** One stored value, with the entity that holds it. Two apps ⇒ two of these. */
export interface AnnotationValue {
  entity: string;
  text: string;
}

export interface HolderAnnotations {
  me: string;
  heldParty: string;
  /** The newest value, or null. ⚠ Convenience only — see {@link HolderAnnotations.notes}. */
  note: string | null;
  origin: string | null;
  /**
   * 🔴 EVERY live value, newest first. The holder's ruling: if there are two values, show both.
   *
   * ⚠ A second entry is ⛔ not a duplicate to dedupe away — it is another app's writing of the
   * same typed fact on the same vault, which is precisely what type-anchoring exists to make
   * visible. Rendering only `note` silently
   * re-privatises the vault.
   */
  notes: AnnotationValue[];
  origins: AnnotationValue[];
  noteLoad: AnnotationLoad;
  originLoad: AnnotationLoad;
  /** The vault that ANSWERED, echoed by the server — ⛔ never inferred from the one we asked. */
  vault: string | null;
}

export class AnnotationError extends Error {
  readonly status: number;
  readonly load: AnnotationLoad;
  constructor(status: number, detail: string, load: AnnotationLoad = "error") {
    super(`Annotation ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "AnnotationError";
    this.status = status;
    this.load = load;
  }
}

function asLoad(v: unknown): AnnotationLoad {
  return v === "ok" || v === "empty" || v === "error" ? v : "error";
}

/** Does the card's vault fit the route? True only for the signed-in holder's OWN vault (the route reads from there). */
export function annotationsFit(cardVaultId: string | null | undefined, ownVaultId: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => (v ? v.replace(/\/+$/, "") : "");
  return !!norm(cardVaultId) && norm(cardVaultId) === norm(ownVaultId);
}

/**
 * 🔴 The read could not be TIED to the vault the card is held in (found by a tester): the platform answered from another vault (a holder who manages
 * more than one gets the route's own pick, the child's, with empty notes) or did not say which. Such an answer is ⛔ never shown as "no note": it
 * is a failed read, so the card shows "could not be read" with no box, and nothing can be typed over a value that was not seen.
 */
export class AnnotationVaultMismatchError extends AnnotationError {
  readonly answered: string | null;
  constructor(answered: string | null, asked: string) {
    super(409, answered ? `the read came from ${answered}, the card is held in ${asked}` : `the read did not say which vault it came from (the card is held in ${asked})`);
    this.name = "AnnotationVaultMismatchError";
    this.answered = answered;
  }
}

/** What the card says when the read cannot be tied to its vault. */
export const NOTES_VAULT_UNTIED_COPY = "Could not tell which vault your notes are read from, so they are not shown and cannot be changed here.";

/** The name of the optional query parameter that names the vault to read from (GilbPlatform kaizen/c214-s9-annotations-scope; the PUT's body names it `vaultId` too). */
export const ANNOTATIONS_VAULT_PARAM = "vaultId";

/**
 * Does this platform take the vault on the read? Learned, not assumed ("a small capability flag"): `unknown` until a read that could not be tied
 * has been asked again WITH the parameter. A platform that predates it refuses an unknown query parameter (`additionalProperties: false`, 400), which
 * makes this `no` and the read fails safe; one that takes it answers from the named vault and the echo proves it (`yes`: the next reads name the vault at once).
 * Kept per page session.
 */
let vaultParamSupport: "unknown" | "yes" | "no" = "unknown";

/** Test seam, ⛔ never called by product code. */
export function __resetAnnotationCapability(): void {
  vaultParamSupport = "unknown";
}

const hostOfVault = (v: string | null | undefined): string => {
  try {
    return v ? new URL(v).host.toLowerCase() : "";
  } catch {
    return "";
  }
};

/** Is the vault that ANSWERED the vault the card is held in? Under OwnNameOwnHost a vault is its host (as the held-claim reads compare them). */
export function sameVault(answered: string | null | undefined, asked: string): boolean {
  const a = hostOfVault(answered);
  return a !== "" && a === hostOfVault(asked);
}

async function orThrow(res: Response, load: AnnotationLoad = "error"): Promise<Response> {
  if (res.status === 401) {
    invalidateDpop();
    throw new NotSignedInError();
  }
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  throw new AnnotationError(res.status, detail, load);
}

type AnnotationWire = {
  me?: string;
  heldParty?: string;
  note?: string | null;
  origin?: string | null;
  notes?: { entity?: string; text?: string }[];
  origins?: { entity?: string; text?: string }[];
  noteLoad?: string;
  originLoad?: string;
  vault?: string | null;
};

function fromWire(body: AnnotationWire, heldParty: string): HolderAnnotations {
  /** Tolerates a server that predates the arrays — falls back to the singular field. */
  const listOf = (arr: { entity?: string; text?: string }[] | undefined, single: string | null | undefined): AnnotationValue[] => {
    if (Array.isArray(arr)) {
      return arr.filter((v) => typeof v.text === "string" && v.text.length > 0).map((v) => ({ entity: String(v.entity ?? ""), text: String(v.text) }));
    }
    return typeof single === "string" && single.length > 0 ? [{ entity: "", text: single }] : [];
  };
  const noteLoad = asLoad(body.noteLoad);
  const originLoad = asLoad(body.originLoad);
  if (noteLoad === "error" || originLoad === "error") {
    throw new AnnotationError(500, "server reported a failed annotation load", "error");
  }
  const notes = listOf(body.notes, body.note);
  const origins = listOf(body.origins, body.origin);
  return {
    me: body.me ?? "",
    heldParty: body.heldParty ?? heldParty,
    note: notes[0]?.text ?? null,
    origin: origins[0]?.text ?? null,
    notes,
    origins,
    noteLoad,
    originLoad,
    vault: typeof body.vault === "string" ? body.vault : null,
  };
}

async function getAnnotations(url: string, heldParty: string): Promise<HolderAnnotations> {
  const res = await orThrow(await fetch(url, { method: "GET", cache: "no-store", headers: { ...(await dpopReadAuth("GET", url)), accept: "application/json" } }));
  return fromWire((await res.json()) as AnnotationWire, heldParty);
}

/**
 * The holder's own note + origin about one party, READ FROM THE VAULT THE CARD IS HELD IN. One round trip when the platform's own pick is that vault.
 * 🔴 A failed read throws — callers MUST NOT render that as an empty note. 🔴 So does a read that could not be TIED to the card's vault
 * ({@link AnnotationVaultMismatchError}): the echo (`vault`, "the vault that ANSWERED") must be the card's vault, else the read is asked again NAMING it
 * when the platform takes the parameter ({@link ANNOTATIONS_VAULT_PARAM}), else it fails. The write names the vault (`vaultId` in the PUT body), so a read that
 * came from another vault would show nothing and let the next keystroke overwrite what the write's vault holds (measured).
 * THE ONE FUNCTION that asks the route, so how the notes are read can be swapped without touching the card.
 */
export async function loadHolderAnnotations(heldParty: string, vaultId: string): Promise<HolderAnnotations> {
  const base = `${vaultOriginOf(vaultId)}${ANNOTATIONS_PATH}?heldParty=${encodeURIComponent(heldParty)}`;
  const named = `${base}&${ANNOTATIONS_VAULT_PARAM}=${encodeURIComponent(vaultId)}`;
  if (vaultParamSupport === "yes") {
    const got = await getAnnotations(named, heldParty);
    if (!sameVault(got.vault, vaultId)) throw new AnnotationVaultMismatchError(got.vault, vaultId);
    return got;
  }
  // ADDRESS ONLY first: the platform that does not take the parameter would refuse it (400), so it is asked only when it must be.
  const plain = await getAnnotations(base, heldParty);
  if (sameVault(plain.vault, vaultId)) return plain;
  if (vaultParamSupport === "no") throw new AnnotationVaultMismatchError(plain.vault, vaultId);
  try {
    const got = await getAnnotations(named, heldParty);
    if (!sameVault(got.vault, vaultId)) throw new AnnotationVaultMismatchError(got.vault, vaultId);
    vaultParamSupport = "yes";
    return got;
  } catch (e) {
    if (e instanceof AnnotationError && (e.status === 400 || e.status === 404 || e.status === 422)) {
      vaultParamSupport = "no";
      throw new AnnotationVaultMismatchError(plain.vault, vaultId);
    }
    throw e;
  }
}

export interface SaveAnnotationsInput {
  heldParty: string;
  /** The vault the card is held in: named in the body, and the node asked. */
  vaultId: string;
  note?: string;
  origin?: string;
  /** Ask the browser to let this request outlive the document (the page-hide flush; best effort by construction). */
  keepalive?: boolean;
}

/** Write the provided fields only. Empty string clears that field's prose. */
export async function saveHolderAnnotations(input: SaveAnnotationsInput): Promise<{
  heldParty: string;
  note?: string | null;
  origin?: string | null;
  changed: boolean;
}> {
  const body: Record<string, string> = { heldParty: input.heldParty, vaultId: input.vaultId };
  if (input.note !== undefined) body.note = input.note;
  if (input.origin !== undefined) body.origin = input.origin;
  const url = `${vaultOriginOf(input.vaultId)}${ANNOTATIONS_PATH}`;
  const res = await orThrow(
    await fetch(url, {
      method: "PUT",
      headers: { ...(await dpopWriteAuth("PUT", url)), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      keepalive: input.keepalive === true,
    }),
  );
  const json = (await res.json()) as { heldParty?: string; note?: string | null; origin?: string | null; changed?: boolean };
  return { heldParty: json.heldParty ?? input.heldParty, note: json.note, origin: json.origin, changed: Boolean(json.changed) };
}
