/**
 * One employment = one `t:Employment` entity (`a:org` the company name, `a:jobTitle` a scalar for one title and an array for
 * several, `a:claimSlotKey` its minted handle, `a:startDate`, `a:endDate`, `a:ongoing`, `a:workLocation` a place), and the
 * person's record carries the ordered `a:employment` reference edges to them (`employment-edges`). Written in the vault that
 * HOLDS the person's record; the record is the subject (it carries the edges).
 *
 * Kept from the source:
 *   - NO AUDIENCE RUNG: nothing here names a visibility tier; a rung another app stored on an entity is never cleared (a merge
 *     patch leaves a key it does not name);
 *   - an edge that does not read is UNRESOLVED, never absent: `resolveEmployments` reports it and the caller carries it
 *     (a 404 is ambiguous by the store's own design: it merges "absent" with "unreadable");
 *   - every create is vault-scoped and throws without a vault; the handle is minted (`empx-...`), never positional;
 *   - the entity is patched in place with a MERGE patch, never a full replace.
 *
 * Changed from the source (named in unit.json):
 *   - `catalogueOrigin` is a parameter of `resolveEmployments` (the source read a module constant of its geo client). With none,
 *     a place stored in the compact `base:e/<id>` form reads as no place, and a full address reads as it is;
 *   - a NULL goes on the wire only for a value the person removed. `updateEmploymentEntity` takes `titlesStored` (the titles as
 *     last read) and `roleBefore` (the role as last read): `a:jobTitle` is nulled only when a stored title is now gone, and the
 *     role keys are named by `roleChangeWire` (only what the edit changed). Without them nothing is nulled;
 *   - `readEmploymentEntity` and `employmentEdgesToWire` are not taken (only the source's tests called them).
 */
