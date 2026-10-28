// Records for the fake vault, ported from `units/value-card/test/seed.ts` (a Value's levels, qualifier definitions, Meters and Scale, in the
// shape of the old stored list). The builders are copied unchanged except that the address of a record is under this test's origin, and
// `served` turns a built row into the record the fake vault serves. Not shipped with the package's `src`.
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { writeLineSource } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { CUSTOM_LEVEL_TYPE, LEVEL_TERMS, VALUE_CHILD_TERMS, levelTypeName } from "@kaigilb/gilbplatformcode-value-card-model";
import type { ServedRecord } from "./fakeVault";
import { ORIGIN } from "./fakeVault";

export type LevelEntry = Record<string, unknown>;

const HOST = ORIGIN;

const slug = (term: string) => term.slice(2);

/** One level record. `n` is its place (1, 2 ...); its id is `lvl<n>`. */
export function levelRecord(valueUri: string, n: number, entry: LevelEntry): GridRecord {
  const kind = String(entry["levelKind"] ?? "Goal");
  const type = levelTypeName(kind);
  const chosen = Object.values((entry["levelVariables"] as Record<string, string | string[]> | undefined) ?? {})
    .flatMap((v) => (Array.isArray(v) ? [v.join("-")] : [v]))
    .map((v) => String(v).replace(/[\s.]+/g, ""));
  const served: Record<string, unknown> = {
    unitTag: ["Speed", kind, ...chosen].join("."),
    partOf: { "@id": valueUri },
    elementOrder: n,
  };
  if (type === CUSTOM_LEVEL_TYPE) served.label = kind;
  const map: [string, string][] = [
    ["levelValue", slug(LEVEL_TERMS.value)],
    ["a:levelWhen", slug(LEVEL_TERMS.when)],
    ["levelConditions", slug(LEVEL_TERMS.conditions)],
    ["levelVariables", slug(LEVEL_TERMS.choice)],
    ["a:levelSide", slug(LEVEL_TERMS.side)],
    ["a:note", slug(LEVEL_TERMS.note)],
  ];
  for (const [from, to] of map) if (entry[from] !== undefined) served[to] = entry[from];
  // a:scaleNumber is text. An entry keeps a JSON number only when it says so (an older record: `__numberAsJson`).
  const num = served[slug(LEVEL_TERMS.value)];
  if (typeof num === "number" && entry.__numberAsJson !== true) served[slug(LEVEL_TERMS.value)] = String(num);
  // The choices are written in an entry as { Name: option | [options] } and served as the live list shape.
  if (served[slug(LEVEL_TERMS.choice)] && !Array.isArray(served[slug(LEVEL_TERMS.choice)])) {
    served[slug(LEVEL_TERMS.choice)] = Object.entries(served[slug(LEVEL_TERMS.choice)] as Record<string, string | string[]>).map(([name, v]) => ({
      "a:name": name,
      "a:qualifierOptions": Array.isArray(v) ? v : [v],
    }));
  }
  const source: { text?: string; statedBy?: string } = {};
  if (typeof entry["a:source"] === "string") source.text = entry["a:source"];
  const stated = entry["a:statedBy"] as { "@id"?: string } | undefined;
  if (stated?.["@id"]) source.statedBy = stated["@id"];
  if (source.text || source.statedBy) served.lineSources = writeLineSource([], LEVEL_TERMS.value, source);
  const facts: Record<string, string> = {};
  for (const [k, v] of Object.entries(served)) {
    facts[k] = typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v);
  }
  return {
    id: `lvl${n}`,
    entityUri: `${HOST}/base/e/lvl${n}`,
    typeUri: `t:${type}`,
    facts,
    opaqueFacts: [],
    etag: `"sha256:l${n}"`,
    updatedAt: typeof entry.__updatedAt === "number" ? entry.__updatedAt : 1,
    servedKeys: Object.keys(facts),
    served: { facts: served, context: undefined, etag: `"sha256:l${n}"` },
  } as GridRecord;
}

export type PartEntry = Record<string, unknown>;

function toFacts(served: Record<string, unknown>): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const [k, v] of Object.entries(served)) facts[k] = typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v);
  return facts;
}

function row(id: string, type: string, served: Record<string, unknown>, updatedAt = 1): GridRecord {
  return {
    id,
    entityUri: `${HOST}/base/e/${id}`,
    typeUri: `t:${type}`,
    facts: toFacts(served),
    opaqueFacts: [],
    etag: `"sha256:${id}"`,
    updatedAt,
    servedKeys: Object.keys(served),
    served: { facts: served, context: undefined, etag: `"sha256:${id}"` },
  } as GridRecord;
}

