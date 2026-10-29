// The full tag: parse and format, from the TagStandard record read live.
//
// The selected form is `@<tag>@<vault name>`, and only as long as the vault needs to keep it unique: `@ann@home`
// inside one's own vault may be written `@ann`.
//
// The grammar is NOT in this file. It is the `t:TagStandard` record on the master (`e/tag-standard-full-tag-at-vault`):
// a separator and an ordered list of segments, each with a pattern. This module reads that record and walks it. If the
// record changes (another separator, another pattern), parsing and formatting follow with no release.
//
// ONE PARSER FOR THE RECORD. The platform reads this record shape in its own tag decoder (`tokenise` +
// `decodeDeterministic`). This package may not import it (no runtime dependency beyond the platform client), so the SAME
// WALK is written here, and sameness is guarded as BEHAVIOUR, not as a shared file: a parity script runs the platform's
// own `decodeDeterministic` and this module over one input set and fails on any disagreement. The walk, step for step:
//
//   tokens = text.split(separator)                 — every separator, from the left
//   tokens.length > segments.length  → refused     — a surplus token is never dropped
//   for each segment, token = tokens[position]:
//     empty and the segment is optional → skipped
//     empty                             → refused
//     a pattern that does not match the WHOLE token → refused
//
// What this module adds on top of that walk, and only this:
//   • the tag is normalised the way the platform normalises a tag string before it stores or
//     looks one up (NFC, then trim; the platform's `normalizeTagString`), and a tag that is empty
//     after that is refused, because no such tag string can exist in a vault;
//   • the short form (`@ann`), which is the same grammar without its vault-name segment.
//
// ⛔ It never runs the decoder's reifying path (`decodeAndEmit` / `emitDecoded`). Nothing here
//    writes. The full form is worked out when it is needed and is never stored
//    (the stored fact is `a:tagString`, which holds no `@`).
import { spellingOfTermDoc, valuesUnder, VocabularyUnavailableError, type TermDoc, type VocabularySource } from "@kaigilb/gilbplatformcode-vocabulary-source";

/** The TagStandard record's address on the master, as a path under `/base/`. */
export const TAG_STANDARD_TERM = "e/tag-standard-full-tag-at-vault";

/** The two facts a TagStandard record states its grammar with: their addresses on the master.
 *  Their spellings are read from these term documents, like every other predicate here. */
export const TAG_GRAMMAR_TERMS = { segments: "a/segments", separator: "a/separator" } as const;

/** The labels the record gives the two segments this module has to tell apart. They are the
 *  record's own published labels (read live 2026-09-30T07:20Z), the one place a caller can
 *  learn which token is the tag and which is the vault name. A record without them is refused. */
export const TAG_SEGMENT_LABEL = "tag";
export const VAULT_NAME_SEGMENT_LABEL = "vault-name";

export interface TagSegment {
  position: number;
  label: string;
  /** The segment's pattern source, matched against the whole token. `null` when it has none. */
  pattern: string | null;
  optional: boolean;
}

export interface TagGrammar {
  /** The record's IRI, as served. */
  standard: string;
  separator: string;
  /** Sorted by position. */
  segments: TagSegment[];
  tag: TagSegment;
  vaultName: TagSegment;
}

/** The record cannot be used as a tag grammar. ⛔ Never answered with a built-in default. */
export class TagGrammarUnreadableError extends VocabularyUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = "TagGrammarUnreadableError";
  }
}

/** A tag string or a vault name the grammar does not allow. Raised on the WRITE and FORMAT side. */
export class TagRefusedError extends Error {
  readonly reason: TagRefusal;
  constructor(reason: TagRefusal, message: string) {
    super(message);
    this.name = "TagRefusedError";
    this.reason = reason;
  }
}

export type TagRefusal =
  | "empty"
  | "surplus-token"
  | "missing-token"
  | "pattern"
  | "short-form-outside-own-vault"
  | "not-text";

