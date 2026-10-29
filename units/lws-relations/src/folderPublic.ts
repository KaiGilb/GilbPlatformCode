// A PUBLIC virtual folder reaches its contents.
//
// The owner, 2026-09-26: "making a virtual folder public makes all its children public."
// Spec: [[3P.F.Share.FolderPublicReachesContents.GilbPlatform]] SC1–SC4.
//
// Measured on M1 the same day: the folder
// was public, 3 of its 5 members were, and 0 of its 5 part-of LINKS were. Two named causes:
//   (a) the old cascade granted the folder and its members, never the links — and GilbPlatform checks
//       every id on its own grants, a link included, so an anonymous reader could follow none;
//   (b) the cascade ran once, at the click. Both non-public members were linked 14–16 minutes AFTER
//       the folder went public, and nothing granted them.
// Also found on the reverse path: "make private" revoked only the members carried inline on the
// pane's relations, with no fallback to the listed memberships, so it could revoke none.
//
// This module is the ONE place both directions and the add-later hook live:
//   • setFolderTreePublic — the folder, every link, every member, and every folder inside, to any
//     depth (each member is changed once, which also ends a cycle). On "private" it takes back the same set.
//   • inheritFolderPublic — called where a member is LINKED INTO a folder: if that folder is public,
//     the new link and member become public too (and the member's own tree, if it is a folder).
//
// Authority is the platform's, never assumed here: every grant goes through grant-direct /
// revoke-direct as the signed-in person, so someone who may not share an item cannot publish it by
// linking it into a public folder — the platform refuses, and the refusal is COUNTED and shown.
// ⚠ Residual, named: a link made by another client (an AI tool, another app) runs no hook of ours.
// ⚠ the owner's open question (the plan D2): an item public on its own BEFORE the folder is also made
// private by "make private". Nothing records which grants the folder's act made.

import { grantPublicOnRelation, listDirectShares, revokeEntityShare, revokePublicOnRelation, shareEntity } from "./entityShare";
import { isPublicPrincipal, publicGrantee } from "./publicAccess";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { resolveType } from "@kaigilb/gilbplatformcode-record-types";
import { readRelations, uriTail } from "./relations";
import { readRelationDoc } from "./relationDoc";
import { typeCurieFromJsonLd } from "@kaigilb/gilbplatformcode-type-curie";
import type { FolderPart } from "@kaigilb/gilbplatformcode-folder-part";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

/** The part-of predicate, as the relation document names it. */
const PART_OF = "t:PartOf";

function isEndedLink(extras: Record<string, unknown>): boolean {
  const v = extras["relationLifecycleState"] ?? extras["a:relationLifecycleState"];
  const first = Array.isArray(v) ? v[0] : v;
  return first === "ended";
}

/**
 * 🔴 The typing gate (2026-09-26) — WHO IS A MEMBER, read from what each link MEANS.
 *
 * A member is ONLY the SOURCE end of a `t:PartOf` link whose TARGET is this folder. The folder view's
 * `listFolderMemberships` returns every co-member of every relation the folder is in, whatever the
 * predicate and whichever end the folder sits at — measured by the typing gate's probe with the real
 * listing: making a nested folder public also published its PARENT, the parent's other member, and
 * a note the folder only referenced. Publishing is an access act, so it reads the predicate, the
 * role and the direction, and skips an ENDED link.
 *
 * @returns the members, and one sentence per link whose meaning could not be read (not guessed)
 */
