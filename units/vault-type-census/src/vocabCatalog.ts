// The published vocabulary as the vault-view find needs it: the opt-in listing of every servable term, each with the plane it sits on.
// Taken from the app's vocabulary-catalogue file: only what `catalogNodeTypeNames`, `classifyPlane` and `isCreatePlane` reach.

import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";

/**
 * Which PLANE of the ontology a term sits on.
 *
 * The platform serves every term under `/base/t/`, whatever its role, so the URL path carries NO role signal (measured: all 828
 * production terms, including `t:IsA` and `t:Label`). The plane has to be derived from the term's own facts, and it MUST be,
 * because "Approved and published" answers "may I name this term?", never "may I instantiate it?".
 *
 * Without this, a create surface offers `t:IsA` (a link), `t:Label` (a field) and `t:JobTitleClarity` (a measurement) as things
 * you can make a node of. 55 of 828 are like that.
 */
export type VedaPlane = "entity" | "function" | "relation" | "attribute" | "value";

export interface VocabTypeEntry {
  /** Local name e.g. NoteDocument */
  name: string;
  label: string;
  /** The ontological plane — decides whether this term may be a create-target. */
  plane: VedaPlane;
}

const TTL_MS = 60_000;

function pickLabel(t: Record<string, unknown>, fallback: string): string {
  const v = t["a:label"] ?? t.label;
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

/**
 * Headers for the PUBLIC vocabulary document: deliberately credential-free.
 *
 * Do NOT put `authorization` back on this request. Measured against production: the platform publishes `/base/vocab` with
 * `access-control-allow-origin: *`, and its preflight answers `access-control-allow-headers: accept, if-none-match`, so
 * `authorization` is NOT in that list. A cross-origin GET carrying a Bearer is therefore rejected by the browser before it is sent,
 * while the same request without one answers 200 (the route is public: 828 Approved terms, no credential required).
 *
 * Production never noticed, because the app is served from the platform's own origin: same origin, no preflight at all. The
 * Bearer only ever mattered off-apex (a development rig on another port, any other app origin), where it turned a working
 * public route into a silent empty catalog.
 */
function publicVocabHeaders(): Record<string, string> {
  return { accept: "application/ld+json, application/json" };
}

/**
 * Which vocabulary document a FIND may be built from, and why it is not the canonical one. This is the whole of the geo-vault
 * blank-grid defect, so it is written here rather than in a report nobody opens.
 *
 * Measured on production: the geo vault holds 51,228 record-plane rows over 8 type names (`Municipality` 36,204, `Town` 8,624,
 * `GeoAdminArea` 3,175, `City` 2,997, `Country` 216, `GeoRegion` 7, `SpatialFrame` 3, `GeoPlace` 2). Every one of those 8
 * dereferences at the ontology host to 200 with `a:ontologyStatus: Suggested` (positive control `NoteDocument` 200 `Approved`;
 * negative control a nonsense name 404). The CANONICAL document (`/base/vocab`) serves 12,037 nodes and not one of the 8 names;
 * `?status=all` serves 16,754 and carries all 8. So the find named 11,990 catalog names in 120 `?type=` chunks and not one of
 * them was a type the vault holds: the chunks answered normally, with `[]`, because nothing asked for the vault's types.
 *
 * The rule this encodes: `a:ontologyStatus` is a moderation state of a TERM. It is not a visibility gate on a person's DATA. The
 * canonical document is the right answer to "which types may I OFFER for creation?" (Approved is what that question wants). It is
 * the wrong answer to "which types might this vault HOLD?", because a vault holds what it holds. The platform built the door for
 * this: `?status=all` lets a viewer show a Suggested term truthfully without promoting it or widening the canonical document.
 *
 * Do NOT collapse the two reads into one document. The create surfaces must keep offering Approved terms only. `?status=all`
 * also serves `base-internal` module terms, which the canonical listing leaves out by the server's own predicate; reproducing that
 * predicate here to re-narrow one document into the other would be a new app-side enumeration.
 *
 * What the opt-in listing admits, counted: canonical 12,037 names, all Approved; opt-in 16,752 names (Approved 12,052, Deprecated
 * 3,434, Suggested 1,266); gained 4,715 (Deprecated 3,434, Suggested 1,266, Approved 15); lost 0. The opt-in listing is a strict
 * SUPERSET, so no name the find issues today stops being issued. Four fifths of what it admits is Deprecated, deliberately: a
 * Deprecated term was recommended and data was written under it, and it keeps dereferencing so that instance data keeps resolving;
 * hiding it would hide the rows that most need to be seen (those awaiting migration).
 *
 * The module leak, declared: 15 of the gained names are Approved terms the canonical document scopes out by `a:module`
 * (`skill-esco-thin` 10, `skill-esco` 3, `base-internal` 2). This code reads no `a:module`, so `base-internal` terms now reach a
 * user-facing find name source. The effect is inert (naming a type no vault holds returns nothing). Do not "fix" it by filtering
 * `a:module` here: that is the server's predicate.
 *
 * Cost, disclosed: the opt-in listing is 233,127,767 bytes against the canonical 175,510,134, and yields 16,279 create-plane names
 * against 11,990, so 163 `?type=` chunks instead of 120. That is a 33 % worse fallback on a path already known to be pathological,
 * accepted for one reason: the vault's data is invisible without it. The path is the FALLBACK. It is taken only while the platform
 * answers 404 on the census door (`listVaultHeldTypes` returns null). On a platform that serves the census, the vault answers for
 * itself and neither document is read at all.
 */
async function fetchVocabGraphAt(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url, { headers: publicVocabHeaders() });
  if (!res.ok) return [];
  const doc = (await res.json()) as Record<string, unknown>;
  if (Array.isArray(doc["@graph"])) return doc["@graph"] as Record<string, unknown>[];
  if (Array.isArray(doc.terms)) return doc.terms as Record<string, unknown>[];
  return [];
}

