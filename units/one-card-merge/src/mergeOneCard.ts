/**
 * The one card of a person: their online card (theirs, the master) and the holder's own record and held claims (yours) merged
 * into ordered groups of rows, plus the header's name and photo.
 *
 * Pure: no fetch, no write, no React, no app import. The inputs are what the package and the apps already read: the online card
 * from `parseOnlineCard`, the record's facts as the record read serves them, the holder's `t:HeldPartyFieldClaim`s as the app
 * reads them, and the kind's field set from `resolveFieldSets`.
 */
// THE RULES:
//   - Only on their card: one row, theirs, with the rung it travelled with and the rung's chip words, read-only.
//   - Only on yours: one row, yours, editable.
//   - Both, different: both rows in the group, theirs first. On a one-value field the group says both are kept
//     (the holder wants both kept when there are two).
//   - Both, equal after normalising: ONE row, theirs, marked `sameAsTheirs` ("You have the same on your card").
//   - Several values: matched value by value, never by position.
//   - Empty, or hidden from the holder (the server did not return it): not drawn, never hinted, never compared.
//   - Name: theirs only when their card shares a complete name (a name field, or given AND family name), else the record's
//     `a:name`, else whatever name parts they share. Photo: theirs when shared, else the record's.
//   - Marks only when there are two sources: `marks` is true only when an online card is linked.
//
// ⛔ Theirs comes ONLY from the online card passed in (the live read). A held claim is always yours, whatever it says about who
//    stated it.
import { bareForm } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { StakeholderField } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { cardName, rungChipWords, type OnlineCard } from "@kaigilb/gilbplatformcode-online-card";

/** The parts of a field-set field the merge reads (`StakeholderField` fits). */
export type OneCardField = Pick<StakeholderField, "term" | "label" | "readKeys" | "writeKey" | "many">;

/** One held claim of the holder about this person (`t:HeldPartyFieldClaim`): the claim's one field and its value. */
export interface OwnHeldClaim {
  /** The claim's field predicate as the app resolved it from the master (`a:skill`, `a:topicInterest` ...). */
  predicate: string;
  /** The value: a reference's IRI, or a literal. */
  value: string;
  /** The claim's free-text qualifier, if any. */
  note?: string;
  /** The claim's entity, so the app can edit or remove it. */
  entity?: string;
  /** Optional: the purpose slot the value was stated under and its kind, read as their slots are (`slotLabel`). Without it the row of
   *  yours has no label. (Additive.) */
  slot?: string;
  kind?: string;
}

/**
 * One address of the holder about this person: a held `t:PlaceClaim`, its parts as the app reads them
 * (the typed lines and the names of the catalogue places it binds). Every part is optional; an empty part is left out.
 */
export interface OwnAddress {
  street?: string | null;
  line1?: string | null;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  /** The claim's entity, so the app can reach it (it stands for the row in `claims`). */
  entity?: string;
  /** Optional: the purpose slot and kind, as on `OwnHeldClaim`. */
  slot?: string;
  kind?: string;
}

/** The holder's own side of the card. Every part is optional: a person with no record has none. */
export interface OwnCard {
  /** The record's own name (`readPartyName`), or null. */
  name?: string | null;
  /** The record's photo, or null. */
  photo?: string | null;
  /** The record's facts as the record read serves them (bare or `a:` keys). Only keys a field of the set reads are rows. */
  facts?: Record<string, unknown>;
  heldClaims?: readonly OwnHeldClaim[];
  /** The holder's held addresses of this person. Read only when the input names `addressPredicate`. */
  addresses?: readonly OwnAddress[];
}

