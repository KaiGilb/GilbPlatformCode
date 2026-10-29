// The write limits for a NEW tag string. The record may tighten those limits, never loosen them.
//
// The checks of this file are a floor: no `@`, no white space, no invisible or control
// character, and one script, whatever the record says. The record's pattern and
// `maxCharacters` apply on top, and they may only tighten. Length is the record's
// `maxCharacters`, never above 64: the effective maximum is min(64, that number).
// This file does not copy the stored pattern, and it does not keep a second length from it.
// A stored tag is not checked:
// `assertTagString`, `formatFullTag` and `formatShortTag` stay as they are, so a stored
// `Ann Lee` still formats.
//
// The stored pattern is readable only as `^[<one character class>]{m,n}$` (`{1,n}` is that
// form), compiled with `u`. `maxCharacters` must be a whole number ≥ 1 and that upper bound.
// A single `{"@value": x}` (a `@type` may sit beside it; `@language` only beside a string) and a one-element array
// are that one value x; x must be a string (textPattern), a whole number (maxCharacters) or a
// boolean (singleScript), else the record is unreadable. `@type` must be one string. An array,
// a number, or an object there is unreadable, the same as the platform's reader. More than one textPattern, maxCharacters
// or singleScript is unreadable — never the first value. `a:ruleStatement` is optional; the
// sentence does not use it. Anything else is an unreadable record.
//
// The rule is reached by following `a:writeRule` from `a:tagString`. That is one term read,
// the same kind of read as the tag grammar, so the record is not fetched by the name
// `e/tag-string-write-limits`.
import { refsUnder, spellingOfTermDoc, VocabularyUnavailableError, type TermDoc, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { normalizeTag } from "./tag";

/** `a:tagString`, the attribute whose `a:writeRule` names the rule. */
const TAG_STRING_TERM = "a/tagString";
/** The link from that attribute to the rule, and the rule's own facts. Their spellings are read
 *  from these term documents, like every other predicate here. */
const RULE_TERMS = {
  writeRule: "a/writeRule",
  textPattern: "a/textPattern",
  maxCharacters: "a/maxCharacters",
  singleScript: "a/singleScript",
  statement: "a/ruleStatement",
} as const;

/** Why a new tag string is refused. The platform's `400` uses these names, in this order.
 *  `not-allowed` is a string only the stored pattern refuses. */
export type TagWriteRefusal =
  | "empty"
  | "at-sign"
  | "white-space"
  | "invisible-or-control"
  | "too-long"
  | "not-allowed"
  | "mixed-script";

export type TagWriteVerdict = { ok: true; tag: string } | { ok: false; reason: TagWriteRefusal };

/** The rule record, as read. `pattern` is `a:textPattern` compiled with the `u` flag. */
export interface TagWriteRule {
  /** The record's IRI, as served. */
  iri: string;
  pattern: RegExp;
  maxCharacters: number;
  singleScript: boolean;
  /** `a:ruleStatement` when the record has one, otherwise "". Optional: the sentence does not use it. */
  statement: string;
}

const REFUSALS: readonly TagWriteRefusal[] = [
  "empty",
  "at-sign",
  "white-space",
  "invisible-or-control",
  "too-long",
  "not-allowed",
  "mixed-script",
];

export function isTagWriteRefusal(value: unknown): value is TagWriteRefusal {
  return typeof value === "string" && (REFUSALS as readonly string[]).includes(value);
}

/** A new tag string the rule does not allow. `rule` is the rule record's IRI. Raised before a
 *  request when this package can see the rule, and when the platform answers
 *  `400 {"error":"tag-string-refused"}`.
 *  `maxCharacters` is the number a `too-long` sentence shows: the platform's 400 field when the
 *  body carried one, otherwise the effective maximum of the rule this client read (min of 64
 *  and the record's `maxCharacters`). */
export class TagStringRefusedError extends Error {
  readonly reason: TagWriteRefusal;
  /** The rule record's IRI. */
  readonly rule: string;
  /** The platform's `maxCharacters` when the 400 carried it; otherwise the rule this client read. */
  readonly maxCharacters?: number;
  constructor(reason: TagWriteRefusal, rule: string, maxCharacters?: number) {
    super(tagRefusalSentence(reason, maxCharacters));
    this.name = "TagStringRefusedError";
    this.reason = reason;
    this.rule = rule;
    this.maxCharacters = maxCharacters;
  }
}

/** One sentence for a person, for each reason.
 *  For `too-long`, pass the rule or a number. A rule shows min(64, its `maxCharacters`).
 *  A number is shown as given (the platform's 400 already applied the same ceiling).
 *  With neither, the sentence still says 64. */
export function tagRefusalSentence(reason: TagWriteRefusal, max?: number | TagWriteRule): string {
  switch (reason) {
    case "empty":
      return "A tag cannot be empty.";
    case "at-sign":
      return "A tag cannot contain @.";
    case "white-space":
      return "A tag cannot contain spaces.";
    case "invisible-or-control":
      return "The tag contains an invisible or control character.";
    case "too-long":
      return `A tag can be at most ${lengthCap(max)} characters.`;
    case "not-allowed":
      return "This tag is not allowed by the tag rule.";
    case "mixed-script":
      return "A tag must use one alphabet (do not mix, for example, Latin and Cyrillic letters).";
  }
}

/** The ceiling. A record may name a smaller maximum. It may not name a larger one. */
const KAI_TAG_MAX_CHARACTERS = 64;

/** The length a new tag may reach: 64, or the record's maximum when that is lower. */
export function effectiveTagMax(maxCharacters: number): number {
  return Math.min(KAI_TAG_MAX_CHARACTERS, maxCharacters);
}

/** The number in the `too-long` sentence. A bare number is the platform's, shown as given.
 *  A rule is capped at 64. No argument keeps 64. */
function lengthCap(max?: number | TagWriteRule): number {
  if (typeof max === "number") return max;
  if (max !== undefined) return effectiveTagMax(max.maxCharacters);
  return KAI_TAG_MAX_CHARACTERS;
}

// Script property (UAX #24), not Script_Extensions. These are the short names this engine
// accepts, minus Common (Zyyy), Inherited (Zinh), Unknown (Zzzz) and the aliases Qaai and Qaac
// (node 25.9, Unicode 17: 178 accepted, 173 kept). A name this engine rejects is skipped.
const SCRIPT_NAMES = (
  "Adlm Aghb Ahom Arab Armi Armn Avst Bali Bamu Bass Batk Beng Berf Bhks Bopo Brah Brai Bugi Buhd " +
  "Cakm Cans Cari Cham Cher Chrs Copt Cpmn Cprt Cyrl Deva Diak Dogr Dsrt Dupl Egyp Elba Elym Ethi " +
  "Gara Geor Glag Gong Gonm Goth Gran Grek Gujr Gukh Guru Hang Hani Hano Hatr Hebr Hira Hluw Hmng " +
  "Hmnp Hung Ital Java Kali Kana Kawi Khar Khmr Khoj Kits Knda Krai Kthi Lana Laoo Latn Lepc Limb " +
  "Lina Linb Lisu Lyci Lydi Mahj Maka Mand Mani Marc Medf Mend Merc Mero Miao Mlym Modi Mong Mroo " +
  "Mtei Mult Mymr Nagm Nand Narb Nbat Newa Nkoo Nshu Ogam Olck Onao Orkh Orya Osge Osma Ougr Palm " +
  "Pauc Perm Phag Phli Phlp Phnx Plrd Prti Rjng Rohg Runr Samr Sarb Saur Sgnw Shaw Shrd Sidd Sidt " +
  "Sind Sinh Sogd Sogo Sora Soyo Sund Sunu Sylo Syrc Tagb Takr Tale Talu Taml Tang Tavt Tayo Telu " +
  "Tfng Tglg Thaa Thai Tibt Tirh Tnsa Todr Tols Toto Tutg Ugar Vaii Vith Wara Wcho Xpeo Xsux Yezi " +
  "Yiii Zanb"
).split(" ");

const NEUTRAL = /^[\p{Script=Common}\p{Script=Inherited}]$/u;
// The floor. Not a copy of the stored pattern: that pattern is compiled from the record
// and can only refuse more. A string these two miss and the pattern still refuses is `not-allowed`.
const WHITE_SPACE = /\p{White_Space}/u;
const INVISIBLE = /[\p{C}\p{Default_Ignorable_Code_Point}]/u;

let scriptTable: [string, RegExp][] | undefined;

function scripts(): [string, RegExp][] {
  if (scriptTable) return scriptTable;
  const table: [string, RegExp][] = [];
  for (const name of SCRIPT_NAMES) {
    try {
      table.push([name, new RegExp(`^\\p{Script=${name}}$`, "u")]);
    } catch {
      // This engine does not know the name.
    }
  }
  scriptTable = table;
  return table;
}

function scriptOf(ch: string): string {
  for (const [name, re] of scripts()) if (re.test(ch)) return name;
  return "Zzzz";
}

// UTS #39 §5.1: these mixes count as one script. Japanese, Korean, and Chinese with Bopomofo.
const CJK: ReadonlySet<string>[] = [
  new Set(["Hani", "Hira", "Kana"]),
  new Set(["Hani", "Hang"]),
  new Set(["Hani", "Bopo"]),
];

function oneScript(tag: string): boolean {
  const set = new Set<string>();
  for (const ch of tag) if (!NEUTRAL.test(ch)) set.add(scriptOf(ch));
  if (set.size <= 1) return true;
  return CJK.some((group) => [...set].every((script) => group.has(script)));
}

/** More than one value under the key that is present. Not a stored pattern or number. */
const MANY: unique symbol = Symbol("many");

const XSD = "http://www.w3.org/2001/XMLSchema#";

/** What a rule attribute holds; the XSD type its literal may carry. */
type RuleValueKind = "string" | "integer" | "boolean";

/** Whether `type` names the XSD type `kind`, as `xsd:x` or the full IRI.
 *  Anything that is not one string is not that type. An array `@type` is how a stored
 *  fact can carry the type (a platform refusal). The platform refuses that at write, and its reader
 *  stays strict. This reader does too. */
function isXsdType(type: unknown, kind: RuleValueKind): boolean {
  if (typeof type !== "string") return false;
  return type === `xsd:${kind}` || type === `${XSD}${kind}`;
}

/** A single `{"@value": x}`. Beside `@value` only `@language` and `@type` may sit; any other keyword is unreadable (undefined).
 *  `@type` must be one string naming the XSD type of `kind`. A non-string `@type` (an array, a number, an object) is unreadable.
 *  A language tag belongs to a string, and not beside a type. An array value is not unwrapped here;
 *  {@link oneUnder} takes the one element of a one-element array first. As the platform's `readRuleFactValue`. */
function unwrap(value: unknown, kind: RuleValueKind): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "@value" in value) {
    if (!Object.keys(value).every((key) => key === "@value" || key === "@language" || key === "@type")) return undefined;
    const literal = value as { "@value": unknown; "@language"?: unknown; "@type"?: unknown };
    const hasLanguage = "@language" in literal;
    const hasType = "@type" in literal;
    // A language tag belongs to a string, and not beside a type. Otherwise the literal is malformed: unreadable.
    if (hasLanguage && (hasType || kind !== "string" || typeof literal["@value"] !== "string")) return undefined;
    if (hasType && !isXsdType(literal["@type"], kind)) return undefined;
    return literal["@value"];
  }
  return value;
}

