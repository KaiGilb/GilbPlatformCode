// An organization's parent chain, and the writer's check that no loop is made. Pure: the reader is handed in.
// The shared rule has ONE text in both apps.
//
// WHO ENFORCES ACYCLICITY (measured in the platform code): GilbPlatform's write guard covers
// is-a only; `a:acyclic true` on `a:parentOrganization` is a DECLARATION, not a check. So:
//   1. THE WRITER REFUSES (`checkParentWrite`): an edge whose new parent is the organization itself, or has the
//      organization among its ancestors, or whose chain above it cannot be read or is deeper than the cap. It does
//      not guess: an unreadable link is a refusal with its reason.
//   2. EVERY READER WALKS SAFELY (`walkUp`): a visited set and a depth cap, because two writers in two vaults can
//      close a loop that neither could see. A loop is shown as 'loop' and never followed; a parent the viewer may
//      not read is 'not-visible', ⛔ never a guess and never "no parent".
// The value is the DIRECT parent only (single, scalar). The chain and the children are read, never stored.

/** Depth cap for a walk, and for the writer's look above a proposed parent (about 20). */
export const ORG_DEPTH_CAP = 20;

/** What a reader found for one organization. `unreadable` = the viewer may not read it, or the read failed. */
export type ParentRead =
  | { state: "ok"; parent: string | null; label?: string | null }
  | { state: "unreadable" };

/** Reads one organization record and returns its parent address (or null for a head office). */
export type ParentReader = (orgUri: string) => Promise<ParentRead>;

export interface ChainNode {
  uri: string;
  label: string | null;
  /** False when this organization is named by a child but cannot be read (its own parent is then unknown). */
  visible: boolean;
}

export interface UpWalk {
  chain: ChainNode[];
  /** head: a record with no parent was reached. not-visible: a link could not be read. loop: a record repeats.
   *  too-deep: the cap was reached before a head. */
  end: "head" | "not-visible" | "loop" | "too-deep";
}

/** An organization's identity for comparison: the entity id at the end of its address, so one record named by two hosts is one. */
export function orgKey(uri: string): string {
  const t = String(uri ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  return t.slice(t.lastIndexOf("/") + 1) || t;
}

/** The chain above `start`, nearest parent first, ending at the head office, a loop, an unreadable link or the cap. */
export async function walkUp(start: string, read: ParentReader, cap: number = ORG_DEPTH_CAP): Promise<UpWalk> {
  const seen = new Set<string>([orgKey(start)]);
  const chain: ChainNode[] = [];
  let at = start;
  for (let step = 0; ; step++) {
    let r: ParentRead;
    try {
      r = await read(at);
    } catch {
      r = { state: "unreadable" };
    }
    if (r.state !== "ok") {
      if (chain.length > 0) chain[chain.length - 1]!.visible = false;
      return { chain, end: "not-visible" };
    }
    if (chain.length > 0) chain[chain.length - 1]!.label = r.label ?? null;
    if (r.parent === null) return { chain, end: "head" };
    const key = orgKey(r.parent);
    if (seen.has(key)) return { chain, end: "loop" };
    if (chain.length >= cap) return { chain, end: "too-deep" };
    seen.add(key);
    chain.push({ uri: r.parent, label: null, visible: true });
    at = r.parent;
    if (step > cap + 2) return { chain, end: "too-deep" }; // a belt: the loop above cannot run on
  }
}

export type ParentWriteCheck =
  | { ok: true }
  | { ok: false; reason: "self" | "loop" | "unreadable" | "too-deep"; message: string };

/**
 * May `child` take `proposedParent` as its one parent? `null` clears the parent and is always allowed.
 * Reads the chain UP FROM THE PROPOSED PARENT and refuses when it reaches `child`.
 */
export async function checkParentWrite(
  child: string,
  proposedParent: string | null,
  read: ParentReader,
  cap: number = ORG_DEPTH_CAP,
): Promise<ParentWriteCheck> {
  if (proposedParent === null) return { ok: true };
  const childKey = orgKey(child);
  if (orgKey(proposedParent) === childKey) return { ok: false, reason: "self", message: "An organization cannot be its own parent." };
  // The chain from the proposed parent: it must not reach the child. The walk starts AT the proposed parent, so the
  // parent's own record is read first (an unreadable proposed parent is then 'not-visible' with an empty chain).
  // The child's own chain is the parent's chain plus the parent itself, and the reader shows `cap` levels at most, so the
  // parent may have `cap - 1` ancestors (the writer used to admit one level the reader then cut off).
  const up = await walkUp(proposedParent, read, cap - 1);
  if (up.chain.some((n) => orgKey(n.uri) === childKey)) return { ok: false, reason: "loop", message: "That would make a loop: it is already below this organization." };
  if (up.end === "loop") return { ok: false, reason: "loop", message: "That organization's chain already loops, so it cannot be used as a parent." };
  if (up.end === "not-visible") return { ok: false, reason: "unreadable", message: "A link above that organization cannot be read, so a loop cannot be ruled out." };
  if (up.end === "too-deep") return { ok: false, reason: "too-deep", message: `That chain is deeper than ${cap} levels.` };
  return { ok: true };
}
