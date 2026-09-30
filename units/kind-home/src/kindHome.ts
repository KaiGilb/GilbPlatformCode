/**
 * Which standards screen a stored type belongs on.
 * A home is a place a person can open. A wire type is the name the vault stored.
 * They are not always the same word. The list of records stays in the app.
 */

export type ProcessKind = "process" | "processCard";
export type FormKind = "formSchema";
export type ReferenceKind = "referenceDocument";
export type LookupKind = "lookupTable";
export type StandardKind = ProcessKind | FormKind | ReferenceKind | LookupKind;

export interface StandardKindRow {
  kind: StandardKind;
  /** The words on the tab. Not always the stored type name. */
  label: string;
  /**
   * Bare type names this home reads. Never a t: prefix and never a full address.
   * The first name is this home's own type. Any later name is an older type this home still reads.
   */
  wireTypes: readonly string[];
}

export const PROCESS_KINDS: readonly (StandardKindRow & { kind: ProcessKind })[] = [
  { kind: "process", label: "Process", wireTypes: ["Process"] },
  { kind: "processCard", label: "ProcessCard", wireTypes: ["ProcessCard", "Stanza"] },
];

export const FORM_KINDS: readonly (StandardKindRow & { kind: FormKind })[] = [
  { kind: "formSchema", label: "Form-Schema", wireTypes: ["Schema"] },
];

export const REFERENCE_KINDS: readonly (StandardKindRow & { kind: ReferenceKind })[] = [
  { kind: "referenceDocument", label: "Reference", wireTypes: ["ReferenceDocument"] },
];

export const LOOKUP_KINDS: readonly (StandardKindRow & { kind: LookupKind })[] = [
  { kind: "lookupTable", label: "Lookup", wireTypes: ["LookupTable"] },
];

export const STANDARD_KINDS: readonly StandardKindRow[] = [
  ...PROCESS_KINDS,
  ...FORM_KINDS,
  ...REFERENCE_KINDS,
  ...LOOKUP_KINDS,
];

/**
 * The same local-name rules as units/type-curie. Kept here so this folder stands alone.
 * t: is stripped first. Then a short prefix:Name. Then one /base/t/ segment, decoded once.
 * /vault/t/ is not recognised. A broken % throws. The original trimmed text is kept otherwise.
 */
function typeLocalName(typeUri: string): string {
  const text = typeUri.trim();
  if (text.startsWith("t:")) return text.slice(2);
  const curie = text.match(/^[a-z][a-z0-9]*:([A-Za-z0-9_-]+)$/i);
  const curieName = curie?.[1];
  if (curieName) return curieName;
  const address = text.match(/\/base\/t\/([^/#?]+)/i);
  const segment = address?.[1];
  if (segment) return decodeURIComponent(segment);
  return text;
}

const RETIRED_KIND_ALIASES = new Map<string, ProcessKind>([["stanza", "processCard"]]);

/**
 * Read a ?pk= value.
 * "process" and "processCard" pass through. "stanza" opens ProcessCard.
 * "schema" does not open Form-Schema. It opens Process.
 * null, empty, and any other word, including "constructor", open Process.
 * The match is case-sensitive. This is a Map on purpose: an object would treat
 * inherited names such as "constructor" as real kinds.
 */
export function parseProcessKind(raw: string | null): ProcessKind {
  if (PROCESS_KINDS.some((row) => row.kind === raw)) return raw as ProcessKind;
  if (raw === null) return "process";
  return RETIRED_KIND_ALIASES.get(raw) ?? "process";
}

/**
 * Write ?pk=. The default kind removes pk. Any kind removes std.
 * Other parameters are copied. The input is not changed.
 */
export function applyProcessKindParams(prev: URLSearchParams, kind: ProcessKind): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (kind === "process") next.delete("pk");
  else next.set("pk", kind);
  next.delete("std");
  return next;
}

/**
 * Which Process-tab home a stored type belongs to.
 * Stanza belongs to ProcessCard. Process, Schema, and anything unrecognised belong to Process.
 * This does not return formSchema, referenceDocument, or lookupTable.
 * Null and blank belong to Process. A broken % in /base/t/ throws.
 */
export function processKindOfTypeUri(typeUri: string | null | undefined): ProcessKind {
  const local = typeLocalName(typeUri ?? "");
  if (!local) return "process";
  const row = PROCESS_KINDS.find((kind) => kind.kind !== "process" && kind.wireTypes.includes(local));
  return row?.kind ?? "process";
}

/** The tab label, or the kind id itself when the id is not in the registry. */
export function standardKindLabel(kind: StandardKind): string {
  return STANDARD_KINDS.find((row) => row.kind === kind)?.label ?? kind;
}

/** The registry row, or undefined. */
export function standardKindRow(kind: StandardKind): StandardKindRow | undefined {
  return STANDARD_KINDS.find((row) => row.kind === kind);
}

/**
 * The stored type name to show beside the tab label, or null when they are the same words.
 * Compared to the label, not to the wire type.
 * ProcessCard versus Stanza differs. Form-Schema versus Schema differs.
 * Reference versus ReferenceDocument differs. Lookup versus LookupTable differs.
 * A blank stored name is null. Nothing is invented.
 */
export function legacyStoredTypeOf(kind: StandardKind, storedTypeName: string): string | null {
  if (!storedTypeName) return null;
  return storedTypeName === standardKindLabel(kind) ? null : storedTypeName;
}