/**
 * The first spelling present. A framed record serves the bare key; an unframed one serves `a:`.
 * One value, including a one-element array. Two or more is {@link MANY} — never the first.
 */
function oneUnder(doc: TermDoc, keys: readonly string[], kind: RuleValueKind): unknown {
  for (const key of keys) {
    const value = doc[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length !== 1) return MANY;
      return unwrap(value[0], kind);
    }
    return unwrap(value, kind);
  }
  return undefined;
}

function readKeys(doc: TermDoc, term: string): readonly string[] {
  return spellingOfTermDoc(doc, term).readKeys;
}

/**
 * Read the tag-string write rule. Follows `a:writeRule` from `a:tagString`, then reads that record.
 * @throws VocabularyUnavailableError when the link or the record cannot be read. A caller that is
 * about to write does not block on this: the platform is the gate. `readPickerVocabulary` is that caller.
 */
export async function readTagWriteRule(source: VocabularySource): Promise<TagWriteRule> {
  const iriOf = (path: string) => source.termIri(path);
  let tagStringDoc: TermDoc;
  let writeRuleDoc: TermDoc;
  let patternDoc: TermDoc;
  let maxDoc: TermDoc;
  let scriptDoc: TermDoc;
  let statementDoc: TermDoc;
  try {
    [tagStringDoc, writeRuleDoc, patternDoc, maxDoc, scriptDoc, statementDoc] = await Promise.all([
      source.term(iriOf(TAG_STRING_TERM)),
      source.term(iriOf(RULE_TERMS.writeRule)),
      source.term(iriOf(RULE_TERMS.textPattern)),
      source.term(iriOf(RULE_TERMS.maxCharacters)),
      source.term(iriOf(RULE_TERMS.singleScript)),
      source.term(iriOf(RULE_TERMS.statement)),
    ]);
  } catch (err) {
    if (err instanceof VocabularyUnavailableError) throw err;
    throw new VocabularyUnavailableError(`the tag write rule could not be read: ${String(err)}`);
  }

  const tagStringIri = typeof tagStringDoc["@id"] === "string" ? tagStringDoc["@id"] : iriOf(TAG_STRING_TERM);
  const links = refsUnder(tagStringDoc, readKeys(writeRuleDoc, iriOf(RULE_TERMS.writeRule)));
  if (links.length !== 1) {
    throw new VocabularyUnavailableError(`${tagStringIri} does not name exactly one a:writeRule (found ${links.length})`);
  }
  const ruleIri = links[0]!;
  const record = await source.term(ruleIri);
  return ruleFromRecord(
    record,
    {
      textPattern: readKeys(patternDoc, iriOf(RULE_TERMS.textPattern)),
      maxCharacters: readKeys(maxDoc, iriOf(RULE_TERMS.maxCharacters)),
      singleScript: readKeys(scriptDoc, iriOf(RULE_TERMS.singleScript)),
      statement: readKeys(statementDoc, iriOf(RULE_TERMS.statement)),
    },
    ruleIri,
  );
}