export interface MergeOneCardInput {
  /** Their online card as `parseOnlineCard` made it, or null when no online card is linked. */
  online: OnlineCard | null;
  own: OwnCard;
  /** The kind's field set in the order the card shows its groups. */
  fieldOrder: readonly OneCardField[];
  /** Words for a rung. Default: `rungChipWords`. */
  rungWords?: (rung: string) => string;
  /** The predicate their card's skills are matched under (the held skill claim's field, as the app resolved it). Without it, their
   *  skills are shown under the card route's own key `skills`, matched with nothing. */
  skillPredicate?: string | null;
  /** The field the holder's held addresses (`own.addresses`) belong to (the address field's write spelling, `a:postalAddress`).
   *  Without it, `own.addresses` is not read (additive: an app that does not name it gets the merge it had). */
  addressPredicate?: string | null;
}

export type RowSource = "theirs" | "yours";

export interface OneCardRow {
  /** The predicate the row's field is identified by (the field's write spelling; for an unknown field, the predicate as served). */
  field: string;
  value: string;
  source: RowSource;
  /** Theirs only: the rung the value travelled with, exactly as served. */
  rung?: string;
  /** Theirs only: the words for that rung. */
  rungWords?: string;
  /** The purpose of the row's value as its source stated it ("Work", "Mobile"), from the slot (`slotLabel`): every label of the
   *  values folded into the row, joined by " · " ("Work · Private"). Theirs: from the slots the server recovered
   *  (it shows on every row of theirs); a "same" row shows THEIR labels only. Yours: from the held values' optional
   *  `slot`. Absent when no folded value states a known purpose. */
  label?: string;
  /** The same labels one by one, in the order first met (the order served, then the order the held values came in), each once.
   *  Set only when there is at least one. (A folded value never loses its label.) */
  labels?: string[];
  /** Theirs only: the holder holds an equal value. Set only when true. */
  sameAsTheirs?: true;
  /** May the holder change this row here: yours yes, theirs never. Which editor is the app's (its field mode). */
  editable: boolean;
  /** Every note of the row's own source, in the order met: their skill's notes on a theirs row, the holder's held-claim notes on a
   *  yours row. Equal values folded into one row keep all their notes. */
  notes?: string[];
  /** On a theirs row marked `sameAsTheirs`: every note the holder has on his equal value, so none is lost. */
  ownNotes?: string[];
  /** On a theirs row marked `sameAsTheirs`: the labels of the holder's equal value(s), so none is lost. Not drawn as the row's label. */
  ownLabels?: string[];
  /** Every held claim this row stands for (a yours row, or a theirs row the holder's equal claim was folded into), so the app can
   *  reach each of them to edit or remove it. Absent when no held claim is behind the row. */
  claims?: string[];
}

export interface OneCardGroup {
  /** The predicate the group is identified by: the same as each of its rows' `field`. */
  field: string;
  /** The field-set field's term, or null for a predicate the field set does not know. */
  term: string | null;
  /** The field's own label, or null (an unknown field, or a term with no label): ⛔ never a guessed name. */
  label: string | null;
  /** False for a predicate the field set does not know: shown, because the read returned it, after the known groups. */
  known: boolean;
  /** The field may hold several values. An unknown field counts as several: its cardinality is not known. */
  many: boolean;
  /** A one-value field holds a value of theirs AND a different value of yours: both rows are kept. */
  bothKept: boolean;
  /** Theirs first (in the card's order), then yours. */
  rows: OneCardRow[];
}

export type IdentitySource = RowSource | "none";

export interface OneCardHeader {
  name: string | null;
  nameSource: IdentitySource;
  photo: string | null;
  photoSource: IdentitySource;
  /** An online card is linked: the live-link badge shows. */
  linked: boolean;
}

export interface OneCard {
  header: OneCardHeader;
  /** Only groups with at least one row. */
  groups: OneCardGroup[];
  /** Draw the Theirs / Yours marks: only when there are two sources (an online card is linked). */
  marks: boolean;
}

// --- Equality per field kind ---

export type CompareRule = "email" | "phone" | "address" | "text";

