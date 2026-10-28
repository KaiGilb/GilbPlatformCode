// Tag links on a Plan card. A reference stores only {"@id": <address>}. The name drawn
// for it is the target's live tag (MASTER_TAG_SLUGS), never a copy stored on the link.

import { childrenPointingAt, entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { idFromEntityUri } from "@kaigilb/gilbplatformcode-id-tail";
import { memberValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { isTypeName } from "@kaigilb/gilbplatformcode-type-key";

export { isTypeName };

// The tag facts, in the order they are read: unitTag, then tag.
const MASTER_TAG_SLUGS = ["unitTag", "tag"] as const;

// Identity and profile-card pointers: the graph draws these itself, so they are not counted as children.
const SKIP_SLUGS = new Set([
  "claimSubject",
  "heldParty",
  "profilePhoto",
  "principalUri",
  "directReader",
  "directWriter",
  "aliasUri",
  "accountSubject",
  "registeredVault",
  "vaultAddress",
  "anchorBoundEmail",
]);

export type PlanLinkFacts = {
  facts: Record<string, string>;
  served?: { facts?: Readonly<Record<string, unknown>> };
};

/** The record's tag (unitTag, then tag). Empty when it has neither. */
export function recordTag(facts: Record<string, string> | null | undefined): string {
  if (!facts) return "";
  for (const slug of MASTER_TAG_SLUGS) {
    const v = facts[slug]?.trim();
    if (v) return v;
  }
  return "";
}

function linkObject(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>)["@id"];
  if (typeof id === "string" && id.trim()) return entityRefFromFact(id)?.uri ?? id.trim();
  return null;
}

/** A served link: one `{"@id"}`, or a list of them. A bare string is not a served link. */
function servedLink(bag: Readonly<Record<string, unknown>> | undefined, slug: string): string | null {
  if (!bag) return null;
  const raw = Object.prototype.hasOwnProperty.call(bag, slug)
    ? bag[slug]
    : memberValue(bag as Record<string, unknown>, slug);
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = linkObject(item);
      if (id) return id;
    }
    return null;
  }
  return linkObject(raw);
}

function flatAddress(raw: unknown): string | null {
  if (typeof raw === "string") {
    const flat = raw.trim();
    if (!flat) return null;
    if (flat.startsWith("{") || flat.startsWith("[")) {
      try {
        return flatAddress(JSON.parse(flat) as unknown);
      } catch {
        return null;
      }
    }
    return entityRefFromFact(flat)?.uri ?? null;
  }
  return linkObject(raw);
}

/** The address a link fact stores. The served `{"@id"}` wins; a flattened URI is the same address. */
export function linkAddress(record: PlanLinkFacts, slug: string): string | null {
  const fromServed = servedLink(record.served?.facts, slug);
  if (fromServed) return fromServed;
  const facts = record.facts as Record<string, unknown> | undefined;
  if (facts && Object.prototype.hasOwnProperty.call(facts, slug)) return flatAddress(facts[slug]);
  return flatAddress(facts ? memberValue(facts, slug) : undefined);
}

/** True when `slug` on `record` names `target` (by id or by entity address). */
export function pointsAt(
  record: PlanLinkFacts,
  slug: string,
  target: { id: string; entityUri?: string },
): boolean {
  const addr = linkAddress(record, slug);
  if (!addr) return false;
  const keys = new Set<string>([addr]);
  const ref = entityRefFromFact(addr);
  if (ref) {
    keys.add(ref.id);
    keys.add(ref.uri);
  }
  if (keys.has(target.id)) return true;
  if (!target.entityUri) return false;
  if (keys.has(target.entityUri)) return true;
  const targetRef = entityRefFromFact(target.entityUri);
  return targetRef != null && (keys.has(targetRef.id) || keys.has(targetRef.uri));
}

/**
 * This record, plus every record that reaches it through `fvParent`.
 * Offering one of those as Part of would loop. Ids and entity addresses are both blocked.
 */
export function partOfExcludedIds(
  self: { id: string; entityUri?: string },
  pool: readonly { id: string; entityUri?: string; facts: Record<string, string>; served?: { facts?: Readonly<Record<string, unknown>> } }[],
): Set<string> {
  const blocked = new Set<string>();
  const add = (id: string, entityUri?: string) => {
    blocked.add(id);
    if (!entityUri) return;
    blocked.add(entityUri);
    const ref = entityRefFromFact(entityUri);
    if (ref) {
      blocked.add(ref.id);
      blocked.add(ref.uri);
    }
  };
  add(self.id, self.entityUri);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of pool) {
      if (blocked.has(r.id)) continue;
      const parent = linkAddress(r, "fvParent");
      if (!parent) continue;
      const ref = entityRefFromFact(parent);
      const hit = blocked.has(parent) || (ref != null && (blocked.has(ref.id) || blocked.has(ref.uri)));
      if (!hit) continue;
      const before = blocked.size;
      add(r.id, r.entityUri);
      if (blocked.size !== before) grew = true;
    }
  }
  return blocked;
}