function ruleFromRecord(
  record: TermDoc,
  keys: { textPattern: readonly string[]; maxCharacters: readonly string[]; singleScript: readonly string[]; statement: readonly string[] },
  fallbackIri: string,
): TagWriteRule {
  const iri = typeof record["@id"] === "string" ? record["@id"] : fallbackIri;
  const patternText = oneUnder(record, keys.textPattern, "string");
  if (patternText === MANY) throw new VocabularyUnavailableError(`${iri} states more than one textPattern`);
  if (typeof patternText !== "string" || patternText === "") {
    throw new VocabularyUnavailableError(`${iri} states no textPattern`);
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(patternText, "u");
  } catch (cause) {
    throw new VocabularyUnavailableError(`${iri} has an unusable textPattern: ${String(cause)}`);
  }
  const maxCharacters = oneUnder(record, keys.maxCharacters, "integer");
  if (maxCharacters === MANY) throw new VocabularyUnavailableError(`${iri} states more than one maxCharacters`);
  // 0 is a whole number, but a rule that allows no tag at all is not lawful.
  if (typeof maxCharacters !== "number" || !Number.isInteger(maxCharacters) || maxCharacters < 1) {
    throw new VocabularyUnavailableError(`${iri} states no whole-number maxCharacters`);
  }
  const upper = patternUpperBound(patternText);
  if (upper === null) {
    throw new VocabularyUnavailableError(`${iri} textPattern is not ^[one character class]{m,n}$`);
  }
  if (upper !== maxCharacters) {
    throw new VocabularyUnavailableError(
      `${iri} is inconsistent: textPattern upper bound ${upper} and maxCharacters ${maxCharacters} differ`,
    );
  }
  const singleScript = oneUnder(record, keys.singleScript, "boolean");
  if (singleScript === MANY) throw new VocabularyUnavailableError(`${iri} states more than one singleScript`);
  if (typeof singleScript !== "boolean") throw new VocabularyUnavailableError(`${iri} states no singleScript boolean`);
  // Optional. Missing, empty, or many values: the sentence does not read this.
  const stated = oneUnder(record, keys.statement, "string");
  const statement = typeof stated === "string" ? stated : "";
  return { iri, pattern, maxCharacters, singleScript, statement };
}