// The card route's own wire keys for an email and a phone (the same keys `contactPointsOf` reads). ⛔ Not a field list: any other
// field is compared as text.
const EMAIL_KEY = "email";
const PHONE_KEY = "phone";
// The card route's own wire key for an address (GilbPlatform profile-field-claim `address: "a:postalAddress"`).
const ADDRESS_KEY = "postalAddress";

/**
 * How two values of a field are compared, from the field's spellings.
 *
 * @param spellings the field's predicate spellings (its `readKeys`, or one served predicate)
 * @returns "email" (trimmed, case-insensitive), "phone" (digits only) or "text" (exact after trim)
 */
export function compareRuleOf(spellings: readonly string[]): CompareRule {
  const bare = spellings.map(bareForm);
  if (bare.includes(EMAIL_KEY)) return "email";
  if (bare.includes(PHONE_KEY)) return "phone";
  if (bare.includes(ADDRESS_KEY)) return "address";
  return "text";
}

/**
 * A value in the form it is compared in. Email: trimmed and lower-cased. Phone: its international or national key (`phoneKey`), or "" when no digit is left.
 * Anything else: trimmed, otherwise exact (case counts). Every rule first puts the text in Unicode NFC.
 */
export function normalizeForCompare(rule: CompareRule, value: string): string {
  // NFC first, as the platform normalises a stored string: the same letters in two Unicode forms are the same value.
  const t = value.normalize("NFC").trim();
  if (rule === "email") return t.toLowerCase();
  if (rule === "phone") return phoneKey(t);
  // An address as one string: trimmed, NFC, whitespace collapsed, case-insensitive. A comma (or a
  // semicolon) only separates parts, so "Storgata 1, 0155 Oslo" and "Storgata 1 0155 Oslo" are one address. ADJACENT duplicate parts
  // collapse after normalising ("Oslo, Oslo": a city that cascaded a region of the same name); a region that differs stays.
  if (rule === "address") {
    const parts = t.toLowerCase().split(/[,;]/).map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x !== "");
    return parts.filter((x, i) => i === 0 || x !== parts[i - 1]).join(" ");
  }
  return t;
}

/** The parts of an address in the order a line reads them. */
const ADDRESS_PARTS = ["street", "line1", "line2", "postalCode", "city", "region", "country"] as const;

/**
 * An address as one line: its non-empty parts in the address order (street, the two lines, postal code, city, region, country),
 * joined by ", ". The row of yours shows it, and an address compared with one string is compared as this line.
 */
export function addressLine(a: OwnAddress): string {
  return ADDRESS_PARTS.map((k) => (typeof a[k] === "string" ? a[k]!.normalize("NFC").trim() : "")).filter((v) => v !== "").join(", ");
}

/**
 * Are two addresses the same? Two structured addresses: part by part, each after trim and NFC,
 * case-insensitive, an empty part equal to an absent one. An address handed as one string: both as one line, normalised
 * (`normalizeForCompare("address")`). An address with nothing in it is never the same as anything.
 */
export function sameAddress(a: OwnAddress | string, b: OwnAddress | string): boolean {
  if (typeof a !== "string" && typeof b !== "string") {
    if (addressLine(a) === "" || addressLine(b) === "") return false;
    const part = (x: OwnAddress, k: (typeof ADDRESS_PARTS)[number]) => (typeof x[k] === "string" ? x[k]!.normalize("NFC").trim().toLowerCase() : "");
    return ADDRESS_PARTS.every((k) => part(a, k) === part(b, k));
  }
  const x = normalizeForCompare("address", typeof a === "string" ? a : addressLine(a));
  const y = normalizeForCompare("address", typeof b === "string" ? b : addressLine(b));
  return x !== "" && x === y;
}

