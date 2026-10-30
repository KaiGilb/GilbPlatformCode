import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";

/**
 * The vault's sovereignty-boundary host — the host the vault serves its entities/types under.
 * Base builds every entity/type URI as `https://<ownerHost>/base/…` (https even when dev
 * serves http), and the vault's own `@context` compacts `t:`/`a:` relative to THIS host, so
 * building the wire `type` under it makes the type compact to its `t:<Type>` CURIE-name
 * (the BaseVeda anchor). Derived from the platform origin (baseOrigin()) (the one Base origin the app talks to).
 */
export function baseHost(): string {
  return new URL(baseOrigin()).host;
}

/** The vault-relative BaseVeda Type namespace (`https://<vaultHost>/base/t/`) — compacts to
 * the `t:<Type>` CURIE-name that BaseVeda anchors by. */
export function typeNamespace(): string {
  return `https://${baseHost()}/base/t/`;
}

/** The absolute BaseVeda Type URI for a bare type name (the wire `type` value). */
export function typeUri(typeName: string): string {
  return `${typeNamespace()}${typeName}`;
}

/**
 * Wire `type` for a CREATE into a named vault namespace (`https://<name>.<platform host>/base`).
 *
 * Prefer the host-free CURIE `t:<Type>` (Base's canonical stored form after
 * IngestNotationNormalizer). Absolute URIs under the platform origin or the vault host
 * are treated as **foreign** when OWNER_HOST is kaizen — they stay absolute and the grid
 * list historically missed them (a note still in the DB showed an empty grid).
 *
 * `vaultNamespace` is retained for call-site stability / future host-scoped create.
 */
export function typeUriForVaultNamespace(typeName: string, _vaultNamespace: string): string {
  const bare = typeName.replace(/^t:/, "").trim();
  if (!bare) return typeUri(typeName);
  return `t:${bare}`;
}

/**
 * Normalizes ANY spelling of a BaseVeda Type the vault may hand back into the ONE absolute
 * form this app resolves by (`recordTypeByUri()` is keyed on `typeUri(name)`).
 *
 * WHY THIS EXISTS (2026-07-20, found on landing). Base's
 * IngestNotationNormalizer rewrites an own-host type URI to the host-free CURIE at the
 * write door, so `entity_state.type_uri` now STORES `t:Task`. `GET /lws/records` returns
 * that column verbatim — correctly. But `listVaultRecords` passed it through verbatim too,
 * and `recordHooks` then trusts the VAULT's typeUri over the framed `@type`, so every
 * grid/detail row reached `resolveType()` as `t:Task` and resolved to **null** — no icon,
 * no field spec, no typed editor. The read path already handled the CURIE
 * (`records.ts: typeUriFromFrame`); the vault-SET path did not. Neither repo's suite could
 * see it: BaseApp's harness stubs the vault with absolute URIs, and Base's suite never
 * renders a grid.
 *
 * Accepts, and maps to the same absolute URI:
 *   `t:Task` (host-free CURIE — what a normalized vault now stores)
 *   `Task` (bare name under @vocab)
 *   `https://<vaultHost>/base/t/Task` (own-host absolute — pre-normalizer rows)
 *   `https://<ontology host>/base/t/Task` (the canonical BaseVeda term namespace)
 *
 * ⚠ CORRECTED 2026-08-24. This block previously read "A FOREIGN-host absolute
 * URI is returned VERBATIM", and had said so since before `5e0a0c9` (2026-07-27) changed
 * the code beneath it. That was FALSE of the implementation for ~4 weeks: the match below
 * is on the PATH `/base/t/<Name>`, not on the host, so EVERY Base-family term IRI — any
 * vault host, and BaseVeda's own — collapses onto the one registry key. The stale text sent
 * a test (`vaultSets.test.ts`) to assert the opposite with a BaseVeda fixture it wrongly
 * called "foreign", which is how the contradiction stayed invisible.
 *
 * The rule as it ACTUALLY stands:
 *   • Base-family (`…/base/t/<Name>`, ANY host) → collapsed to `typeUri(Name)`. This is
 *     identity-PRESERVING: those spellings denote the same term, and the collapse is what
 *     makes a multi-vault OwnNameOwnHost row resolve to an icon/field-spec/typed editor.
 *   • Anything else (`https://schema.org/Task`) → returned VERBATIM. Rewriting a genuinely
 *     foreign ontology URI would fabricate a false join into permanent stored data; it
 *     simply will not resolve to a local record type, which is the honest answer.
 *
 * 🔴 KNOWN NARROW HOLE, recorded not fixed here: the match accepts `/base/t/` under ANY
 * host, so a genuine THIRD-PARTY Base-shaped host (`https://someoneelse.example/base/t/Task`)
 * is collapsed too — and because the normalized value is stored by `readRecord` and fed
 * back into full-replace writes (`entityShare.ts:292`, `recordHooks.ts:819`), the rewrite
 * can be PERSISTED. Closing it means constraining this to a known Base-family host set,
 * which is a behaviour change needing its own increment. Filed, not silently carried.
 */