/** A parent chain that cannot be checked. The message is the notice; nothing is written. */
export class PlanChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanChainError";
  }
}

const CHAIN_TOO_DEEP = "This chain is too deep to check.";
const CHAIN_UNREAD = "Could not check the chain — try again.";
const CHAIN_LIMIT = 50;

type ChainRead = (
  id: string,
  at: string | null,
) => Promise<PlanLinkFacts & { entityUri?: string } | null>;

function namesSelf(addr: string, self: { id: string; entityUri?: string }): boolean {
  if (addr === self.id) return true;
  if (self.entityUri && addr === self.entityUri) return true;
  const ref = entityRefFromFact(addr);
  if (!ref) return false;
  if (ref.id === self.id || ref.uri === self.id) return true;
  if (self.entityUri && (ref.id === self.entityUri || ref.uri === self.entityUri)) return true;
  const selfRef = self.entityUri ? entityRefFromFact(self.entityUri) : null;
  return selfRef != null && (ref.id === selfRef.id || ref.uri === selfRef.uri);
}

/**
 * Whether `chosenParentUri` already sits under `self` through `a:fvParent`.
 * Walks up with `read`, at most 50 records. True only when the chain reaches `self`.
 * A 50th parent that is not `self` throws {@link PlanChainError} (`CHAIN_TOO_DEEP`):
 * checking it would be a 51st read. A failed or missing read throws the unread notice.
 * `read` is required so this file does not import the record client.
 */
export async function wouldLoop(
  self: { id: string; entityUri?: string },
  chosenParentUri: string,
  read: ChainRead,
): Promise<boolean> {
  if (namesSelf(chosenParentUri, self)) return true;
  let current = chosenParentUri;
  for (let step = 0; step < CHAIN_LIMIT; step++) {
    let rec: Awaited<ReturnType<ChainRead>>;
    try {
      rec = await read(idFromEntityUri(current), current);
    } catch {
      throw new PlanChainError(CHAIN_UNREAD);
    }
    if (!rec) throw new PlanChainError(CHAIN_UNREAD);
    const parent = linkAddress(rec, "fvParent");
    if (!parent) return false;
    if (namesSelf(parent, self)) return true;
    if (step === CHAIN_LIMIT - 1) throw new PlanChainError(CHAIN_TOO_DEEP);
    current = parent;
  }
  throw new PlanChainError(CHAIN_TOO_DEEP);
}

/** Empty needle matches every tag. Otherwise a case-insensitive contains on the tag alone. */
export function tagMatches(tag: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return tag.toLowerCase().includes(n);
}

export function alreadyMeasuresSentence(valueTag: string, otherTag: string): string {
  return `"${valueTag}" already measures "${otherTag}".`;
}

export function duplicateTagSentence(tag: string): string {
  return `The tag "${tag}" is already used in this vault. Pick another.`;
}

/** The next facts after setting or retracting one link. The served value is only `{"@id"}`. */
export function withLinkFact(
  facts: Record<string, string>,
  servedFacts: Readonly<Record<string, unknown>> | undefined,
  slug: string,
  uri: string | null,
): { facts: Record<string, string>; servedFacts: Record<string, unknown> } {
  const nextFacts = { ...facts };
  const nextServed: Record<string, unknown> = { ...(servedFacts ?? {}) };
  if (uri == null) {
    delete nextFacts[slug];
    delete nextServed[slug];
  } else {
    nextFacts[slug] = uri;
    nextServed[slug] = { "@id": uri };
  }
  return { facts: nextFacts, servedFacts: nextServed };
}

type TaggedRow = {
  id: string;
  entityUri?: string;
  typeUri: string;
  facts: Record<string, string>;
  served?: { facts?: Readonly<Record<string, unknown>> };
};

/**
 * Records of `typeName` whose `slug` points at `record`, sorted by tag.
 * `childrenPointingAt` reports only the first pointer, so a later slug is checked too.
 */
export function taggedChildren<T extends TaggedRow>(
  record: { id: string; entityUri?: string },
  pool: readonly T[],
  slug: string,
  typeName: string,
): T[] {
  const typed = pool.filter((r) => isTypeName(r.typeUri, typeName));
  const pointed = new Set(
    childrenPointingAt(record, typed, SKIP_SLUGS)
      .filter((k) => k.slug === slug)
      .map((k) => k.id),
  );
  for (const r of typed) {
    if (pointsAt(r, slug, record)) pointed.add(r.id);
  }
  return typed
    .filter((r) => pointed.has(r.id))
    .sort((a, b) => recordTag(a.facts).localeCompare(recordTag(b.facts)) || a.id.localeCompare(b.id));
}