/**
 * Every Unicode decimal digit (\p{Nd}: Arabic-Indic, Persian, Devanagari ...) as its ASCII digit. Unicode keeps each script's
 * decimal digits in runs of ten code points from 0 to 9, and two scripts' runs can touch (Myanmar Pa-O U+116D0 is followed at once
 * by Eastern Pwo Karen U+116DA). So a digit's value is its offset from the first code point of the unbroken block of decimal digits
 * it sits in, modulo 10 (a walk capped at 9 steps would read every Karen digit as 9).
 */
function asciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!;
    let start = cp;
    while (start > 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start -= 1;
    return String((cp - start) % 10);
  });
}

/**
 * A phone's compare key:
 *   1. an optional `tel:` prefix (any case) is dropped;
 *   2. NFKC, then every Unicode decimal digit as ASCII, so full-width, Arabic-Indic or Persian digits keep their row;
 *   3. a bracketed "(0)" trunk marker right after an international country code is dropped ("+47(0)900" reads "+47900"); no
 *      other 0 is ever dropped;
 *   4. every character that is not a digit or "+" is removed, so "(+47) 900" reads "+47900";
 *   5. a leading "+", "00+", or "00" and then a country digit (1-9), gives an INTERNATIONAL key: "+" and the digits after that
 *      prefix. Anything else gives a NATIONAL key, marked "national:", because its country cannot be guessed. The two never match;
 *      a lone "00" and "000" are national;
 *   6. a value with no digit left (just "tel:", or "n/a") has the empty key: it is no value and draws no row.
 */
function phoneKey(text: string): string {
  const read = asciiDigits(text.replace(/^\s*tel:/i, "").normalize("NFKC"));
  const trunk = read.replace(/^([^0-9+]*(?:\+|00\+?)\s*[1-9][0-9]{0,2})\s*\(0\)/, "$1 ");
  const kept = trunk.replace(/[^0-9+]/g, "");
  const digits = (s: string) => s.replace(/\D/g, "");
  if (!digits(kept)) return "";
  if (kept.startsWith("+") || kept.startsWith("00+")) return `+${digits(kept.startsWith("+") ? kept : kept.slice(2))}`;
  if (/^00[1-9]/.test(kept)) return `+${digits(kept.slice(2))}`;
  return `national:${digits(kept)}`;
}

// --- The purpose of their value ---

/** One app's own email slots and the purpose its editor prints on them. */
const MYNET_SLOT_PURPOSE: Readonly<Record<string, string>> = { email: "Work", hasEmail: "Work", emailPrivate: "Private", hasEmailPrivate: "Private" };

/**
 * The purposes a `<kind>-<purpose>` slot may name, and the word each is shown as (only a known purpose becomes a
 * label). Where each comes from:
 *   - work, private: the purpose words of that app's editor ("Work" / "Private");
 *   - personal, home: that app reads "private", "personal" and "home" as the personal purpose;
 *     home is also vCard's HOME;
 *   - mobile: the purpose the one-card design shows on a phone, with home and work.
 * ⛔ Not a guess list: a purpose not here gives no label. The ontology master's field sets name no purposes.
 */
export const SLOT_PURPOSES: Readonly<Record<string, string>> = Object.freeze({
  work: "Work",
  private: "Private",
  personal: "Personal",
  home: "Home",
  mobile: "Mobile",
});

/**
 * The purpose a value's slot states, in words for the row: one app's own email slots as that app reads them, else a slot of the form
 * `<kind>-<purpose>`, where `<kind>` is the value's own kind as served ("email-work", "phone-mobile", "address-home") and `<purpose>`
 * is a known purpose (`SLOT_PURPOSES`), as that purpose's word ("Work", "Mobile", "Home"). ⛔ Never guessed: no slot, the name
 * postings' `default`, a slot that is the kind itself ("job-title" of kind "job-title"), a value with no kind, or a purpose that is
 * not known ("email-long", "social-li") gives no label.
 *
 * @param slot the slot the card route recovered for the value (`OnlineCardField.slot`)
 * @param kind the value's kind as served (`OnlineCardField.kind`)
 * @returns the label, or null when the slot states no purpose
 */