/** The platform's write-time normalisation of a tag string: NFC, then trim. Nothing else: no
 *  case fold, no separator equivalence (GilbPlatform `src/tag-handle-vocab.ts`). Parity with it
 *  is checked by a parity script that is not in this unit. */
export function normalizeTag(raw: string): string {
  return raw.normalize("NFC").trim();
}

function fullMatch(pattern: string, token: string): boolean {
  return new RegExp(`^(?:${pattern})$`).test(token);
}

function asSegment(raw: unknown, where: string): TagSegment {
  if (!raw || typeof raw !== "object") throw new TagGrammarUnreadableError(`${where}: a segment is not an object`);
  const r = raw as Record<string, unknown>;
  if (typeof r.position !== "number" || !Number.isInteger(r.position) || r.position < 0)
    throw new TagGrammarUnreadableError(`${where}: a segment has no whole-number position`);
  if (typeof r.label !== "string" || !r.label)
    throw new TagGrammarUnreadableError(`${where}: segment ${r.position} has no label`);
  if (r.codeTable !== undefined && r.codeTable !== null && r.codeTable !== "")
    // A code-table segment decodes through the record's tables. This module does not read them,
    // and answering as if the table were absent would accept tokens the platform refuses.
    throw new TagGrammarUnreadableError(`${where}: segment "${r.label}" uses a code table, which this reader does not walk`);
  if (r.pattern !== undefined && r.pattern !== null && typeof r.pattern !== "string")
    throw new TagGrammarUnreadableError(`${where}: segment "${r.label}" has a pattern that is not text`);
  const pattern = typeof r.pattern === "string" && r.pattern !== "" ? r.pattern : null;
  if (pattern !== null) {
    try {
      new RegExp(`^(?:${pattern})$`);
    } catch (cause) {
      throw new TagGrammarUnreadableError(`${where}: segment "${r.label}" has an unusable pattern: ${String(cause)}`);
    }
  }
  return { position: r.position, label: r.label, pattern, optional: r.cardinality === "?" };
}

/** Build a grammar from a served TagStandard record and the spellings of its two facts. */
export function grammarFromRecord(
  record: TermDoc,
  spellings: { segments: readonly string[]; separator: readonly string[] },
  fallbackIri: string,
): TagGrammar {
  const standard = typeof record["@id"] === "string" ? (record["@id"] as string) : fallbackIri;
  const where = standard;

  // One fact, possibly served under either spelling (prefixed, or bare in a framed document).
  // The first spelling present is read; reading both would count one fact twice.
  const under = (keys: readonly string[]): unknown[] => {
    const key = keys.find((k) => record[k] !== undefined && record[k] !== null);
    return key === undefined ? [] : valuesUnder(record, [key]);
  };
  const separators = under(spellings.separator).filter((v) => typeof v === "string") as string[];
  if (separators.length !== 1 || separators[0] === "")
    // An empty separator means fixed-width segments, which the platform consumes greedily by
    // pattern. This reader does not walk that form.
    throw new TagGrammarUnreadableError(`${where}: expected one non-empty separator, found ${JSON.stringify(separators)}`);
  const separator = separators[0]!;

  const rawSegments = under(spellings.segments);
  if (rawSegments.length === 0) throw new TagGrammarUnreadableError(`${where}: the record states no segments`);
  const segments = rawSegments.map((s) => asSegment(s, where)).sort((a, b) => a.position - b.position);
  segments.forEach((s, i) => {
    if (s.position !== i)
      throw new TagGrammarUnreadableError(`${where}: segment positions are not 0..${segments.length - 1} each once`);
  });

  const only = (label: string): TagSegment => {
    const hits = segments.filter((s) => s.label === label);
    if (hits.length !== 1)
      throw new TagGrammarUnreadableError(`${where}: expected one segment labelled "${label}", found ${hits.length}`);
    return hits[0]!;
  };
  const tag = only(TAG_SEGMENT_LABEL);
  const vaultName = only(VAULT_NAME_SEGMENT_LABEL);
  if (tag.optional || vaultName.optional)
    throw new TagGrammarUnreadableError(`${where}: the tag and the vault name must both be required segments`);
  if (vaultName.position !== segments.length - 1)
    // The short form is the grammar without its vault name. That is only a prefix of the full
    // form when the vault name comes last.
    throw new TagGrammarUnreadableError(`${where}: the vault name is not the last segment, so no short form follows from it`);
  for (const s of segments) {
    if (s === tag || s === vaultName) continue;
    // Any other segment has to be one this module can fill when it formats: an optional one,
    // left empty. A required third segment would need a value nobody supplies.
    if (!s.optional)
      throw new TagGrammarUnreadableError(`${where}: segment "${s.label}" is required and is neither the tag nor the vault name`);
  }
  return { standard, separator, segments, tag, vaultName };
}