const CT = VALUE_CHILD_TERMS;

/** One qualifier definition record, from an entry in the old shape ({ "a:name", "a:definition", "a:qualifierOptions", "a:defaultOption" }). */
export function qualifierRecord(valueUri: string, n: number, entry: PartEntry): GridRecord {
  const name = String(entry["a:name"] ?? "");
  const served: Record<string, unknown> = { unitTag: `Speed.Q.${name.replace(/[\s.]+/g, "")}`, partOf: { "@id": valueUri }, elementOrder: n };
  for (const k of ["name", "definition", "defaultOption", "qualifierOptions"]) if (entry[`a:${k}`] !== undefined) served[k] = entry[`a:${k}`];
  // A variable is a t:ScaleQualifier; `__legacy: true` serves the older shape (t:ScaleQualifierDefinition, a part of the Value).
  return row(`qual${n}`, entry.__legacy === true ? CT.optionDefType.slice(2) : CT.qualifierType.slice(2), served);
}

/** The option-definition records of qualifier `n` (`__optionDefs: [{ name, definition }]`): t:ScaleQualifierDefinition, a:partOf the qualifier. */
export function optionDefRecords(n: number, entry: PartEntry): GridRecord[] {
  const defs = (entry["__optionDefs"] as { name: string; definition: string }[] | undefined) ?? [];
  return defs.map((d, i) =>
    row(`optdef${n}_${i + 1}`, CT.optionDefType.slice(2), {
      unitTag: `Speed.Q.${String(entry["a:name"] ?? "").replace(/[\s.]+/g, "")}.${d.name.replace(/[\s.]+/g, "")}`,
      partOf: { "@id": `${HOST}/base/e/qual${n}` },
      elementOrder: i + 1,
      name: d.name,
      definition: d.definition,
    }),
  );
}

/** The Value's Scale as a record (`a:` keys: a:description, a:unit, a:rate, a:scaleContext, a:scaleDirection). Its id is `scale1`. */
export function scaleRecord(valueUri: string, entry: PartEntry): GridRecord {
  const served: Record<string, unknown> = { unitTag: "Speed.Scale", partOf: { "@id": valueUri } };
  for (const [k, v] of Object.entries(entry)) served[k.startsWith("a:") ? k.slice(2) : k] = v;
  return row("scale1", "Scale", served);
}

/** One Meter record and its line records, from an entry in the old shape ({ "a:meterQualifier", "lines": [{ "a:meterAgentKind", "a:meterMethod" }] }). */
export function meterRecords(valueUri: string, n: number, entry: PartEntry): { meter: GridRecord; lines: GridRecord[] } {
  const meterId = `meter${n}`;
  const meterTagText = `Speed.Meter${entry["a:meterQualifier"] ? `.${String(entry["a:meterQualifier"]).replace(/[\s.]+/g, "")}` : ""}`;
  const served: Record<string, unknown> = { unitTag: meterTagText, partOf: { "@id": valueUri }, elementOrder: n };
  if (entry["a:meterQualifier"] !== undefined) served.meterQualifier = entry["a:meterQualifier"];
  const meter = row(meterId, CT.meterType.slice(2), served, typeof entry.__updatedAt === "number" ? entry.__updatedAt : 1);
  const lines = ((entry["lines"] as PartEntry[] | undefined) ?? []).map((l, i) => {
    const kind = String(l["a:meterAgentKind"] ?? "human");
    const ls: Record<string, unknown> = {
      unitTag: `${meterTagText}.${{ human: "Human", ai: "AI", instrument: "Instrument" }[kind] ?? kind}`,
      partOf: { "@id": `${HOST}/base/e/${meterId}` },
      elementOrder: i + 1,
      meterAgentKind: kind,
    };
    if (l["a:meterMethod"] !== undefined) ls.meterMethod = l["a:meterMethod"];
    const source: { text?: string; statedBy?: string } = {};
    if (typeof l["a:source"] === "string") source.text = l["a:source"];
    if (source.text) ls.lineSources = writeLineSource([], CT.method, source);
    return row(`mline${n}_${i + 1}`, CT.meterLineType.slice(2), ls);
  });
  return { meter, lines };
}

/** A built row as the record the fake vault serves: its type, its facts as stored, version 1. */
export function served(row: GridRecord): ServedRecord {
  return { id: row.id, type: row.typeUri, facts: { ...(row.served?.facts ?? {}) }, version: 1 };
}