import { createResource, getResource, patchResource, type FactValue } from "@kaigilb/gilbplatformcode-vault-resources";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { assertMintedHandle, isMintedHandle, mintEmploymentHandle } from "@kaigilb/gilbplatformcode-claim-handle";
import { readRole, roleChangeWire, roleWire, type EmploymentRoleFacts } from "@kaigilb/gilbplatformcode-employment-role";
import type { ResolvedEmploymentVocab as ResolvedProfileVocab } from "@kaigilb/gilbplatformcode-employment-vocab";
import { employmentLinkFacts } from "@kaigilb/gilbplatformcode-employment-link";
import type { EmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";

/** A served document (keys as served). */
export type LwsResourceDoc = Record<string, unknown>;

/** MyNet `vocab.ts` `wireKeyFor`, verbatim: a framed doc serves `a:org` as `org`. */
function wireKeyFor(storedAttribute: string): string {
  return storedAttribute.startsWith("a:") ? storedAttribute.slice(2) : storedAttribute;
}

/** GilbApp's `getResource` answers `{}` for a 404; MyNet's throws. Both mean NOT READ here. */
async function readDoc(uri: string, vaultId: string): Promise<LwsResourceDoc> {
  const { doc } = await getResource(idFromResourceUri(uri), vaultId, uri);
  if (Object.keys(doc).length === 0) throw new Error(`${uri} did not read (404 or empty)`);
  return doc;
}

/**
 * One employment as the store holds it: its own entity, its own address.
 *
 * ⚠ `uri` is the ADDRESS and is what the profile document's `a:employment` edge points at.
 * `key` is the app's stable in-model handle (`emp1`) and is ALSO the claim plane's network
 * address (`profileFieldClaim.employmentCompanySlot`). The two are ⛔ not interchangeable and
 * both must survive a round trip — the key because the enforced claim plane is addressed by it,
 * the uri because the edge is.
 */
export interface StoredEmploymentEntity {
  /** The full entity URI — what the edge carries. */
  uri: string;
  /** The opaque `/lws/r/<id>` segment. */
  id: string;
  /** The app's stable employment key (`emp1`), carried on the entity as `a:name`. */
  key: string;
  /** Exactly ONE organisation, per the term's own definition. */
  company: string;
  /** One or more titles held AT that organisation, in the order the holder entered them. */
  titles: string[];
  /** Dates and place, when the vocabulary that names them was resolved. */
  role?: EmploymentRoleFacts;
  /** s8 organization card: the organization RECORD this employment names (`a:employer`), or null when it names
   *  none (a name-only employment). Read only when the link vocabulary was handed to the reader. */
  employer?: string | null;
}

/** The facts one employment node carries. Built in ONE place so the write and the read cannot
 *  drift — the drift between a writer and a reader is precisely the defect being repaired. */
export interface EmploymentFacts {
  key: string;
  company: string;
  titles: string[];
  /**
   * Present only when this edit is about the role.
   * A company or title edit omits it, so a merge patch does not clear stored dates.
   */
  role?: EmploymentRoleFacts;
  /**
   * s8 organization card: the employer chosen as an organization RECORD. `a:employer` and `a:employee` are written
   * together with `a:org` (`employmentLinkFacts`). Absent: the employment's links are left as stored.
   */
  links?: { employer: string; employee: string };
  /** s8 organization card: the holder named a company that is NOT an organization record (typed text): the two
   *  links are retracted (merge-patch null). A holder's act, ⛔ never inferred from an absent `links`. */
  unlink?: boolean;
  /**
   * The titles as the entity last read them. `updateEmploymentEntity` nulls `a:jobTitle` only when one of these was non-blank and
   * the edit left none (the person removed the last title). Absent: the caller does not know, and nothing is nulled.
   */
  titlesStored?: readonly string[];
  /**
   * The role as the entity last read it. `updateEmploymentEntity` names only the role attributes the edit changed
   * (`roleChangeWire`). Absent: the employment had no role, and an attribute the edit leaves empty is not nulled.
   */
  roleBefore?: EmploymentRoleFacts;
}

/**
 * 🔴 THE ONE HOME FOR THE EMPLOYMENT NODE'S WIRE SHAPE.
 *
 * ⚠ `a:jobTitle` is written as a SCALAR when there is one title and an ARRAY when there are
 * several — the identical rule `a:skill` already ships and every existing reader already holds.
 * ⛔ Not a stylistic choice: a one-element array is a different jsonb value from a scalar, and
 * writing arrays unconditionally would change the stored shape for every single-title employment
 * in production for no gain.
 *
 * ⛔ A BLANK COMPANY IS STILL A MEMBER. It is written as the empty string rather than omitted,
 * and that is the fix for the exact defect the predecessor shipped into review: their writer
 * pushed a blank company unconditionally while their reader DROPPED blanks and then consumed
 * positionally, so one hole in the middle shifted every later company up one employer. Here the
 * join is the entity, so a blank cannot shift anything — but the field is still written, so the
 * holder's own "(blank company, real title)" row round-trips as the thing they typed.
 */
export function employmentFactsToWire(
  facts: EmploymentFacts,
  vocab: ResolvedProfileVocab,
  /** s8 organization card: the master's spellings of `a:employer` / `a:employee`; needed when `facts.links` is set. */
  linkVocab?: EmploymentLinkVocab,
): Record<string, FactValue> {
  const titles = facts.titles.map((t) => t.trim()).filter((t) => t !== "");
  const out: Record<string, FactValue> = {
    // ⛔ Written even when empty — see the header. The reader must agree, and it does.
    [vocab.org]: facts.company,
  };
  if (facts.links) {
    // ⛔ No guessed key: a link is written only under the spelling the master named.
    if (!linkVocab) throw new Error("Refusing to write an employer link: the master's spelling of a:employer / a:employee was not resolved.");
    Object.assign(out, employmentLinkFacts(linkVocab, facts.links) as Record<string, FactValue>);
  }
  // ── 🔴 CYCLE160 D17 LANE 5 — THE IDENTITY SLOT TAKES A MINTED HANDLE, OR NOTHING ──────────
  //
  // 🔴 THE TYPING GATE FOUND THIS AND IT IS THE DISJOINTNESS VIOLATED AS A *WRITE*. This line was
  // `[vocab.claimSlotKey]: facts.key` unconditionally. `updateEmploymentEntity` is reached on the
  // fail-safe path where a claim move could ⛔ NOT be proven — a branch whose own condition is
  // `isPositionalHandle(empKey)` — so by construction it wrote a POSITIONAL token into
  // `a:claimSlotKey`, the very thing `t/ClaimSlotKey` ⊥ `t/PositionalHandle` forbids. Two of the
  // three mint paths assert a minted handle; this one asserted nothing and ⛔ no mutant covered it.
  //
  // ⚠ The gate did ⛔ NOT measure it destructive — in every state it could construct, the update
  // re-asserts the value already stored — and it said so as a BOUND ON ITS EVIDENCE, ⛔ not as
  // harmlessness. ⛔ Do not read it as safe.
  //
  // 🔴 AND THE REMEDY IS ⛔ NOT AN ASSERTION. Throwing here would abort the correct fail-safe path,
  // turning "the move could not be proven, so keep the flat home" into a lost keystroke. A merge
  // patch that OMITS an attribute leaves the stored one untouched ⇒ emitting nothing is exactly
  // right: the entity keeps whatever handle it already has, and ⛔ no positional token is ever
  // written into the identity slot. ✅ Every call site is already redundant in the handle, so this
  // costs nothing.
  if (isMintedHandle(facts.key)) out[vocab.claimSlotKey] = facts.key;
  if (titles.length === 1) out[vocab.jobTitle] = titles[0]!;
  else if (titles.length > 1) out[vocab.jobTitle] = titles as unknown as FactValue;
  // GilbApp: no `a:visibilityTier` line here — see the header (no audience rung).
  if (facts.role) {
    const attrs = roleAttrs(vocab);
    if (!attrs) {
      throw new Error(
        "Refusing to write a role date or place: the served attribute names were not resolved.",
      );
    }
    const wired = roleWire(facts.role, attrs);
    for (const [key, value] of Object.entries(wired.set)) out[key] = value;
  }
  return out;
}

function roleAttrs(vocab: ResolvedProfileVocab) {
  if (!vocab.startDate || !vocab.endDate || !vocab.ongoing || !vocab.workLocation) return null;
  return {
    startDate: vocab.startDate,
    endDate: vocab.endDate,
    ongoing: vocab.ongoing,
    workLocation: vocab.workLocation,
  };
}

/**
 * Values a framed doc carries for `attr`, as a list (scalar = one-element list).
 * Mirrors `model/profile.ts:docValuesForSlug`.
 *
 * 🔴 Cycle161 `S29` — `attr` IS NOW THE STORED KEY (`a:jobTitle`, from `vocab.*`), and a framed
 * doc does ⛔ NOT carry it under that name. {@link wireKeyFor} performs the ONE lawful read-side
 * reduction; see its docstring for the measurement. ⚠ Without this the whole employment read leg
 * would silently return empty on every card — the `S29` write-spelling change and this line are
 * ONE change and ⛔ must not be separated.
 *
 * The three lookups are, in order: the wire key (what the server actually serves), the stored key
 * verbatim (defensive — a non-`a:` CURIE or full IRI is its own wire key), and the `a:`-prefixed
 * form (defensive, for a caller that still passes a bare slug).
 */
function valuesForSlug(doc: LwsResourceDoc, attr: string): unknown[] {
  const wire = wireKeyFor(attr);
  const raw = doc[wire] != null ? doc[wire] : doc[attr] != null ? doc[attr] : doc[`a:${attr}`];
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function firstString(doc: LwsResourceDoc, slug: string): string {
  const v = valuesForSlug(doc, slug)[0];
  return typeof v === "string" ? v : "";
}

/** Reads one employment node's framed document back into the shape the model uses. */
export function employmentFromDoc(
  uri: string,
  doc: LwsResourceDoc,
  vocab: ResolvedProfileVocab,
  linkVocab?: EmploymentLinkVocab,
  catalogueOrigin?: string,
): StoredEmploymentEntity {
  const titles = valuesForSlug(doc, vocab.jobTitle)
    .map((v) => (typeof v === "string" ? v : ""))
    .filter((v) => v !== "");
  const role = readEmploymentRole(doc, vocab, catalogueOrigin);
  return {
    uri,
    id: idFromResourceUri(uri),
    // ⚠ Both spellings read: `a:claimSlotKey` is the correct home, and `a:name` is read as a
    // FALLBACK ⛔ only so an entity written by the flagged build is still recoverable rather
    // than orphaned. ⛔ Nothing writes `a:name` here any more.
    key: firstString(doc, vocab.claimSlotKey) || firstString(doc, vocab.name),
    // ⛔ An absent company reads as "", which is the SAME value a blank company was written as.
    // The writer and this reader therefore agree on what a blank is, which is the whole of the
    // positional-shift repair.
    company: firstString(doc, vocab.org),
    titles,
    ...(role ? { role } : {}),
    ...(linkVocab ? { employer: employerOf(doc, linkVocab) } : {}),
  };
}

/** s8 organization card: the address `a:employer` holds on one employment document, or null. */
export function employerOf(doc: LwsResourceDoc, linkVocab: EmploymentLinkVocab): string | null {
  const raw = valuesForSlug(doc, linkVocab.employer)[0];
  if (typeof raw === "string" && raw) return raw;
  if (raw && typeof raw === "object" && typeof (raw as { "@id"?: unknown })["@id"] === "string") return (raw as { "@id": string })["@id"] || null;
  return null;
}

/** A place value that is a full http(s) address, as `fullPlaceIri` reads it; anything else is undefined. */
function fullAddressOnly(raw: unknown): unknown {
  const v = typeof raw === "string" ? raw : raw && typeof raw === "object" ? (raw as { "@id"?: unknown })["@id"] : undefined;
  return typeof v === "string" && /^https?:\/\//.test(v) ? raw : undefined;
}

function readEmploymentRole(
  doc: LwsResourceDoc,
  vocab: ResolvedProfileVocab,
  catalogueOrigin: string | undefined,
): EmploymentRoleFacts | undefined {
  const attrs = roleAttrs(vocab);
  if (!attrs) return undefined;
  return readRole(
    {
      start: valuesForSlug(doc, attrs.startDate)[0],
      end: valuesForSlug(doc, attrs.endDate)[0],
      ongoing: valuesForSlug(doc, attrs.ongoing)[0],
      // With no catalogue origin a compact `base:e/<id>` cannot be made a full address: it reads as no place.
      place: catalogueOrigin === undefined ? fullAddressOnly(valuesForSlug(doc, attrs.workLocation)[0]) : valuesForSlug(doc, attrs.workLocation)[0],
    },
    catalogueOrigin ?? "",
  );
}

/**
 * The ordered `a:employment` edge list carried on a person's profile document.
 *
 * 🔴 ORDER IS ARRAY POSITION, and that is the term's own ruling, ⛔ not an app convention:
 * `a:employment`'s `a:premodNote` says "Ordering is carried by ARRAY POSITION, the same mechanism
 * a:skill already uses […] no separate order attribute is minted." ⇒ ⛔ do not invent one.
 *
 * ⚠ Position carrying ORDER is lawful here in a way position carrying the (employer, title)
 * PAIRING was not, and the difference is the whole adjudication: the pairing is a JOIN between
 * two independent lists and is unrecoverable if either shifts; the order is a property OF the one
 * list, and a consumer that ignores it still reads every employment correctly.
 */
export function employmentEdgesFromDoc(doc: LwsResourceDoc, vocab: ResolvedProfileVocab): string[] {
  const out: string[] = [];
  for (const raw of valuesForSlug(doc, vocab.employment)) {
    if (typeof raw === "string" && raw) out.push(raw);
    else if (raw && typeof raw === "object" && "@id" in (raw as Record<string, unknown>)) {
      const id = (raw as { "@id"?: unknown })["@id"];
      if (typeof id === "string" && id) out.push(id);
    }
  }
  return out;
}


/**
 * Resolves the person's employments by dereferencing each edge.
 *
 * 🔴 **THE RETURN DISTINGUISHES `resolved` FROM `unresolved`, AND THAT IS THE ENTIRE POINT.**
 *
 * A read that fails and a read that returns nothing are the same bytes to a naive caller, and
 * treating them alike is the mechanism that destroyed Kai's data: the load path read one
 * employment, concluded the others were absent, and withdrew them. This function therefore
 * ⛔ NEVER reports an edge it could not read as an employment that is not there. It reports it
 * as **unresolved, by URI**, and the caller is obliged to carry it forward untouched.
 *
 * ⚠ This is [[4Sol.S.Arch.StoredState.AutomaticWriteRequiresProvenAbsence]]'s shape applied at
 * the one site that matters: `Present` / `ProvenAbsent` / **`Unknown`**, and an automatic path
 * handed `Unknown` writes nothing and reports.
 */
export interface ResolvedEmployments {
  /** Edges that dereferenced, in the document's own order. */
  resolved: StoredEmploymentEntity[];
  /** 🔴 Edges that did ⛔ NOT dereference. The caller MUST re-emit these verbatim. */
  unresolved: string[];
  /** True only when EVERY edge was read. ⛔ A false here forbids any withdrawal decision. */
  complete: boolean;
}

export async function resolveEmployments(
  doc: LwsResourceDoc,
  vocab: ResolvedProfileVocab,
  vaultId: string,
  /** s8 organization card: when given, each employment also reads which organization record it names. */
  linkVocab?: EmploymentLinkVocab,
  /** The origin of the place catalogue, to make a compact `base:e/<id>` a full address. Absent: such a place reads as none. */
  catalogueOrigin?: string,
): Promise<ResolvedEmployments> {
  const edges = employmentEdgesFromDoc(doc, vocab);
  const resolved: StoredEmploymentEntity[] = [];
  const unresolved: string[] = [];
  for (const uri of edges) {
    try {
      const node = await readDoc(uri, vaultId);
      resolved.push(employmentFromDoc(uri, node, vocab, linkVocab, catalogueOrigin));
    } catch (err) {
      // ⚠ REPORTED, ⛔ never swallowed and ⛔ never converted into an absence. A 404 here is
      // ambiguous by the store's own design — `NotFoundError` merges "absent" with "unreadable"
      // (`lws.ts:51`) — so it is ⛔ not evidence the employment is gone.
      unresolved.push(uri);
      console.error(`[mnb] employment edge ${uri} did not dereference — carried forward unread`, err);
    }
  }
  return { resolved, unresolved, complete: unresolved.length === 0 };
}


/**
 * Mints one employment entity in the vault that HOLDS the person's record and returns its address.
 *
 * ⛔ `vaultId` is required and this throws before any network call without it — MyNet's structural
 * guard against Base's create-folds-onto-a-system-vault-and-answers-201 hazard, kept.
 *
 * ── GilbApp: THE HANDLE IS MINTED HERE (MyNet: read off a `ProvenClaimMove`) ──────────────────
 *
 * On MyNet the handle comes from the proof that the OWNER's BaseConnect claims were moved to it
 * first (BVedanta `BVF-13`: minting while the claims stayed at positional slots withdrew them). A
 * GilbApp record publishes no claim, so there is nothing to move and nothing to prove: the handle is
 * MyNet's own `mintEmploymentHandle()` — the minted space (`empx-…`), asserted as MyNet asserts it, so
 * ⛔ a positional token can still never reach `a:claimSlotKey`.
 */
export async function createEmploymentEntity(
  vaultId: string,
  facts: Omit<EmploymentFacts, "key">,
  vocab: ResolvedProfileVocab,
  linkVocab?: EmploymentLinkVocab,
): Promise<StoredEmploymentEntity> {
  if (!vaultId) {
    throw new Error(
      "Refusing to mint an employment with no vault partition named — a create with no owned vault " +
        "folds onto the deployment's default vault and still answers 201.",
    );
  }
  const handle = mintEmploymentHandle();
  assertMintedHandle(handle);
  const created = await createResource(vaultId, {
    type: vocab.employmentType,
    facts: employmentFactsToWire({ ...facts, key: handle }, vocab, linkVocab),
  });
  const uri = created.location || created.id;
  return {
    uri,
    id: created.id,
    key: handle,
    company: facts.company,
    titles: facts.titles.filter((t) => t.trim() !== ""),
    ...(facts.role ? { role: facts.role } : {}),
    ...(facts.links ? { employer: facts.links.employer } : {}),
  };
}

/**
 * Updates one employment entity in place.
 *
 * ⚠ A PATCH (JSON Merge Patch), ⛔ never a full PUT. Base pins a MODIFY to the entity's own
 * `vault_id`, so it lands where the entity already lives and nowhere else — and a merge patch
 * touches only the attributes named, so a fact another app put on this employment node is
 * ⛔ not retracted by the holder editing their job title. That is the cross-app arm, structurally
 * rather than by care.
 */
export async function updateEmploymentEntity(
  id: string,
  facts: EmploymentFacts,
  vocab: ResolvedProfileVocab,
  vaultId: string,
  /**
   * 🔴 The employment's own address. Without it the PATCH went to {@link vaultOrigin}, which is the
   * main host unless the server has said otherwise, and the platform finds `/lws/r/<id>` only on the
   * host that holds it: every edit to an existing job answered 404 while the screen said "saved"
   * (Agent.Tester F-P1, Cycle214 1c, also at live `fbccc63`). The read path already addresses an
   * entity on its own host ({@link entityDereferenceOrigin}); the write now does the same.
   */
  entityUri?: string,
  /** s8 organization card: the master's spellings of `a:employer` / `a:employee` (needed for `links` and `unlink`). */
  linkVocab?: EmploymentLinkVocab,
): Promise<void> {
  // The role is not part of the shared wire here: an edit names only what it changed (below).
  const wire = employmentFactsToWire({ ...facts, role: undefined }, vocab, linkVocab);
  const patch: Record<string, FactValue | null> = { ...wire };
  if (facts.unlink && !facts.links) {
    if (!linkVocab) throw new Error("Refusing to retract an employer link: the master's spelling of a:employer / a:employee was not resolved.");
    patch[linkVocab.employer] = null;
    patch[linkVocab.employee] = null;
  }
  // An employment that lost its every title must actually lose them — merge-patch null deletes.
  // ⚠ Lawful here and ⛔ not in the tier branch below, and the difference is EVIDENCE: the titles
  // in `facts` come from the holder's own edit, in the same gesture. Their absence IS the holder's
  // act. The tier's absence is not.
  // Named change: only when a title that was stored is now gone. An edit of the company or the role, on an entity that read with no
  // title (or whose `a:jobTitle` did not read), names no title key and so deletes nothing.
  if (wire[vocab.jobTitle] === undefined && (facts.titlesStored ?? []).some((t) => t.trim() !== "")) patch[vocab.jobTitle] = null;
  // ── 🔴 VATester D17-F4 — AN ORDINARY EDIT USED TO DELETE THE STORED AUDIENCE RUNG ──────────
  //
  // This line was `if (wire[vocab.visibilityTier] === undefined) patch[…] = null;` and merge-patch
  // `null` DELETES. The tier handed in comes from `admittedEmploymentRungs`, which is filled by a
  // read inside the load effect whose `catch` only logs. ⇒ a holder who edited a job title
  // **before that read completed**, or **after it threw**, sent `tier: null` and the audience rung
  // they had placed was destroyed — with ⛔ no act of theirs on it. VATester's probe F8 measured
  // it: rung stored, one ordinary title edit, rung reads back absent.
  //
  // 🔴 **ABSENT IS ⛔ NOT PROVEN-ABSENT.** That is
  // [[4Sol.S.Arch.StoredState.AutomaticWriteRequiresProvenAbsence]] verbatim, and it is the same
  // rule `resolveEmployments` already obeys on the read leg: `Present` / `ProvenAbsent` /
  // **`Unknown`**, and an automatic path handed `Unknown` writes NOTHING.
  //
  // ⇒ the tier is now deleted ⛔ ONLY on an EXPLICIT `null`, which a caller passes when it can
  // account for the absence. `undefined` means the caller does not know, and an unknown leaves the
  // stored rung exactly where the holder put it ([[3P.V.StoredState.DestroyedWithoutHolderAct]]).
  // GilbApp: no rung is written, so none is ever cleared (the line above is MyNet's, and its rule
  // holds a fortiori: a rung another app stored is left exactly where it is).
  if (facts.role) {
    const attrs = roleAttrs(vocab);
    if (!attrs) {
      throw new Error("Refusing to write a role date or place: the served attribute names were not resolved.");
    }
    const change = roleChangeWire(facts.roleBefore, facts.role, attrs);
    for (const [key, value] of Object.entries(change.set)) patch[key] = value;
    for (const key of change.clear) patch[key] = null;
  }
  await patchResource(id, patch, vaultId, entityUri);
}