export async function listFolderPartMembers(
  folderIdOrUri: string,
  door: string | null,
): Promise<{ parts: FolderPart[]; unread: string[] }> {
  // Callers pass an opaque id OR the record's full URI (RelationEditPane passes URIs — QA F3);
  // every comparison below is on the id.
  const folderId = uriTail(folderIdOrUri);
  const parts: FolderPart[] = [];
  const unread: string[] = [];
  const rels = await readRelations(folderId, door);
  const needDoc: RecordRelation[] = [];
  for (const rel of rels) {
    // The folder must be the WHOLE (the target). A folder that is itself part of something is
    // the SOURCE of that link, and its parent is not its member.
    if (rel.role !== "role:target") continue;
    // 🔴 The listing now names each READABLE relation's type beside its
    // members, so the predicate and the source are read from ONE answer. Only a relation the
    // listing did not type (an older platform) is dereferenced.
    if (rel.type !== undefined && rel.members !== undefined) {
      if (typeCurieFromJsonLd(rel.type) !== PART_OF) continue;
      for (const m of rel.members) {
        if (m.role !== "role:source") continue;
        const memberId = uriTail(m.member);
        if (memberId && memberId !== folderId) {
          parts.push({ memberId, relationId: uriTail(rel.relation), relationUri: rel.relation });
        }
      }
      continue;
    }
    needDoc.push(rel);
  }
  // — the fallback reads run concurrently under a fixed cap, never one by one.
  const docs = await mapWithCap(needDoc, DOC_READ_CAP, async (rel) => {
    try {
      return { rel, doc: await readRelationDoc(rel.relation, door), error: null as unknown };
    } catch (e) {
      return { rel, doc: null, error: e as unknown };
    }
  });
  for (const { rel, doc, error } of docs) {
    if (error !== null) {
      unread.push(`Could not read the link ${rel.relation}: ${reason(error)}`);
      continue;
    }
    if (!doc) {
      unread.push(`Could not read the link ${rel.relation}.`);
      continue;
    }
    if (doc.typeCurie !== PART_OF) continue;
    if (isEndedLink(doc.extras)) continue;
    if (!doc.sourceUri || !doc.targetUri || uriTail(doc.targetUri) !== folderId) continue;
    const memberId = uriTail(doc.sourceUri);
    if (!memberId || memberId === folderId) continue;
    parts.push({ memberId, relationId: uriTail(rel.relation), relationUri: rel.relation });
  }
  return { parts, unread };
}

/** How many relation documents are read at once when the listing did not type a link. */
const DOC_READ_CAP = 6;

/** Map with at most `cap` calls in flight; results keep the input order. */
async function mapWithCap<T, R>(items: readonly T[], cap: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(cap, items.length) }, worker));
  return out;
}

/** What one publish / un-publish did. `failed` holds one plain sentence per thing not changed. */
export interface FolderPublicOutcome {
  /** The root folder itself was changed. When false, nothing below it was attempted. */
  folder: boolean;
  /** Members changed (items, files, inner folders — each counted once). */
  members: number;
  /** Links changed. */
  links: number;
  failed: string[];
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : "failed";
}

/** True when the record is a virtual folder (the app's one folder type test). */
function isFolderRecord(rec: BaseRecord | null | undefined): boolean {
  return resolveType(rec?.typeUri)?.id === "folder";
}

/** Is this a virtual FOLDER that is public right now — both READ from the stored record, never
 *  remembered. The gate (F2): `t:PartOf` is a general part-of link ("impeller part-of pump"), so the
 *  target's stored TYPE decides whether a link is a filing into a folder. */
export async function isPublicFolder(folderId: string, door: string | null): Promise<boolean> {
  const rec = await readRecord(folderId, door);
  if (!rec || resolveType(rec.typeUri)?.id !== "folder") return false;
  return listDirectShares(rec.facts).some((e) => isPublicPrincipal(e.principal));
}

/**
 * Make a folder, every link inside it, every member, and every folder inside it (to any depth)
 * public — or take all of that back.
 *
 * @param folderId the folder's opaque id
 * @param on true = make public (read only), false = make private
 * @param vaultNamespace the vault the folder lives in; members are addressed there
 * @param door the folder's own door (`recordDoor(folderEntityUri, vaultId)`)
 */