/** Read the TagStandard record and the spellings of its grammar facts from the master. */
export async function readTagGrammar(source: VocabularySource, opts: { standardTerm?: string } = {}): Promise<TagGrammar> {
  const iri = source.termIri(opts.standardTerm ?? TAG_STANDARD_TERM);
  const [record, segmentsDoc, separatorDoc] = await Promise.all([
    source.term(iri),
    source.term(source.termIri(TAG_GRAMMAR_TERMS.segments)),
    source.term(source.termIri(TAG_GRAMMAR_TERMS.separator)),
  ]);
  return grammarFromRecord(
    record,
    {
      segments: spellingOfTermDoc(segmentsDoc, source.termIri(TAG_GRAMMAR_TERMS.segments)).readKeys,
      separator: spellingOfTermDoc(separatorDoc, source.termIri(TAG_GRAMMAR_TERMS.separator)).readKeys,
    },
    iri,
  );
}

type Walk = { ok: true; tokens: Map<string, string> } | { ok: false; reason: TagRefusal };

/** The platform decoder's walk over `segments`. See the file header. */
function walk(text: string, separator: string, segments: readonly TagSegment[]): Walk {
  const tokens = text.split(separator);
  if (tokens.length > segments.length) return { ok: false, reason: "surplus-token" };
  const out = new Map<string, string>();
  for (const seg of segments) {
    const token = tokens[seg.position] ?? "";
    if (token === "" && seg.optional) continue;
    if (token === "") return { ok: false, reason: "missing-token" };
    if (seg.pattern !== null && !fullMatch(seg.pattern, token)) return { ok: false, reason: "pattern" };
    out.set(seg.label, token);
  }
  if (out.size === 0) return { ok: false, reason: "missing-token" };
  return { ok: true, tokens: out };
}

export type ParsedTag =
  | { ok: true; form: "full" | "short"; tag: string; vaultName: string }
  | { ok: false; reason: TagRefusal };

/** Parse a full tag (`@ann@home`). Anything else, an email address included, is refused. */
export function parseFullTag(text: string, grammar: TagGrammar): ParsedTag {
  if (typeof text !== "string") return { ok: false, reason: "not-text" };
  const w = walk(text, grammar.separator, grammar.segments);
  if (!w.ok) return w;
  const tag = normalizeTag(w.tokens.get(grammar.tag.label) ?? "");
  if (tag === "") return { ok: false, reason: "empty" };
  return { ok: true, form: "full", tag, vaultName: w.tokens.get(grammar.vaultName.label)! };
}

export interface TagContext {
  /** The registered short name of the holder's own vault WHEN the text is typed or shown inside
   *  that vault; `null` in any other vault's context. The short form is accepted and produced
   *  only when this is set. ⛔ Never a guess: a caller that does not know passes `null`. */
  ownVaultName: string | null;
}

/** Parse a tag as typed in a context: the full form anywhere, the short form (`@ann`) only
 *  inside the holder's own vault. */
