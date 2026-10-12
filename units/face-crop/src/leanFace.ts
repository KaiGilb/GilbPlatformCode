// The two-pictures contract, written ONCE for every app.
//
// The four steps:
//   1. A person uploads or takes a photo.
//   2. They select a crop, or not.
//   3. The master photo is saved; a quick-to-load profile picture is generated and served as the
//      profile picture.
//   4. A link back to the master photo is created. It can be reached to make a new crop, or to
//      view the whole picture.
//
// This module owns steps 3 and 4 as a CONTRACT: what an app sends, what the server answers, and
// how you get from a shown face back to the master behind it. The transports stay in the apps
// because their credentials genuinely differ; everything else is here.
//
// ── THE ONTOLOGY IS DECLARED, NOT INVENTED HERE ──
// In the GilbVeda master:
//   a:croppedFrom  — a directed `single` edge on the LEAN file's entity carrying the MASTER
//                    file entity's own URI as an inline @id.
//   a:profilePhoto — UNTOUCHED. Still ONE scalar, still pointing at the shown face.
// 🔴 So reading the photo off a person's facts does NOT become an array: the plurality was never
// in the person's facts. It is a fact about the PICTURE.

import { FACE_WHOLE, faceQueryValue, type FaceRect } from "./faceRect";

/** The `a:croppedFrom` predicate, exactly as the server stores it. */
export const CROPPED_FROM_ATTR = "a:croppedFrom" as const;

/**
 * The ONE spelling this package reads for the crop edge.
 *
 * 🔴 IT IS ONE, DELIBERATELY. A second, bare `croppedFrom` spelling kept "in case" would be a
 * hand-kept spelling list. ⚠ No producer of the bare form was ever measured: the term is minted
 * with `a:predicateAttribute: "a:croppedFrom"` and the server writes exactly that.
 * ⛔ If a bare-spelling producer is ever MEASURED, it does not come back as a literal here —
 * it goes through a term resolver, the way the photo predicate does (`photo-term`).
 *
 * ⚠ What the reader still accepts is the two VALUE SHAPES, which are both real: the JSON-LD
 * plane keeps `{"@id": …}` reference nodes and the flat-record plane collapses an edge to a
 * bare string. Shapes are not spellings.
 */
const CROPPED_FROM_KEYS = [CROPPED_FROM_ATTR] as const;

/** What the server says it did about the fast picture. Mirrors LeanFaceOutcome on the server. */
export type LeanFaceAck =
  | {
      kind: "stored";
      entity: string;
      id: string;
      byteSize: number;
      contentHash: string;
      width: number;
      height: number;
      cropped: boolean;
      /**
       * True when the server wrote `a:croppedFrom` back to the master.
       *
       * 🔴 FALSE is correct, ⛔ not a failure. `a:croppedFrom` is a CONTAINMENT claim, so the
       * server writes it only when the derived frame is STRICTLY smaller in pixel area than
       * its source. A picture that was merely re-encoded lighter at the same dimensions has no
       * larger frame behind it — so an app must NOT offer "see the whole picture" or "cut
       * again" for it, because there is nothing bigger to show.
       */
      linkedToMaster: boolean;
    }
  | { kind: "skipped"; reason: "not-an-image" | "already-lean"; detail: string }
  | { kind: "failed"; detail: string };

/** The upload ack, with the lean-face addition. */
export interface UploadAck {
  entity: string;
  contentHash: string;
  byteSize: number;
  created: boolean;
  /** Present only when `?face=` was sent. */
  leanFace?: LeanFaceAck;
}

/**
 * Adds the lean-face ask to an upload's query string.
 *
 * @param params the query being built for the upload
 * @param rect the holder's rectangle, or null when they marked nothing
 */
export function appendFaceQuery(params: URLSearchParams, rect: FaceRect | null): void {
  params.set("face", faceQueryValue(rect));
}

/**
 * Which file the profile photo should point at, given an upload ack.
 *
 * 🔴 THE LEAN FACE WHEN THERE IS ONE, THE MASTER OTHERWISE — and never nothing.
 * The fallback is the whole point of reporting a skip rather than throwing: a holder whose
 * picture could not be shrunk (an undecodable format, a picture already small enough) still
 * gets a working face. They get a SLOW one in the first case, which is honest, rather than a
 * broken one.
 *
 * ⚠ ⛔ Do NOT "fix" this by treating a skip as a failed upload. The master is stored either
 * way — the original stays in the vault before this is called.
 *
 * @param ack the upload ack
 * @returns the entity URI the a:profilePhoto claim should resolve to
 */
export function faceEntityFor(ack: UploadAck): string {
  return ack.leanFace?.kind === "stored" ? ack.leanFace.entity : ack.entity;
}