export async function setFolderTreePublic(
  folderIdOrUri: string,
  on: boolean,
  vaultNamespace: string | null | undefined,
  door: string | null,
): Promise<FolderPublicOutcome> {
  const folderId = uriTail(folderIdOrUri);
  const out: FolderPublicOutcome = { folder: false, members: 0, links: 0, failed: [] };
  const memberDoor = vaultNamespace ?? null;
  try {
    if (on) await shareEntity(folderId, publicGrantee(), "read", vaultNamespace, door);
    else await revokeEntityShare(folderId, publicGrantee(), vaultNamespace, door);
    out.folder = true;
  } catch (e) {
    out.failed.push(reason(e));
    return out;
  }

  // Each member's OUTCOME, not only whether it was seen (The gate (re-gate, measured)): an item filed
  // in two folders of one tree whose grant was refused must keep BOTH links private.
  const outcome = new Map<string, boolean>([[folderId, true]]);
  const queue: { id: string; door: string | null }[] = [{ id: folderId, door }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    let edges: FolderPart[];
    try {
      const listed = await listFolderPartMembers(cur.id, cur.door);
      edges = listed.parts;
      out.failed.push(...listed.unread);
    } catch (e) {
      out.failed.push(`Could not list what is in folder ${cur.id}: ${reason(e)}`);
      continue;
    }
    for (const edge of edges) {
      // 🔴 ORDER IS THE PRIVACY PROPERTY. A public link shows its member's URI to anyone, so on
      // "public" the LINK is published only after its MEMBER was (a refused member keeps a private
      // link); on "private" the link is taken back FIRST.
      let memberOk = outcome.get(edge.memberId) ?? true;
      if (!on) {
        try {
          await revokePublicOnRelation(edge.relationUri);
          out.links += 1;
        } catch (e) {
          out.failed.push(`Link to ${edge.memberId}: ${reason(e)}`);
        }
      }
      if (!outcome.has(edge.memberId)) {
        memberOk = true;
        // — the member's record is read ONCE: it decides folder-or-not AND is the
        // record the share / revoke acts on.
        let rec: BaseRecord | null = null;
        try {
          rec = await readRecord(edge.memberId, memberDoor);
          if (!rec) throw new Error("Record not found or not readable.");
          if (on) await shareEntity(edge.memberId, publicGrantee(), "read", vaultNamespace, memberDoor, { rec });
          else await revokeEntityShare(edge.memberId, publicGrantee(), vaultNamespace, memberDoor, { rec, skipListRefresh: true });
          out.members += 1;
        } catch (e) {
          memberOk = false;
          out.failed.push(`${edge.memberId}: ${reason(e)}`);
        }
        outcome.set(edge.memberId, memberOk);
        // The gate (re-gate R4) — an inner folder whose OWN publish was refused is not descended on
        // "public": its members' links would name the refused folder's address.
        if (isFolderRecord(rec) && (memberOk || !on)) queue.push({ id: edge.memberId, door: memberDoor });
      }
      if (on && memberOk) {
        try {
          await grantPublicOnRelation(edge.relationUri);
          out.links += 1;
        } catch (e) {
          out.failed.push(`Link to ${edge.memberId}: ${reason(e)}`);
        }
      }
    }
  }
  return out;
}

/**
 * A member was just LINKED INTO a folder. If the folder is public, make the new link and the member
 * public too — and, when the member is itself a folder, everything inside it.
 *
 * The link's URI is taken from the folder's own `/relations` answer (the address the vault issued),
 * ⛔ never recomposed from the relation id.
 *
 * @returns sentences for anything not made public; empty when all of it was, or the folder is not public
 */
export async function inheritFolderPublic(input: {
  folderId: string;
  folderDoor: string | null;
  memberId: string;
  relationId: string;
  /** — the new link's URI from the write answer; the folder is re-listed only without it. */
  relationUri?: string | null;
  /** The gate (N6) — the member's OWN entity URI, when the caller holds it: its door, so a member in
   *  another vault than the pane's is read where it lives (not reported "not found"). */
  memberEntityUri?: string | null;
  vaultNamespace: string | null | undefined;
}): Promise<string[]> {
  const { folderDoor, relationId, relationUri, vaultNamespace } = input;
  // An id OR a full URI may arrive (RelationEditPane passes URIs — QA F3); act on the id.
  const folderId = uriTail(input.folderId);
  const memberId = uriTail(input.memberId);
  const failed: string[] = [];
  let isPublic: boolean;
  try {
    isPublic = await isPublicFolder(folderId, folderDoor);
  } catch (e) {
    return [`Could not tell whether the folder is public, so the new item was not made public: ${reason(e)}`];
  }
  if (!isPublic) return failed;

  // The member FIRST; the link only if the member became public (see the order note above).
  const memberDoor =
    input.memberEntityUri ?? (input.memberId.includes("://") ? input.memberId : null) ?? vaultNamespace ?? null;
  let memberOk = true;
  try {
    const rec = await readRecord(memberId, memberDoor);
    if (!rec) throw new Error("Record not found or not readable.");
    if (isFolderRecord(rec)) {
      const inner = await setFolderTreePublic(memberId, true, vaultNamespace, memberDoor);
      failed.push(...inner.failed);
      memberOk = inner.folder;
    } else {
      await shareEntity(memberId, publicGrantee(), "read", vaultNamespace, memberDoor, { rec });
    }
  } catch (e) {
    memberOk = false;
    failed.push(`The item added to the public folder is not public: ${reason(e)}`);
  }
  if (!memberOk) return failed;
  try {
    let uri = relationUri ?? null;
    if (uri === null) {
      const { parts } = await listFolderPartMembers(folderId, folderDoor);
      const edge = parts.find((m) => m.relationId === relationId && m.memberId === memberId);
      if (!edge) throw new Error("the new link is not listed on the folder as a part-of link yet");
      uri = edge.relationUri;
    }
    await grantPublicOnRelation(uri);
  } catch (e) {
    failed.push(`The link into the public folder is not public: ${reason(e)}`);
  }
  return failed;
}