export function parseTag(text: string, grammar: TagGrammar, context: TagContext): ParsedTag {
  const full = parseFullTag(text, grammar);
  if (full.ok) return full;
  if (typeof text !== "string") return full;
  const short = walk(text, grammar.separator, grammar.segments.slice(0, -1));
  if (!short.ok) return full;
  const tag = normalizeTag(short.tokens.get(grammar.tag.label) ?? "");
  if (tag === "") return { ok: false, reason: "empty" };
  if (context.ownVaultName === null) return { ok: false, reason: "short-form-outside-own-vault" };
  return { ok: true, form: "short", tag, vaultName: context.ownVaultName };
}

/**
 * The write-side gate on a tag string: normalise it and refuse one the grammar's tag segment
 * does not allow. With the TagStandard record that refuses any string holding `@`.
 * ⛔ Call this before every write of `a:tagString`; the platform's tag route does not refuse
 *    one (read at GilbPlatform `67b4d6c`: `POST /base/tag/handle` checks `minLength` only).
 */
export function assertTagString(raw: unknown, grammar: TagGrammar): string {
  if (typeof raw !== "string") throw new TagRefusedError("not-text", "a tag string must be text");
  const tag = normalizeTag(raw);
  if (tag === "") throw new TagRefusedError("empty", "a tag string must not be empty");
  if (tag.includes(grammar.separator))
    throw new TagRefusedError("pattern", `a tag string must not hold ${JSON.stringify(grammar.separator)}: ${JSON.stringify(tag)}`);
  if (grammar.tag.pattern !== null && !fullMatch(grammar.tag.pattern, tag))
    throw new TagRefusedError("pattern", `${JSON.stringify(tag)} does not match the tag pattern ${grammar.tag.pattern}`);
  return tag;
}

function assertVaultName(raw: unknown, grammar: TagGrammar): string {
  if (typeof raw !== "string" || raw === "") throw new TagRefusedError("empty", "a vault name must not be empty");
  if (raw.includes(grammar.separator) || (grammar.vaultName.pattern !== null && !fullMatch(grammar.vaultName.pattern, raw)))
    throw new TagRefusedError("pattern", `${JSON.stringify(raw)} does not match the vault-name pattern ${grammar.vaultName.pattern}`);
  return raw;
}

function join(grammar: TagGrammar, segments: readonly TagSegment[], values: Map<string, string>): string {
  return segments.map((s) => values.get(s.label) ?? "").join(grammar.separator);
}

/** The full form, `@<tag>@<vault name>`. Throws `TagRefusedError` rather than emit a string
 *  that would not parse back to the same tag and vault. */
export function formatFullTag(parts: { tag: string; vaultName: string }, grammar: TagGrammar): string {
  const tag = assertTagString(parts.tag, grammar);
  const vaultName = assertVaultName(parts.vaultName, grammar);
  const text = join(grammar, grammar.segments, new Map([[grammar.tag.label, tag], [grammar.vaultName.label, vaultName]]));
  const back = parseFullTag(text, grammar);
  if (!back.ok || back.tag !== tag || back.vaultName !== vaultName)
    throw new TagRefusedError("pattern", `${JSON.stringify(text)} does not parse back to tag ${JSON.stringify(tag)} in vault ${JSON.stringify(vaultName)}`);
  return text;
}

/** The short form, `@<tag>`: the full form without its vault name. */
export function formatShortTag(tag: string, grammar: TagGrammar): string {
  const clean = assertTagString(tag, grammar);
  return join(grammar, grammar.segments.slice(0, -1), new Map([[grammar.tag.label, clean]]));
}

/** The form to show in a context: short inside the holder's own vault, full everywhere else. */
export function formatTag(parts: { tag: string; vaultName: string }, grammar: TagGrammar, context: TagContext): string {
  return context.ownVaultName !== null && context.ownVaultName === parts.vaultName
    ? formatShortTag(parts.tag, grammar)
    : formatFullTag(parts, grammar);
}
