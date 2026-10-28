// The relations reverse-lookup client — Cycle004 VDS-1 (RecordDetailReadPane).
//
// §30 app↔vault separation: BaseApp owns NO relation storage. This is a PURE READ over the
// user's own vault through the O.7 bridge Bearer, on the SAME `/base` Bearer floor + first-party
// CORS the record read uses:
//   • Base `src/routes/read.ts` readReverse resolves the principal on the Bearer FLOOR (so a
//     first-party SPA's plain O.7 bridge Bearer can traverse relations), and
//   • Base `src/server/cors.ts` allow-lists `GET /base/e/:id/relations` for a first-party
//     SPA origin (isRelaxedBasePath).
// NO write, NO new BaseVeda term: it reads existing Base relation/role vocabulary and renders
// it (BVGATE_03 — read-only over existing vocabulary; nothing here anchors a datom).
//
// Wire contract (Base `src/routes/read.ts` readReverse):
//   GET /base/e/:id/relations → 200 { member, relations: [ { relation, role } ] }
//                               404 when the member entity is unreadable/absent (the C2b
//                               non-disclosure floor — an unreadable member's participation
//                               set is hidden behind the SAME 404 as the entity itself).
// Each `relation` is a `/base/r/<id>` entity URI; each `role` is the role the member fills in
// that relation. A relation URI is itself an entity dereferenced ONLY under its own grant
// (read.ts C2b), so this client returns the (relation, role) pairs the ONE call truthfully
// yields and NEVER dereferences a relation to fabricate a member name — a name it cannot
// resolve is not invented (3P.C.RealityDisclosure).

import { BASE_ENTITY_RELATIONS_URL, vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { NotSignedInError, bearerHeaderFor, tokenManager } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

/**
 * 🔴 THE CACHE KEY FOR A REVERSE LOOKUP — the id AND THE DOOR IT WAS ASKED AT.
 *
 * ── Why the door is IN the key (Cycle145, the third site) ────────────────────────────────
 * `readRelations(id, at)` asks `vaultOriginOf(at)`, and Base resolves an id **at the host the
 * request NAMED and at no other** (`resolveEntityUriById`, the owner's 2026-07-19 ruling
 * 3P.C.EveryEntityInNamedVault.Base). So `readRelations(id, null)` and `readRelations(id,
 * "https://ann.example.test/base")` are **two different questions with two different true
 * answers** — `[]` (the C2b non-disclosure 404) and the record's real participation set.
 *
 * Keyed on the id alone, those two answers shared one cache entry, and nothing downstream
 * can tell them apart because both are a well-formed `RecordRelation[]`. Measured on the
 * reload trace for a person's record (`RecordGraph.vaqa145.test.tsx` VAQA-2, before the fix):
 * the door-blind read fired ~40 ms before the register could supply an address, cached the
 * apex `[]`, and — the observer being mounted and the key unchanged — `queryFn` NEVER re-ran.
 * 2 asks at the apex, 0 at the vault, byte-identical over 25 s. It does not self-heal.
 *
 * With the door in the key, a late address is a DIFFERENT key: React Query issues the
 * vault-door fetch and the apex `[]` is parked where nothing can mistake it for an answer
 * about the vault.
 *
 * ⚠ `vaultOriginOf`, not the raw `at`: two records in the same vault must still SHARE one entry,
 * so the graph keeps warming the detail pane instead of doubling every reverse lookup. The
 * ORIGIN is exactly what varies the answer, so it is exactly what belongs in the key.
 *
 * ⛔ Every consumer of this query MUST build its key here. A second hand-written
 * `["base","relations", id]` re-opens the defect for that surface alone, silently.
 *
 * @param id the record's opaque id
 * @param at the record's own entity URI (or the vault namespace) the request will name
 */
export function relationsKey(id: string | null, at: string | null | undefined) {
  return ["base", "relations", id, vaultOriginOf(at)] as const;
}

/** The Bearer auth header, minted/re-minted through the O.7 bridge (same as records.ts).
 * For one request to `url`, through the one credential seam (`bearer.ts` `bearerHeaderFor`). */
function authHeader(url: string): Promise<Record<string, string>> {
  return bearerHeaderFor(url);
}

/**
 * GET /base/e/:id/relations — the relations the record participates in (reverse lookup).
 *
 * Returns `[]` on 404 (the record's participation set is unreadable/absent — the C2b
 * non-disclosure floor; an empty list is ALSO the honest answer for a record in no relation),
 * so the pane renders an honest "No relations" rather than an error. A 401 drops the token and
 * re-throws so the next call re-mints off the live Base cookie; any other non-2xx throws.
 *
 * @param at the record's own fully-qualified entity URI — the reverse lookup is a
 *   SUB-RESOURCE of one entity, so it is addressed at that entity's own origin. See
 *   {@link vaultOriginOf}. Pass `null` only where no URI is held.
 */
export async function readRelations(id: string, at: string | null): Promise<RecordRelation[]> {
  const reqUrl = BASE_ENTITY_RELATIONS_URL(id, at);
  const res = await fetch(reqUrl, {
    method: "GET",
    headers: { ...(await authHeader(reqUrl)), accept: "application/json" },
  });
  if (res.status === 404) return [];
  if (res.status === 401) {
    tokenManager.invalidate();
    throw new NotSignedInError();
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`relations read failed: ${res.status} ${detail}`.trim());
  }
  const doc = (await res.json()) as {
    relations?: Array<{
      relation?: unknown;
      role?: unknown;
      type?: unknown;
      members?: Array<{ member?: unknown; role?: unknown }>;
    }>;
  };
  const rows = Array.isArray(doc.relations) ? doc.relations : [];
  return rows
    .map((r) => {
      const members = Array.isArray(r.members)
        ? r.members
            .map((m) => ({
              member: String(m.member ?? ""),
              role: String(m.role ?? ""),
            }))
            .filter((m) => m.member !== "")
        : undefined;
      return {
        relation: String(r.relation ?? ""),
        role: String(r.role ?? ""),
        ...(typeof r.type === "string" && r.type !== "" ? { type: r.type } : {}),
        ...(members && members.length ? { members } : {}),
      };
    })
    .filter((r) => r.relation !== "");
}

/** The legible tail of an entity/relation URI (`…/base/r/abc123` -> `abc123`) — a stable
 * reference token to show when no human name is resolvable. RealityDisclosure: this surfaces
 * the id the vault actually gave us, never a guessed label. */
export function uriTail(uri: string): string {
  const clean = uri.split(/[?#]/)[0].replace(/\/+$/, "");
  const seg = clean.slice(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(seg) || uri;
  } catch {
    return seg || uri;
  }
}