/** The OPT-IN listing — every servable term with its true `a:ontologyStatus`. The FIND name
 * source. `status=all` is the ONLY selector the route honours; anything else takes the
 * canonical path (`Base/src/routes/vocab.ts`). */
const OPT_IN_VOCAB_URL = () => `${baseOrigin()}/base/vocab?status=all`;

/** The `@id` of a term's declared parent (`a:subTypeOf`), or null. */
function parentId(t: Record<string, unknown>): string | null {
  const v = t["a:subTypeOf"];
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "@id" in v) {
    const id = (v as { "@id": unknown })["@id"];
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** Does this term BIND an attribute predicate (`a:…` / `skos:…`) rather than name a thing? */
function bindsAttributePredicate(t: Record<string, unknown>): boolean {
  const v = t["a:predicateAttribute"];
  const s =
    typeof v === "string"
      ? v
      : v && typeof v === "object" && "@id" in v
        ? String((v as { "@id": unknown })["@id"] ?? "")
        : "";
  // ⚠ The VALUE PREFIX is the discriminator, never the key's presence: `t:NoteDocument` and
  // `t:Task` also carry `a:predicateAttribute`, with a `t:`-prefixed value. Keying on presence
  // would exclude two of the four types BaseApp ships.
  return s.startsWith("a:") || s.startsWith("skos:");
}

/** Facts that only a Value/Scale term carries — it is MEASURED, never instantiated. */
const VALUE_MARKERS = [
  "a:measures",
  "a:valuedBy",
  "a:scale",
  "a:unit",
  "a:scaleAnchors",
  "a:meter",
  "a:hasMeter",
  "a:endpointSubject",
  "a:endpointReference",
] as const;

/**
 * Classify a term onto its plane, first hit wins.
 *
 * ⛔ Do NOT add `a:providesFunction` to the function test. It marks a COMPLETE TYPE (every
 * Type carries a Function) — `t:Rule`, the exact term reported missing, has it. Keying on
 * it would re-break the very defect this increment fixes.
 */
// Exported, not copied: the census path (`heldTypes.ts`) derives a held type's plane from its dereferenced term facts with THIS
// derivation. Any second plane derivation is a regression.
export function classifyPlane(
  t: Record<string, unknown>,
  ancestors: readonly string[],
): VedaPlane {
  const kind = typeof t["a:nodeKind"] === "string" ? (t["a:nodeKind"] as string) : "";
  const endsWith = (tail: string) =>
    ancestors.some((a) => a.endsWith(`/base/t/${tail}`)) ||
    String(t["@id"] ?? "").endsWith(`/base/t/${tail}`);

  if (kind === "relation" || t["a:isRelationPredicate"] === true || endsWith("Relation")) {
    return "relation";
  }
  if (kind === "attribute" || bindsAttributePredicate(t) || endsWith("Identity")) {
    return "attribute";
  }
  if (kind === "value" || VALUE_MARKERS.some((k) => t[k] !== undefined)) return "value";
  if (kind === "function" || t["a:verb"] !== undefined || endsWith("Function")) return "function";
  return "entity";
}

/**
 * The FIND-side catalogue: the opt-in listing, not the canonical one. See the long note above `fetchVocabGraphAt` for the measured
 * defect this closes. Own cache, own in-flight de-dup, same TTL and same failure posture as the create-side catalogue; a fetch that
 * resolves to nothing is an outage, not an empty ontology.
 *
 * Do not "simplify" this into the create-side read. The two callers ask different questions and the server answers them at
 * different addresses; fusing them either hides a person's records (canonical for the find, the defect) or offers unapproved terms
 * on the create surfaces.
 */
let findCached: VocabTypeEntry[] | null = null;
let findCachedAt = 0;
let findInFlight: Promise<VocabTypeEntry[]> | null = null;

export async function readFindTypeCatalog(): Promise<{
  terms: VocabTypeEntry[];
  stale: boolean;
}> {
  if (findCached && Date.now() - findCachedAt < TTL_MS) return { terms: findCached, stale: false };
  if (findInFlight) return { terms: await findInFlight, stale: false };
  const run = (async () => {
    const entries = await deriveTypeEntries(await fetchVocabGraphAt(OPT_IN_VOCAB_URL()));
    findCached = entries;
    findCachedAt = Date.now();
    return entries;
  })();
  findInFlight = run;
  try {
    const terms = await run;
    return { terms, stale: terms.length === 0 };
  } catch {
    return { terms: findCached ?? [], stale: true };
  } finally {
    if (findInFlight === run) findInFlight = null;
  }
}

/**
 * The catalogue of the planes the Nodes type chooser actually creates: Things (entity) | Functions | Values. The all-types find
 * must issue those names, or a just-created Function vanishes after hydrate. Relation-plane types (CapableOf, PartOf, ...) stay out
 * of the register. The attribute plane is not a create plane. An empty catalogue is a miss.
 *
 * The name source is the OPT-IN listing (`?status=all`), not the canonical Approved-only document. This one line is the geo-vault
 * blank grid: all 8 types the vault holds are `Suggested`, so the canonical document names none of them, so all 120 chunks asked
 * for types the vault does not have and the person was told "No records yet" over 51,228 rows. The full measurement is on
 * `fetchVocabGraphAt` above.
 */
export async function catalogNodeTypeNames(): Promise<string[]> {
  const { terms } = await readFindTypeCatalog();
  return [
    ...new Set(
      terms
        .filter((t) => isCreatePlane(t.plane))
        .map((t) => t.name.trim())
        .filter((n) => n.length > 0),
    ),
  ];
}

/**
 * The planes the Nodes create surfaces instantiate: Things (entity) | Functions | Values. ONE predicate for that set:
 * `catalogNodeTypeNames` (the catalogue) and the census consumer (`heldTypes.ts`) both read it, so a plane added to or removed
 * from the create set is decided once. A third `||` chain over the planes would be a new enumeration.
 */
export function isCreatePlane(plane: VedaPlane): boolean {
  return plane === "entity" || plane === "function" || plane === "value";
}

/** The ONE derivation from a served vocabulary `@graph` to plane-carrying entries. Both
 * documents (canonical and opt-in) go through it, so the create set and the find set can never
 * disagree about what a term's plane IS — only about which terms the server was asked for
 * (no second plane derivation in `src/lib/base/`). */
async function deriveTypeEntries(graph: Record<string, unknown>[]): Promise<VocabTypeEntry[]> {
  {
    const byId = new Map<string, Record<string, unknown>>();
    for (const t of graph) {
      const id = String(t["@id"] ?? t.id ?? "");
      if (id) byId.set(id, t);
    }
    /** Walk `a:subTypeOf` to the root. Bounded, so a cyclic ontology cannot hang the app. */
    const ancestorsOf = (t: Record<string, unknown>): string[] => {
      const out: string[] = [];
      const seen = new Set<string>();
      let cur: Record<string, unknown> | undefined = t;
      while (cur && out.length < 64) {
        const p: string | null = parentId(cur);
        if (!p || seen.has(p)) break;
        seen.add(p);
        out.push(p);
        cur = byId.get(p);
      }
      return out;
    };

    const out: VocabTypeEntry[] = [];
    for (const t of graph) {
      const id = String(t["@id"] ?? t.id ?? "");
      if (!id.includes("/t/") && !id.startsWith("t:")) continue;
      const name = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id.replace(/^t:/, "");
      if (!name || name.length < 2) continue;
      out.push({ name, label: pickLabel(t, name), plane: classifyPlane(t, ancestorsOf(t)) });
    }
    const by = new Map(out.map((e) => [e.name, e]));
    return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
}
