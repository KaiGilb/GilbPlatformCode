/**
 * The canonical principal of a member the holder placed: the ONE file that names `GET /base/connect/resolve-person`.
 *
 *   GET /base/connect/resolve-person?input=<a WebID, card link or principal>   (identity node, anonymous)
 *   200 { principal, displayName, form }    the principal the alias registry names today
 *   400 / 404 { code }                      not a person handle (a bare name, unresolvable, `not_a_person`: a group vault)
 *
 * WHY. A set member is the string the holder PUT when he placed the person. A person placed under a legacy spelling
 * (`https://<name>.<host>/i`) and later re-minted is stored under the old string, while the resolver names today's
 * principal. Exact equality then misses a placed person. The platform's alias registry is the authority on what the
 * old spelling means today: this module asks it, and never maps one spelling to another itself (⛔ no URL munging, ⛔ never a
 * name). Its one rewrite is the platform's own: an opaque member is trimmed and loses its trailing slash (below).
 *
 * BOUNDED AND CACHED. One canonicaliser lives as long as the app's connections (one per holder per session): each member
 * is asked at most once while its answer is kept, at most {@link MAX_CANONICAL_LOOKUPS} requests are ever sent by one
 * canonicaliser, and at most {@link CANONICAL_CONCURRENCY} at a time (the caller's batches). An answer that is not an
 * answer (could not be reached, 5xx, 429) is NOT kept: it reads as "unknown" now and is asked again later, inside the bound.
 * The platform's paged people view makes this module unnecessary; until then it is the measured stop-gap.
 *
 * OPAQUE MEMBERS COST NOTHING. The platform answers an opaque principal (`/base/p/<uuid>`) with itself
 * (`resolve-person.ts`, `isOpaquePrincipalUri` -> `input.replace(/\/$/, "")`) or "not a person": asking one can never name a
 * different principal. So an opaque member answers itself here, sends no request and does not count toward the bound, and the
 * bound is left for the members that can be old spellings (the `/i` WebID form first: {@link isOldWebIdMember}).
 */
import { request, routeUrl, PlatformError, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

export const RESOLVE_PERSON_PATH = "/base/connect/resolve-person";

/** The most resolve-person requests one canonicaliser (one holder's session) ever sends. */
export const MAX_CANONICAL_LOOKUPS = 50;

/** How many members are asked at the same time. */
export const CANONICAL_CONCURRENCY = 4;

/** One resolve-person request ends as "could not be asked" after this long (as the card's own requests do). */
export const CANONICAL_REQUEST_TIMEOUT_MS = 10_000;

/** A member -> the principal it names today, or null when it names no person or could not be asked. */
export type PrincipalCanonicaliser = ((member: string) => Promise<string | null>) & {
  /**
   * True when the platform ANSWERED for `member` (a principal, or "no person"); false when it was never asked, could not be
   * asked (unreachable, 5xx, 429) or was past the lookup limit. Lets a caller tell "no person" from "not known". Optional: a canonicaliser without it treats every null as an answer.
   */
  answered?(member: string): boolean;
};

/** The platform's opaque principal path, the same test as its `isOpaquePrincipalUri` (any host, optional trailing slash). */
const OPAQUE_PRINCIPAL_PATH = /^\/base\/p\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/?$/;

function pathOf(member: string): string | null {
  try {
    return new URL(member.trim()).pathname;
  } catch {
    return null;
  }
}

/**
 * The principal an opaque member names: itself without the trailing slash, as the platform answers it. Null when the member
 * is not an opaque principal (then only the platform can say what it names).
 */
export function opaqueSelf(member: string): string | null {
  const path = pathOf(member);
  return path !== null && OPAQUE_PRINCIPAL_PATH.test(path) ? member.trim().replace(/\/$/, "") : null;
}

/** True when a member has the old WebID form (`https://<name>.<host>/i`): the spelling most likely to be an old one. */
export function isOldWebIdMember(member: string): boolean {
  const path = pathOf(member);
  return path !== null && path.replace(/\/$/, "") === "/i";
}

/**
 * The members worth asking, in the order to ask them: opaque members dropped (they answer themselves), `/i` members first,
 * then the rest in their given order.
 */
export function membersToAsk(members: readonly string[]): string[] {
  const asked = members.filter((m) => opaqueSelf(m) === null);
  return [...asked.filter(isOldWebIdMember), ...asked.filter((m) => !isOldWebIdMember(m))];
}

/** The canonicaliser this module makes always says what it answered. */
export type AnsweringCanonicaliser = PrincipalCanonicaliser & { answered(member: string): boolean };

/**
 * A canonicaliser over the identity node, with its own cache and request bound.
 *
 * @param platform the identity node (`origin`) with the app's fetch (the route is anonymous; a signed fetch is harmless)
 * @param options `maxLookups` overrides {@link MAX_CANONICAL_LOOKUPS} (tests, a larger rig)
 */
export function createPrincipalCanonicaliser(platform: PlatformClient, options: { maxLookups?: number } = {}): AnsweringCanonicaliser {
  const maxLookups = options.maxLookups ?? MAX_CANONICAL_LOOKUPS;
  const known = new Map<string, Promise<string | null>>();
  const answered = new Set<string>();
  let sent = 0;
  const canonicalise = (member: string): Promise<string | null> => {
    const m = member.trim();
    if (!m) return Promise.resolve(null);
    const self = opaqueSelf(m);
    if (self !== null) {
      // No request, not counted: the platform would answer it with itself.
      answered.add(m);
      return Promise.resolve(self);
    }
    const hit = known.get(m);
    if (hit) return hit;
    if (sent >= maxLookups) return Promise.resolve(null);
    sent++;
    const asked = ask(platform, m);
    const kept = asked.then((a) => {
      // Only an ANSWER is kept; "could not ask" is asked again next time (inside the bound).
      if (!a.answered) known.delete(m);
      else answered.add(m);
      return a.principal;
    });
    known.set(m, kept);
    return kept;
  };
  return Object.assign(canonicalise, { answered: (member: string) => answered.has(member.trim()) });
}

async function ask(platform: PlatformClient, member: string): Promise<{ answered: boolean; principal: string | null }> {
  const url = `${routeUrl(platform, RESOLVE_PERSON_PATH)}?input=${encodeURIComponent(member)}`;
  try {
    const a = await request(platform, "GET", url, undefined, { accept: "application/json" }, undefined, { timeoutMs: CANONICAL_REQUEST_TIMEOUT_MS });
    if (a.status === 200) {
      const p = typeof a.json?.principal === "string" ? a.json.principal.trim() : "";
      return { answered: true, principal: p || null };
    }
    // 400 / 404: the platform's answer that this string names no person (a group, a bare name, nobody). Kept.
    if (a.status === 400 || a.status === 404) return { answered: true, principal: null };
    return { answered: false, principal: null };
  } catch (e) {
    if (e instanceof PlatformError) return { answered: false, principal: null };
    // The app's own fetch threw something that is not "unreachable": still not an answer about this member.
    return { answered: false, principal: null };
  }
}