/**
 * The `/files/<id>` BYTE PATH of the face to show — the lean one when there is one.
 *
 * 🔴 SHARED because it was once re-implemented three times in one change, in three places —
 * the drift this code exists to end. One rule, one place.
 *
 * ⚠ ⛔ Do NOT derive this from the upload ack's `Location:` header. That header names the
 * MASTER — it is the entity the POST minted — so trusting it points the profile claim at the
 * full-size original.
 *
 * @param ack the upload ack
 * @returns `/files/<id>` of the face the profile photo should resolve to
 */
export function faceLocationFor(ack: UploadAck): string {
  return `/files/${fileIdFromEntityUri(faceEntityFor(ack))}`;
}

/**
 * A short, true sentence about what the person got — for the app to show them.
 *
 * A side effect that did not happen is REPORTED. ⛔ Telling someone "your photo is set and
 * fast" while serving an 8 MB original is the defect this sentence exists to prevent.
 *
 * @param ack the upload ack
 * @returns a sentence to show, or null when the ordinary quiet success needs no words
 */
export function leanFaceNotice(ack: UploadAck): string | null {
  const lean = ack.leanFace;
  if (lean === undefined || lean.kind === "stored") return null;
  if (lean.kind === "skipped" && lean.reason === "already-lean") return null;
  if (lean.kind === "skipped") {
    return "Your picture is saved, but this server could not make a small copy of that image format — it may load slowly in lists.";
  }
  return "Your picture is saved. Making the small fast copy did not work, so it may load slowly in lists.";
}

/**
 * Reads `a:croppedFrom` off a file entity's facts — the link back to the master.
 *
 * This is step 4: the link back to the master photo, reached to make a new crop or to view the
 * whole picture. One hop, no search, no scan.
 *
 * @param facts the shown face's file-entity facts, from either read plane
 * @returns the master file entity's URI, or null when this face is not a crop of anything
 *   (which is the ordinary state of every face uploaded before this cycle — ⛔ absence is not
 *   an error and ⛔ must not be reported as one)
 */
/**
 * What a read of a shown face's entity was able to establish about its master.
 *
 * 🔴 THE THIRD CASE IS THE POINT. An earlier draft collapsed "this face is not a crop" and
 * "I could not ask" into a single `null`, so a 401, a 500 or being offline all presented as
 * the settled fact *"there is no bigger picture"* — and the UI then hid the whole-picture view
 * and "Cut again…" as though it had checked. A failed read is ⛔ not an answer about the world.
 */
export type MasterLookup =
  /** Measured: this face is a crop, and here is the frame it came from. */
  | { kind: "master"; ref: string }
  /** Measured: this face carries no crop edge. The ordinary state of every face uploaded before lean faces. */
  | { kind: "none" }
  /** ⛔ NOT measured: the read failed. Claim nothing either way. */
  | { kind: "unknown"; reason: string };

export function masterBehindFace(facts: Record<string, unknown>): string | null {
  for (const key of CROPPED_FROM_KEYS) {
    const raw = facts[key];
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
    if (raw !== null && typeof raw === "object" && "@id" in raw) {
      const id = (raw as { "@id": unknown })["@id"];
      if (typeof id === "string" && id.trim() !== "") return id.trim();
    }
  }
  return null;
}

/**
 * The opaque id tail of an entity URI — the `<id>` in `/files/<id>`.
 *
 * @param entityUri a `…/e/<id>` entity URI
 */
export function fileIdFromEntityUri(entityUri: string | null | undefined): string {
  // ⚠ Tolerant by design: callers reach this from wire payloads and cached records where the
  // field can legitimately be absent. Throwing here turned a missing optional into a crash on
  // the SAVE path.
  if (typeof entityUri !== "string") return "";
  const trimmed = entityUri.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/**
 * The FILE ID of the face to show, given the ack and the master's own id.
 *
 * 🔴 THE SHARED FORM BOTH APPS USE. It takes the master's id from the caller rather than
 * re-deriving it from an entity URI, because every caller already holds an authoritative id
 * (the upload's own minted id, or the `Location:` tail) and re-parsing a URI to recover
 * something you were already given is a second source of truth for one fact.
 *
 * @param ack the upload ack (only `leanFace` is read)
 * @param masterFileId the id of the file the upload itself minted — the master
 * @returns the id of the file the profile photo should resolve to
 */
export function faceFileId(ack: Pick<UploadAck, "leanFace">, masterFileId: string): string {
  return ack.leanFace?.kind === "stored" ? ack.leanFace.id : masterFileId;
}

/**
 * True when a re-cut is available for a shown face — i.e. its master is still reachable.
 *
 * 🔴 A re-cut is ADDITIVE: mint a NEW lean file, give it its own a:croppedFrom to the SAME
 * master, repoint a:profilePhoto. ⛔ Nothing is overwritten and ⛔ nothing is deleted. The
 * superseded lean face stays exactly where it is — whether it should eventually be cleared up
 * is UNDECIDED, and ⛔ code must not decide it by writing a deletion. Showing never destroys.
 */
export function canRecut(lookup: MasterLookup): boolean {
  return lookup.kind === "master";
}

export { FACE_WHOLE };