/**
 * Upper bound of a pattern that is exactly `^`, one character class, `{m,n}`, `$`.
 * `{1,n}` is that form with the lower bound written as 1. A dot, a literal, an escape,
 * a lookahead, `{n}`, `{n,}` or `+` is not that form, so the record is unreadable.
 * `\p{…}` inside the class is one member, not a quantifier.
 */
function patternUpperBound(source: string): number | null {
  if (source.length < 2 || !source.startsWith("^") || !source.endsWith("$")) return null;
  const last = source.length - 1;
  if (source[1] !== "[") return null;
  const classEnd = skipCharClass(source, 1, last);
  if (classEnd === null || classEnd >= last) return null;
  const bound = /^\{(\d+),(\d+)\}$/.exec(source.slice(classEnd, last));
  if (!bound) return null;
  const lower = Number(bound[1]);
  const upper = Number(bound[2]);
  if (!Number.isInteger(lower) || !Number.isInteger(upper) || lower > upper) return null;
  return upper;
}

function skipEscape(source: string, i: number, last: number): number | null {
  if (i + 1 >= last) return null;
  const kind = source[i + 1];
  if ((kind === "p" || kind === "P") && source[i + 2] === "{") {
    const close = source.indexOf("}", i + 3);
    if (close < 0 || close >= last) return null;
    return close + 1;
  }
  return i + 2;
}

