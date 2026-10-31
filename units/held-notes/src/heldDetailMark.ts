/**
 * The "set to private" switch on a held detail (a note, interest, language or organization number).
 * A held detail is seen by everyone who may read the vault by default; the person who ADDED it may set it to private, and then only they
 * see it. The ontology owner's ruling:
 *   - PRIVATE = `a:visibilityTier` = the literal `"private"` AND `a:claimSubject` = `{"@id": <the adder's principal>}`, written TOGETHER in ONE
 *     merge-patch with `If-Match`, through the app's record layer (`patchRecord` with the claim's `storedSpellings`), so the stored key is
 *     `a:visibilityTier`, never a bare `visibilityTier`;
 *   - BACK TO SHARED = both set to `null` in one merge-patch;
 *   - only the adder may switch (the caller offers it only when `a:statedBy` is the viewer's own card: `isStatedBy`);
 *   - the platform's tier gate is type-agnostic, so a private claim is hidden from co-members and read-only grantees by the platform itself.
 *
 * THIS FILE IS THE ONE PLACE the two keys are admitted on a held claim. The three held-detail modules refuse `a:visibilityTier` and `a:claimSubject`
 * (a NEW claim carries neither: it is shared by default, and either key would change who finds it) through {@link refuseGrantKeys}, which lets
 * through only the objects {@link privateMarkFacts} and {@link sharedMarkFacts} made. Anything else stays refused.
 */
import { patchRecord, readRecord, type MergePatchValue, type WriteSource } from "@kaigilb/gilbplatformcode-lws-records";

const TIER = "a:visibilityTier";
const SUBJECT = "a:claimSubject";
/** The one tier a held detail is set to. */
export const PRIVATE_TIER = "private";

/** The marks this file made: the only fact maps that may carry the two keys. */
const MARKS = new WeakSet<object>();

export class HeldMarkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeldMarkError";
  }
}

/** The facts that make a held detail private: the tier and the adder's principal as claim subject, together. */
export function privateMarkFacts(principal: string): Record<string, string | { "@id": string } | null> {
  const who = principal?.trim();
  if (!who) throw new HeldMarkError("Refusing to set a detail private with no signed-in person to keep it for.");
  const facts = { [TIER]: PRIVATE_TIER, [SUBJECT]: { "@id": who } };
  MARKS.add(facts);
  return facts;
}

/** The facts that put a held detail back to shared: both keys cleared, together. */
export function sharedMarkFacts(): Record<string, string | { "@id": string } | null> {
  const facts = { [TIER]: null, [SUBJECT]: null };
  MARKS.add(facts);
  return facts;
}

/**
 * The guard every held-detail composer runs on the facts it is about to write: ⛔ a tier or a claim subject on a held claim is refused, unless the facts
 * are one of this file's marks. `also` names further keys that stay refused whatever the facts are (the number's find key).
 *
 * @param facts the facts about to be written
 * @param fail makes the module's own error from a message
 * @param why the reason said with the refusal
 * @param also bare names refused as well
 */
export function refuseGrantKeys(facts: Record<string, unknown>, fail: (message: string) => Error, why: string, also: readonly string[] = []): void {
  const mark = MARKS.has(facts);
  for (const k of Object.keys(facts)) {
    const bare = k.replace(/^a:/, "");
    if ((bare === "visibilityTier" || bare === "claimSubject") && !mark) throw fail(`Refusing to write ${k} on a held claim: ${why}`);
    if (also.includes(bare)) throw fail(`Refusing to write ${k} on a held claim: ${why}`);
  }
}

/** True when a served held claim is private to its adder: the tier is `private` (the subject is the platform's gate, not read here). */
export function isPrivateDoc(doc: Record<string, unknown>): boolean {
  const raw = doc[TIER] ?? doc[TIER.slice(2)];
  const one = Array.isArray(raw) ? raw[0] : raw;
  const v = one && typeof one === "object" ? (one as { "@id"?: unknown })["@id"] : one;
  return v === PRIVATE_TIER;
}

/**
 * Write a mark on ONE held claim: ONE merge-patch with `If-Match` (the version read just now), the stored spellings resolved from the claim's own served keys,
 * the two keys together. The caller has already checked the claim is the viewer's (`isStatedBy`); a claim that is gone is refused.
 *
 * @param claim the claim's id and address
 * @param facts a mark from {@link privateMarkFacts} or {@link sharedMarkFacts}
 */
export async function writeHeldMark(claim: { id: string; uri: string }, facts: Record<string, string | { "@id": string } | null>): Promise<{ etag: string | null }> {
  if (!MARKS.has(facts)) throw new HeldMarkError("Refusing to write a tier or a claim subject on a held claim that is not a mark.");
  const rec = await readRecord(claim.id, claim.uri);
  if (!rec) throw new HeldMarkError("This detail is no longer there, so who sees it was not changed.");
  const patch: Record<string, MergePatchValue> = {};
  // `patchRecord` mints `a:<slug>`: it is handed the slugs.
  for (const [k, v] of Object.entries(facts)) patch[k.replace(/^a:/, "")] = v as MergePatchValue;
  // The claim's own served keys (as `writeSource` makes them): the stored spelling of each key is resolved from them.
  const source: WriteSource | undefined = rec.servedKeys?.length ? { at: rec.entityUri ?? null, servedKeys: rec.servedKeys } : undefined;
  return patchRecord(claim.id, patch, claim.uri, source, { ifMatch: rec.etag });
}