export function slotLabel(slot: string | null | undefined, kind?: string | null): string | null {
  if (typeof slot !== "string") return null;
  const key = slot.trim();
  if (Object.hasOwn(MYNET_SLOT_PURPOSE, key)) return MYNET_SLOT_PURPOSE[key]!;
  if (typeof kind !== "string" || kind === "" || !key.startsWith(`${kind}-`)) return null;
  const purpose = key.slice(kind.length + 1);
  return Object.hasOwn(SLOT_PURPOSES, purpose) ? SLOT_PURPOSES[purpose]! : null;
}

/** The word between two labels of one row ("Work · Private"). */
const LABEL_JOIN = " · ";

// --- The merge ---

// The card route's own wire keys for a person's name (as `cardName` reads them): a whole name, and its two parts.
const NAME_KEY = "name";
const GIVEN_NAME_KEY = "givenName";
const FAMILY_NAME_KEY = "familyName";

/** The card route's own key for a person's skills (`body.skills`), used when the caller names no skill predicate. */
const SKILLS_WIRE_KEY = "skills";

// Labels are Sets: a Set keeps the order labels were first added in, so the union is stable and each label is kept once.
interface Theirs {
  value: string;
  rung: string;
  labels: Set<string>;
  notes: Set<string>;
}
interface Yours {
  value: string;
  labels: Set<string>;
  notes: Set<string>;
  claims: Set<string>;
}
interface Bucket {
  field: string;
  term: string | null;
  label: string | null;
  known: boolean;
  many: boolean;
  rule: CompareRule;
  theirs: Theirs[];
  /** Their values by rung and normalised value: twins equal under the field's rule are one row. */
  theirsByKey: Map<string, Theirs>;
  /** Your values by normalised value, folded as they arrive: equal values are one entry. */
  yours: Map<string, Yours>;
}

/** A literal as text: a string as is, a finite number or a boolean as its text; anything else is no value. */
function literal(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return String(v);
  return null;
}

/** A fact's values as display strings: a string as is, a reference by its IRI, another literal as its text. Blank ones dropped. */
function factValues(v: unknown): string[] {
  const out: string[] = [];
  for (const one of Array.isArray(v) ? v : [v]) {
    let s: string | null = null;
    if (typeof one === "string") s = one;
    else if (one && typeof one === "object") {
      const o = one as Record<string, unknown>;
      s = typeof o["@id"] === "string" ? o["@id"] : literal(o["@value"]);
    } else s = literal(one);
    if (s !== null && s.trim() !== "") out.push(s);
  }
  return out;
}

/**
 * Merge a person's online card and the holder's own side into the one card.
 *
 * @param input the online card (or null), the holder's own side, the kind's field set in display order, and optionally the rung
 *   words and the skill predicate
 * @returns the header identity, the groups of rows in field-set order (unknown predicates after them), and whether to draw marks
 */