/** `i` points at `[`. A `]` that is the class's first member is literal. */
function skipCharClass(source: string, i: number, last: number): number | null {
  if (source[i] !== "[") return null;
  i += 1;
  if (i < last && source[i] === "^") i += 1;
  let sawMember = false;
  while (i < last) {
    if (source[i] === "\\") {
      const next = skipEscape(source, i, last);
      if (next === null) return null;
      i = next;
      sawMember = true;
      continue;
    }
    if (source[i] === "]" && sawMember) return i + 1;
    i += 1;
    sawMember = true;
  }
  return null;
}

/**
 * Whether `raw` may be written as a new tag string. Normalises first (NFC, then trim — the same
 * `normalizeTag` a stored tag goes through). The floor is tried first, then the effective
 * maximum (min(64, `maxCharacters`)), then the stored pattern, then one script. One script is
 * refused whichever boolean the record stored: `singleScript: false` does not allow a mix.
 */
export function checkNewTagString(raw: string, rule: TagWriteRule): TagWriteVerdict {
  const tag = normalizeTag(raw);
  const length = [...tag].length;
  if (length === 0) return { ok: false, reason: "empty" };
  if (tag.includes("@")) return { ok: false, reason: "at-sign" };
  if (WHITE_SPACE.test(tag)) return { ok: false, reason: "white-space" };
  if (INVISIBLE.test(tag)) return { ok: false, reason: "invisible-or-control" };
  if (length > effectiveTagMax(rule.maxCharacters)) return { ok: false, reason: "too-long" };
  if (!rule.pattern.test(tag)) {
    return { ok: false, reason: "not-allowed" };
  }
  // One script is a floor. `singleScript: false` does not allow a mix.
  if (!oneScript(tag)) return { ok: false, reason: "mixed-script" };
  return { ok: true, tag };
}