export function normalizeTypeUri(raw: string | undefined | null): string {
  if (typeof raw !== "string" || raw === "") return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    // Multi-vault OwnNameOwnHost: every person vault has its own host. Map
    // `https://<name>.<platform host>/base/t/NoteDocument` → registry key under typeUri() so
    // resolveType finds Note/Person/Task. True foreign ontology URIs (no /base/t/) stay verbatim.
    const m = raw.match(/\/base\/t\/([^/#?]+)/i);
    if (m?.[1]) return typeUri(decodeURIComponent(m[1]));
    return raw;
  }
  return typeUri(raw.startsWith("t:") ? raw.slice(2) : raw);
}

/** The wire attribute key for a BaseVeda attribute slug — the `a:` prefix the vault's
 * @vocab strips on read (write `a:name`, read back `name`). */
export function attrKey(slug: string): string {
  return `a:${slug}`;
}

/**
 * 🔴 The ONE test for "is this served key a slug THIS APP can name?".
 *
 * It is `attrKey`'s counterpart: `attrKey` mints the wire key `a:<slug>`, and this says which
 * served keys that minting round-trips. `readRecord` strips ONE `a:`, so a vault fact written
 * under a foreign predicate reaches the app with that predicate as its whole slug — a full
 * IRI (`http://www.w3.org/2004/02/skos/core#exactMatch`) or a non-`a` CURIE (`owl:sameAs`,
 * `role:source`, `filectl:byteSize`), all four spellings measured live on M1 2026-08-29.
 * Re-minting such a key as `a:<it>` names a DIFFERENT attribute than the one served.
 *
 * ⇒ FALSE means: the app cannot address this fact, so it must neither render it, nor edit it,
 * nor retract it. Not-understood is not the same as not-there.
 *
 * ⚠ Deliberately not "is this a valid BaseVeda slug" — BaseVeda is the authority on that
 * (`probeAttribute`). This is only about what THIS app's `a:`-prefixing can address, which is
 * why it is a local shape test and not an ontology question.
 */
export function isAppAddressableSlug(slug: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(slug);
}

/** The editable kinds a typed field can take — drives the inline editor control. */
export type FieldKind = "text" | "textarea" | "email" | "url" | "select" | "date";

/**
 * Seed / legacy extra metadata slugs. Prefer live BaseVeda attribute search
 * (`searchAttributes` / `probeAttribute` in vocabCatalog) for add-field UX — this list is
 * no longer the UI ceiling; it only helps re-surface empty legacy keys after reload.
 * Keys must still be real BaseVeda attributes (`GET /base/a/<slug>`).
 */
export const ALLOWED_EXTRA_ATTR_SLUGS: readonly string[] = [
  "url",
  "phone",
  "email",
  "due",
  "personalNote",
  "jobTitle",
  "postalAddress",
  "account",
  "org",
] as const;

/** One typed field of a record type — the BaseVeda attribute + its display metadata. */
export interface FieldSpec {
  /** The BaseVeda attribute slug (anchored; written as `a:<slug>`). */
  slug: string;
  /** The human label shown in the editor + detail pane. */
  label: string;
  /** The editor control + parse/format behaviour. */
  kind: FieldKind;
  /** For `kind: "select"` — the allowed option values (each a BaseVeda-legible token). */
  options?: readonly string[];
  /** A short placeholder for the empty editor field. */
  placeholder?: string;
}

/** A record type in the grid — its BaseVeda Type + fields + which field titles the row
 * and which discriminates it (the mockup's per-type "discriminating field"). */
export interface RecordTypeSpec {
  /** The stable local id (also the icon key). */
  id: string;
  /** The bare BaseVeda type name → `typeUri(name)` is the wire `type`. NEW records always
   * anchor here; this is the current, correct term. */
  typeName: string;
  /** Prior BaseVeda type name(s) this spec used to anchor to, kept resolvable so records
   * written before a rename (e.g. Contact→Person, per the 2026-07-15 VABaseVedanta typing
   * pass) still load and render correctly. READ-ONLY back-compat — never written on create. */
  aliasTypeNames?: readonly string[];
  /** The human label ("Note", "Contact", "Task"). */
  label: string;
  /** The typed fields, in editor order. Empty, and only then, for an entry with `fieldsFrom`. */
  fields: readonly FieldSpec[];
  /**
   * An EXPLICIT marker, ⛔ never an empty list read as a signal: this
   * type's fields, and where its name is held, are the shared package's answers, read from the
   * master (`stakeholderCard.ts`). An entry with it holds no `fields`, no `nameField` and no
   * `discField` of its own (D3, VAVDT's ruling on the row's search).
   */
  fieldsFrom?: "stakeholder-package";
  /** The field slug shown as the row's primary name (the "last thing to vanish"). Absent only
   *  on an entry with `fieldsFrom`. */
  nameField?: string;
  /** The field slug shown as the row's discriminating detail, when present. */
  discField?: string;
  /** A one-word default name for a freshly-created blank record. */
  newLabel: string;
}

// ── The registry ─────────────────────────────────────────────────────────────────────
// A small, general, pilot-flavoured set (Note / Contact / Task) — the data fabric over
// any vault data. Each type + every field slug is a BaseVeda anchor the typing gate checks.
export const RECORD_TYPES: readonly RecordTypeSpec[] = [
  {
    id: "note",
    typeName: "NoteDocument", // is-a Document (VABaseVedanta 2026-07-15); was "Note"
    aliasTypeNames: ["Note"],
    label: "Note",
    newLabel: "New note",
    // Cross-app: master display = a:label (UI may still say "Title").
    nameField: "label",
    discField: "body",
    fields: [
      { slug: "label", label: "Title", kind: "text", placeholder: "Note title" },
      { slug: "body", label: "Body", kind: "textarea", placeholder: "Write something…" },
    ],
  },
  {
    id: "person",
    typeName: "Person", // is-a Agent (VABaseVedanta 2026-07-15); was "Contact" — the table is
    // explicit that "Contact" itself is a RELATION (is-a connected-to), not an entity, so the
    // record anchors to the entity it actually is: a Person.
    aliasTypeNames: ["Contact"],
    // 🔴 RULING, 2026-09-16. This read `label: "Contact"` while
    // `typeName` read `Person`, so a record correctly stored as `t:Person` was DISPLAYED as
    // "Contact". `t:Person`'s own `a:label` on the live master is **"Person"**; "Contact" is the
    // live `a:label` of `t:Contact`, a RELATION (`a:nodeKind: "relation"`, `a:predicateAttribute:
    // "a:hasContact"`). One word over two meanings is RuleBpontHomonym, and the ruling is
    // that a local registry MAY cache a term's label but may NEVER disagree with it.
    //
    // ⚠ The cost was measured, and a user is the witness: reading "Contact" on a correctly-typed
    // record, he concluded the node "was not created as a person" and filed an ontology defect at
    // severity-highest against data that was right (FINDING-2026-09-16-KaiTestRound1-GilbApp, G4).
    // ⇒ this was never an ontology error. The store was right; the screen was wrong.
    //
    // ⛔ `aliasTypeNames: ["Contact"]` stays — it is the READ path for rows written before the
    // 2026-07-15 rename, and dropping it would make them unresolvable. ⚠ BVedanta flags, and this
    // increment does NOT close, that the alias renders a legacy `t:Contact` row byte-identically
    // to a correct `t:Person` one, which hides the size of the debt. Closing that needs an
    // enumeration + migration and is its own increment.
    label: "Person",
    newLabel: "New person",
    // 🔴 NO FIELD LIST, NO NAME FIELD AND NO DISCRIMINATOR HERE. The
    // master lists this type as a stakeholder kind (`a:playableBy` of `t/Stakeholder`), and a
    // stakeholder kind's card shows the shared package's field set for it, resolved once per session
    // (`stakeholderCard.ts`), ⛔ never a list in this app
    // (4Sol.S.Arch.Stakeholders.CrossApp.SharedHeadlessPackage.GilbApp, Implementation 2;
    // 3P.C.Stakeholders.SameInEveryApp.GilbApp). Where a person's name is read and written is
    // `partyName.ts`; the list's row has no sub-line for this kind.
    fieldsFrom: "stakeholder-package",
    fields: [],
  },
  {
    id: "task",
    typeName: "Task", // Intent — unchanged
    label: "Task",
    newLabel: "New task",
    nameField: "label",
    // Wire attribute is a:status (BaseVeda Task Status, Approved) — NOT a:taskStatus (404).
    discField: "status",
    fields: [
      { slug: "label", label: "Title", kind: "text", placeholder: "What needs doing" },
      // a:status → Task Status (encoding node-reference ideal; app stores option labels To Do/Doing/Done).
      { slug: "status", label: "Status", kind: "select", options: ["To Do", "Doing", "Done"] },
      { slug: "due", label: "Due", kind: "date" }, // Intent (reused, Gilb #554) — unchanged
    ],
  },
  // Virtual folder — VIEW membership only. Flat registry unchanged; membership
  // is reified via relations (role:member). t:VirtualFolder Suggested in BaseVeda (A1 2026-07-27).
  // Does NOT contain/hide entities.
  {
    id: "folder",
    typeName: "VirtualFolder",
    label: "Folder",
    newLabel: "New folder",
    nameField: "label",
    discField: "body",
    fields: [
      { slug: "label", label: "Name", kind: "text", placeholder: "Folder name" },
      {
        slug: "body",
        label: "Notes",
        kind: "textarea",
        placeholder: "Optional — this is a view, not a box. Items stay in the flat list.",
      },
    ],
  },
  {
    id: "function",
    typeName: "Function",
    label: "Function",
    newLabel: "New function",
    nameField: "unitTag",
    discField: "body",
    fields: [
      { slug: "unitTag", label: "Tag", kind: "text", placeholder: "Area.Keyword, e.g. Content.Measure" },
      { slug: "body", label: "Description", kind: "textarea", placeholder: "What the system does, not how well and not how." },
    ],
  },
  {
    id: "functionConstraint",
    typeName: "FunctionConstraint",
    label: "Function Constraint",
    newLabel: "New function constraint",
    nameField: "unitTag",
    discField: "body",
    fields: [
      { slug: "unitTag", label: "Tag", kind: "text", placeholder: "Area.Keyword, e.g. Content.Measure" },
      { slug: "body", label: "Description", kind: "textarea", placeholder: "What must be done, by whose authority." },
    ],
  },
  {
    id: "value",
    typeName: "Value",
    label: "Value",
    newLabel: "New value",
    nameField: "unitTag",
    fields: [
      { slug: "unitTag", label: "Tag", kind: "text", placeholder: "Area.Keyword, e.g. Usability.Learn" },
    ],
  },
  {
    id: "solution",
    typeName: "Solution",
    label: "Solution",
    newLabel: "New solution",
    nameField: "unitTag",
    discField: "body",
    fields: [
      { slug: "unitTag", label: "Tag", kind: "text", placeholder: "Area.Keyword, e.g. Usability.Learn" },
      { slug: "body", label: "Description", kind: "textarea", placeholder: "How it is done." },
    ],
  },
  {
    id: "designConstraint",
    typeName: "DesignConstraint",
    label: "Solution Constraint",
    newLabel: "New solution constraint",
    nameField: "unitTag",
    discField: "body",
    fields: [
      { slug: "unitTag", label: "Tag", kind: "text", placeholder: "Area.Keyword, e.g. Usability.Learn" },
      { slug: "body", label: "Description", kind: "textarea", placeholder: "How it must be done, by whose authority." },
    ],
  },
  {
    id: "resource",
    typeName: "Resource",
    label: "Development Resource",
    newLabel: "New development resource",
    nameField: "unitTag",
    fields: [
      { slug: "unitTag", label: "Tag", kind: "text", placeholder: "Area.Keyword, e.g. Usability.Learn" },
    ],
  },
] as const;

/** Local ids retired by a rename, kept RESOLVABLE only.
 *
 * 🔴 `contact` → `person`, per the ruling that the code's own identifiers
 * carried the same Person/Contact conflation as the display label. ⛔ It is NOT a second name for
 * a live spec: `resolveType` accepts a local id from a route param, a saved filter and a
 * `TypeIcon` prop, so a stored `"contact"` must keep resolving or a person's saved view breaks on
 * deploy. Nothing WRITES a retired id — same read-only contract as `aliasTypeNames`. */
const RETIRED_TYPE_IDS: Readonly<Record<string, string>> = { contact: "person" };

/** All record types keyed by their local id, plus every retired id that still resolves. */
export const RECORD_TYPE_BY_ID: Readonly<Record<string, RecordTypeSpec>> = Object.fromEntries(
  RECORD_TYPES.flatMap((t) => [
    [t.id, t] as const,
    ...Object.entries(RETIRED_TYPE_IDS)
      .filter(([, current]) => current === t.id)
      .map(([retired]) => [retired, t] as const),
  ]),
);

/** All record types keyed by their absolute wire type URI (for read-back resolution) — the
 * current `typeName` AND every `aliasTypeNames` entry both resolve, so a record written
 * before a rename still loads (see the aliasTypeNames doc comment on RecordTypeSpec). */
export function recordTypeByUri(): Readonly<Record<string, RecordTypeSpec>> {
  const namespace = typeNamespace();
  if (byUriCache === null || byUriCache.namespace !== namespace) {
    byUriCache = {
      namespace,
      map: Object.fromEntries(
        RECORD_TYPES.flatMap((t) => [
          [typeUri(t.typeName), t] as const,
          ...(t.aliasTypeNames ?? []).map((alias) => [typeUri(alias), t] as const),
        ]),
      ),
    };
  }
  return byUriCache.map;
}

let byUriCache: { namespace: string; map: Readonly<Record<string, RecordTypeSpec>> } | null = null;

/** Resolves a record type from either its local id or its absolute type URI, or null. */
export function resolveType(idOrUri: string | undefined): RecordTypeSpec | null {
  if (!idOrUri) return null;
  return (
    RECORD_TYPE_BY_ID[idOrUri] ??
    recordTypeByUri()[idOrUri] ??
    recordTypeByUri()[normalizeTypeUri(idOrUri)] ??
    null
  );
}