export function mergeOneCard(input: MergeOneCardInput): OneCard {
  const { online, own, fieldOrder } = input;
  const words = input.rungWords ?? rungChipWords;

  // Every lookup below is a Map, so the merge is about linear in the number of fields and values (4,000 values under 200 ms).

  // --- One bucket per field of the set, in the set's order ---
  const known: Bucket[] = [];
  const ids = new Set<string>();
  const newBucket = (field: string, f: OneCardField | null, rule: CompareRule): Bucket => ({
    field,
    term: f ? f.term : null,
    label: f ? f.label : null,
    known: f !== null,
    // An unknown field counts as several values: its cardinality is not known, so no "both kept" is claimed for it.
    many: f ? f.many : true,
    rule,
    theirs: [],
    theirsByKey: new Map(),
    yours: new Map(),
  });
  // Field identity is the predicate, never the label. Two spellings are one predicate when their `bareForm` is equal (`a:email` and
  // the framed `email`): the package's one read-side equivalence. A served predicate, a fact key and a held claim's predicate all
  // belong to the FIRST field that reads them under this equivalence, so one value can never land in two groups.
  const byBare = new Map<string, Bucket>();
  for (const f of fieldOrder) {
    const writes = f.writeKey ?? f.readKeys.find((k) => k.startsWith("a:")) ?? f.readKeys[0] ?? f.term;
    // Two fields that write one predicate (a master defect) still get two ids: the second is identified by its term.
    const b = newBucket(ids.has(writes) ? f.term : writes, f, compareRuleOf(f.readKeys));
    ids.add(b.field);
    known.push(b);
    for (const k of f.readKeys) if (!byBare.has(bareForm(k))) byBare.set(bareForm(k), b);
  }
  const fieldOf = (predicate: string): Bucket | undefined => byBare.get(bareForm(predicate));
  // A predicate the set does not know is still shown (the field set decides what a card OFFERS, never what exists), in a group of
  // its own after the known ones, in the order it was first met.
  const unknown = new Map<string, Bucket>();
  const bucketFor = (predicate: string): Bucket => {
    const k = fieldOf(predicate);
    if (k) return k;
    const key = bareForm(predicate);
    let b = unknown.get(key);
    if (!b) {
      b = newBucket(predicate, null, compareRuleOf([predicate]));
      unknown.set(key, b);
    }
    return b;
  };

  // --- Theirs: only what the live read returned, blank values not drawn ---
  // Their twins at one rung (two spellings of the field, a repeated skill, or values equal under the field's compare rule: NFC,
  // email case, phone form) are one row, the first as served, keeping every note. Keyed by the field it resolves to.
  const addTheirs = (predicate: string, value: string, rung: string, note?: string, slot?: string, kind?: string) => {
    if (!predicate || value.trim() === "") return;
    const b = bucketFor(predicate);
    const norm = normalizeForCompare(b.rule, value);
    // A value whose compare key is empty (a phone with no digit, such as "tel:" alone) is no value: never drawn, never compared.
    if (norm === "") return;
    const key = JSON.stringify([rung, norm]);
    let t = b.theirsByKey.get(key);
    if (!t) {
      t = { value, rung, labels: new Set(), notes: new Set() };
      b.theirsByKey.set(key, t);
      b.theirs.push(t);
    }
    // A twin folded into this row adds its label; the first twin's label (or none) never hides a later one.
    const label = slotLabel(slot, kind);
    if (label) t.labels.add(label);
    if (note) t.notes.add(note);
  };
  if (online) {
    for (const f of online.fields) addTheirs(f.predicate, f.value, f.rung, undefined, f.slot, f.kind);
    for (const s of online.skills) addTheirs(input.skillPredicate || SKILLS_WIRE_KEY, s.skillUri, s.rung, s.note);
  }

  // --- Yours: the record's facts that a field of the set reads, then the held claims ---
  // A fact key resolves to its field exactly as a served predicate does (`fieldOf`). A fact no field reads is not a card row: the
  // record's other facts (its type, its link ...) are not fields. One value of yours under two spellings, or twice, is one value;
  // every note and every held-claim entity is folded into it, never lost.
  const addYours = (b: Bucket, value: string, note?: string, claim?: string, label?: string | null) => {
    const key = normalizeForCompare(b.rule, value);
    if (key === "") return;
    let y = b.yours.get(key);
    if (!y) {
      y = { value, labels: new Set(), notes: new Set(), claims: new Set() };
      b.yours.set(key, y);
    }
    if (label) y.labels.add(label);
    if (note) y.notes.add(note);
    if (claim) y.claims.add(claim);
  };
  const facts = own.facts ?? {};
  for (const key of Object.keys(facts)) {
    const b = fieldOf(key);
    if (b) for (const value of factValues(facts[key])) addYours(b, value);
  }
  // The holder's held addresses, each as its line, in the field the caller names (compared there as addresses).
  if (input.addressPredicate) {
    const b = bucketFor(input.addressPredicate);
    for (const a of own.addresses ?? []) {
      const line = addressLine(a);
      if (line !== "") addYours(b, line, undefined, a.entity, slotLabel(a.slot, a.kind));
    }
  }
  for (const c of own.heldClaims ?? []) {
    if (!c.predicate || typeof c.value !== "string" || c.value.trim() === "") continue;
    addYours(bucketFor(c.predicate), c.value, c.note, c.entity, slotLabel(c.slot, c.kind));
  }

  // --- Rows: match value by value, never by position ---
  const groups: OneCardGroup[] = [];
  for (const b of [...known, ...unknown.values()]) {
    const matched = new Set<Yours>();
    const rows: OneCardRow[] = b.theirs.map((t) => {
      const row: OneCardRow = { field: b.field, value: t.value, source: "theirs", rung: t.rung, rungWords: words(t.rung), editable: false };
      if (t.labels.size) {
        row.labels = [...t.labels];
        row.label = row.labels.join(LABEL_JOIN);
      }
      if (t.notes.size) row.notes = [...t.notes];
      // An equal value of yours is shown once, as theirs. Their same value served at two rungs is marked once (the first).
      const y = b.yours.get(normalizeForCompare(b.rule, t.value));
      if (y && !matched.has(y)) {
        matched.add(y);
        row.sameAsTheirs = true;
        // The holder's own notes and claims on his equal value stay reachable on the one row.
        if (y.notes.size) row.ownNotes = [...y.notes];
        if (y.labels.size) row.ownLabels = [...y.labels];
        if (y.claims.size) row.claims = [...y.claims];
      }
      return row;
    });
    for (const y of b.yours.values()) {
      if (matched.has(y)) continue;
      const row: OneCardRow = { field: b.field, value: y.value, source: "yours", editable: true };
      if (y.labels.size) {
        row.labels = [...y.labels];
        row.label = row.labels.join(LABEL_JOIN);
      }
      if (y.notes.size) row.notes = [...y.notes];
      if (y.claims.size) row.claims = [...y.claims];
      rows.push(row);
    }
    if (rows.length === 0) continue;
    const bothKept = !b.many && b.theirs.length > 0 && rows.length > b.theirs.length;
    groups.push({ field: b.field, term: b.term, label: b.label, known: b.known, many: b.many, bothKept, rows });
  }

  // --- Header: theirs if shared, else the record's ---
  // Their name is used only when their card shares a COMPLETE name: a name field, or both a given
  // and a family name. Otherwise the record's own name; and only when the record has none, whatever name parts they share.
  const ownName = typeof own.name === "string" && own.name.trim() !== "" ? own.name.trim() : null;
  const served = (bare: string) => online?.fields.find((f) => bareForm(f.predicate) === bare && f.value.trim() !== "")?.value.trim() ?? null;
  const given = served(GIVEN_NAME_KEY);
  const family = served(FAMILY_NAME_KEY);
  const complete = served(NAME_KEY) ?? (given && family ? `${given} ${family}` : null);
  const theirName = complete ?? (ownName ? null : online ? cardName(online) : null);
  const theirPhoto = online && typeof online.photoUrl === "string" && online.photoUrl.trim() !== "" ? online.photoUrl : null;
  const ownPhoto = typeof own.photo === "string" && own.photo.trim() !== "" ? own.photo : null;
  const header: OneCardHeader = {
    name: theirName ?? ownName,
    nameSource: theirName ? "theirs" : ownName ? "yours" : "none",
    photo: theirPhoto ?? ownPhoto,
    photoSource: theirPhoto ? "theirs" : ownPhoto ? "yours" : "none",
    linked: online !== null,
  };

  return { header, groups, marks: online !== null };
}
