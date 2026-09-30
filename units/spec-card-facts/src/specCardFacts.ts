/**
 * The facts a Value, Function, or Solution form stores, and the form fields
 * read back from those facts.
 *
 * This unit does not choose the stored type name. That is units/spec-kind
 * (Function versus FunctionConstraint, Solution versus Constraint, Value
 * always Value). Pass the kind in. The word "constraint" inside the form
 * still decides which facts this unit keeps. It does not write the type.
 *
 * Keys are bare slugs. The host adds `a:` once. Do not put `a:` on these keys.
 */

export type SpecCardKind = "value" | "function" | "solution";

export type RecordFactValue =
  | string
  | number
  | boolean
  | { readonly [key: string]: unknown }
  | readonly unknown[];

export type RecordCreateFacts = Record<string, RecordFactValue>;

export type MergePatchValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: unknown }
  | readonly unknown[];

type Obj = { [key: string]: unknown };

function t(form: Record<string, string>, key: string): string {
  return (form[key] ?? "").trim();
}

function named(tag: string, url: string, key: "a:unitTag" | "a:label"): Obj | undefined {
  if (!tag && !url) return undefined;
  const out: Obj = {};
  if (tag) out[key] = tag;
  if (url) out["@id"] = url;
  return out;
}

function numberOrWord(raw: string): string | number | undefined {
  if (!raw) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function levelRow(
  band: "status" | "past" | "tolerable" | "goal" | "wish",
  date: string,
  condition: string,
  level: string,
  source: string,
): Obj | undefined {
  if (!date && !level && !condition && !source) return undefined;
  const key = band === "past" ? "status" : band;
  const row: Obj = {};
  const amount = numberOrWord(level);
  if (amount !== undefined) row[`a:${key}`] = amount;
  if (date) row[`a:${key}When`] = date;
  if (condition) row["a:qualifierCondition"] = condition;
  if (source) row["a:source"] = source;
  return Object.keys(row).length ? row : undefined;
}

function sourceRow(predicate: string, source: string): Obj | undefined {
  if (!source) return undefined;
  return { "a:sourceOf": predicate, "a:source": source };
}

/** Turn the template fields into the wire facts. An empty element is left out. */
export function composeSpecCard(kind: SpecCardKind, form: Record<string, string>): RecordCreateFacts {
  const out: RecordCreateFacts = {};
  const put = (slug: string, value: RecordFactValue | undefined) => {
    if (value == null) return;
    if (typeof value === "string" && value.trim() === "") return;
    if (Array.isArray(value) && value.length === 0) return;
    out[slug] = value;
  };

  put("unitTag", t(form, "unitTag"));
  put("level", t(form, "level"));
  const stakeholder = named(t(form, "stakeholder"), t(form, "stakeholderUrl"), "a:unitTag");
  if (stakeholder) put("stakeholders", [stakeholder]);
  put("concept", named(t(form, "concept"), t(form, "conceptUrl"), "a:label"));
  const veda = t(form, "gilbVedaUrl") || t(form, "gilbVeda");
  if (veda) put("ontologyTerm", veda);

  const scale: Obj = {};
  if (t(form, "scaleUnit")) scale["a:unit"] = t(form, "scaleUnit");
  if (t(form, "scaleRate")) scale["a:rate"] = t(form, "scaleRate");
  if (t(form, "scaleContext")) scale["a:does"] = t(form, "scaleContext");
  if (t(form, "scaleSource")) scale["a:source"] = t(form, "scaleSource");
  if (Object.keys(scale).length) put("scale", scale);

  put("endpointSubject", named(t(form, "endpointSubject"), "", "a:label"));
  put("endpointReference", t(form, "endpointReference"));

  const meters: Obj[] = [];
  for (const [agent, methodKey, sourceKey] of [
    ["human", "meterHuman", "meterHumanSource"],
    ["ai", "meterAi", "meterAiSource"],
    ["instrument", "meterInstrument", "meterInstrumentSource"],
  ] as const) {
    const method = t(form, methodKey);
    const source = t(form, sourceKey);
    if (!method && !source) continue;
    const row: Obj = { "a:meterAgentKind": agent };
    if (method) row["a:method"] = method;
    if (source) row["a:source"] = source;
    meters.push(row);
  }
  if (meters.length) put("hasMeter", meters);

  const levels = [
    levelRow("status", t(form, "statusDate"), t(form, "statusCondition"), t(form, "statusLevel"), t(form, "statusSource")),
    levelRow("past", t(form, "pastDate"), t(form, "pastCondition"), t(form, "pastLevel"), t(form, "pastSource")),
    levelRow("tolerable", t(form, "tolerableDate"), t(form, "tolerableCondition"), t(form, "tolerableLevel"), t(form, "tolerableSource")),
    levelRow("goal", t(form, "goalDate"), t(form, "goalCondition"), t(form, "goalLevel"), t(form, "goalSource")),
    levelRow("wish", t(form, "wishDate"), t(form, "wishCondition"), t(form, "wishLevel"), t(form, "wishSource")),
  ].filter((row): row is Obj => !!row);
  if (levels.length) put("levelStatements", levels);

  put("measures", named(t(form, "valueOfFunction"), t(form, "valueOfFunctionUrl"), "a:unitTag"));
  put("body", t(form, "description"));
  put("fvParent", named(t(form, "partOf"), t(form, "partOfUrl"), "a:unitTag"));
  const hasValue = named(t(form, "functionOfValue"), t(form, "functionOfValueUrl"), "a:unitTag");
  if (hasValue) put("hasValue", [hasValue]);

  const impacts: Obj[] = [];
  const from = numberOrWord(t(form, "impactFrom"));
  const to = numberOrWord(t(form, "impactTo"));
  const estimate: Obj = {};
  if (typeof from === "number") estimate.from = from;
  if (typeof to === "number") estimate.to = to;
  if (t(form, "impactUnit")) estimate.unit = t(form, "impactUnit");
  if (t(form, "impactValue") || Object.keys(estimate).length || t(form, "impactValueMove")) {
    const row: Obj = {};
    if (t(form, "impactValue")) row["role:value"] = { "a:unitTag": t(form, "impactValue") };
    if (Object.keys(estimate).length) row["a:valueEstimate"] = estimate;
    else if (t(form, "impactValueMove")) row["a:valueEstimate"] = t(form, "impactValueMove");
    if (t(form, "impactValueSource")) row["a:source"] = t(form, "impactValueSource");
    impacts.push(row);
  }
  const amount = numberOrWord(t(form, "impactResourceAmount"));
  const draw: Obj = {};
  if (typeof amount === "number") draw.amount = amount;
  if (t(form, "impactResourceSign")) draw.sign = t(form, "impactResourceSign");
  if (t(form, "impactResourceUnit")) draw.unit = t(form, "impactResourceUnit");
  if (t(form, "impactResource") || Object.keys(draw).length || t(form, "impactResourceDraw")) {
    const row: Obj = {};
    if (t(form, "impactResource")) row["role:resource"] = { "a:unitTag": t(form, "impactResource") };
    if (Object.keys(draw).length) row["a:resourceDraw"] = draw;
    else if (t(form, "impactResourceDraw")) row["a:resourceDraw"] = t(form, "impactResourceDraw");
    if (t(form, "impactResourceSource")) row["a:source"] = t(form, "impactResourceSource");
    impacts.push(row);
  }
  if (impacts.length) put("impactEstimates", impacts);

  put("meansFor", named(t(form, "solutionOfFunction"), t(form, "solutionOfFunctionUrl"), "a:unitTag"));
  put("partOf", named(t(form, "partOfSystem"), t(form, "partOfSystemUrl"), "a:label"));
  const authorityUrl = t(form, "authorityUrl");
  const authority = t(form, "authority");
  put("authority", authorityUrl ? `${authority} (${authorityUrl})`.trim() : authority);

  const sources = [
    sourceRow("a:level", t(form, "levelSource")),
    sourceRow("a:stakeholders", t(form, "stakeholderSource")),
    sourceRow("a:concept", t(form, "conceptSource")),
    sourceRow("a:ontologyTerm", t(form, "gilbVedaSource")),
    sourceRow("a:endpointSubject", t(form, "endpointSource")),
    sourceRow("a:endpointReference", t(form, "endpointSource")),
    sourceRow("a:measures", t(form, "valueOfFunctionSource")),
    sourceRow("a:body", t(form, "descriptionSource")),
    sourceRow("a:fvParent", t(form, "partOfSource")),
    sourceRow("a:hasValue", t(form, "functionOfValueSource")),
    sourceRow("a:meansFor", t(form, "solutionOfFunctionSource")),
    sourceRow("a:partOf", t(form, "partOfSystemSource")),
    sourceRow("a:authority", t(form, "authoritySource")),
  ].filter((row): row is Obj => !!row);
  if (sources.length) put("lineSources", sources);

  if (kind === "value") {
    for (const slug of ["body", "fvParent", "hasValue", "impactEstimates", "meansFor", "partOf", "authority"]) delete out[slug];
  } else if (kind === "function") {
    for (const slug of ["scale", "endpointSubject", "endpointReference", "measures", "impactEstimates", "meansFor", "partOf"]) delete out[slug];
    if (t(form, "constraint") !== "yes") delete out.authority;
    // A Function's levels are Status and Past only.
    if (Array.isArray(out.levelStatements)) {
      out.levelStatements = out.levelStatements.filter((row) => {
        const o = row as Obj;
        return "a:status" in o || "a:statusWhen" in o;
      });
      if ((out.levelStatements as unknown[]).length === 0) delete out.levelStatements;
    }
  } else if (kind === "solution") {
    for (const slug of ["scale", "endpointSubject", "endpointReference", "measures", "fvParent", "hasValue", "ontologyTerm"]) delete out[slug];
    if (t(form, "constraint") !== "yes") delete out.authority;
    if (Array.isArray(out.levelStatements)) {
      out.levelStatements = out.levelStatements.filter((row) => {
        const o = row as Obj;
        return "a:status" in o || "a:statusWhen" in o;
      });
      if ((out.levelStatements as unknown[]).length === 0) delete out.levelStatements;
    }
  }
  return out;
}

function textOf(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" ? v : "";
}

function obj(v: unknown): Obj | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Obj;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function fillRef(out: Record<string, string>, v: unknown, tagKey: string, urlKey: string, nameKey: "a:unitTag" | "a:label") {
  const o = obj(v);
  if (!o) return;
  if (textOf(o[nameKey])) out[tagKey] = textOf(o[nameKey]);
  if (textOf(o["@id"])) out[urlKey] = textOf(o["@id"]);
}

function fillLevel(out: Record<string, string>, row: Obj, prefix: "status" | "past" | "tolerable" | "goal" | "wish") {
  const key = prefix === "past" ? "status" : prefix;
  if (textOf(row[`a:${key}`])) out[`${prefix}Level`] = textOf(row[`a:${key}`]);
  if (textOf(row[`a:${key}When`])) out[`${prefix}Date`] = textOf(row[`a:${key}When`]);
  if (textOf(row["a:qualifierCondition"])) out[`${prefix}Condition`] = textOf(row["a:qualifierCondition"]);
  if (textOf(row["a:source"])) out[`${prefix}Source`] = textOf(row["a:source"]);
}

/** Turn stored objects back into the template fields. */
export function formatSpecCard(structured: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!structured) return {};
  const out: Record<string, string> = {};
  const people = list(structured.stakeholders);
  const first = obj(people[0]);
  if (first) {
    if (textOf(first["a:unitTag"])) out.stakeholder = textOf(first["a:unitTag"]);
    else if (typeof people[0] === "string") out.stakeholder = people[0];
    if (textOf(first["@id"])) out.stakeholderUrl = textOf(first["@id"]);
  } else if (typeof people[0] === "string") out.stakeholder = people[0];

  fillRef(out, structured.concept, "concept", "conceptUrl", "a:label");
  const scale = obj(structured.scale);
  if (scale) {
    if (textOf(scale["a:unit"])) out.scaleUnit = textOf(scale["a:unit"]);
    if (textOf(scale["a:rate"])) out.scaleRate = textOf(scale["a:rate"]);
    if (textOf(scale["a:does"])) out.scaleContext = textOf(scale["a:does"]);
    if (textOf(scale["a:source"])) out.scaleSource = textOf(scale["a:source"]);
  }
  const subject = obj(structured.endpointSubject);
  if (subject && textOf(subject["a:label"])) out.endpointSubject = textOf(subject["a:label"]);
  for (const row of list(structured.hasMeter)) {
    const m = obj(row);
    if (!m) continue;
    const kind = textOf(m["a:meterAgentKind"]);
    const slot = kind === "human" ? "meterHuman" : kind === "ai" ? "meterAi" : kind === "instrument" ? "meterInstrument" : "";
    if (!slot) continue;
    if (textOf(m["a:method"])) out[slot] = textOf(m["a:method"]);
    if (textOf(m["a:source"])) out[`${slot}Source`] = textOf(m["a:source"]);
  }
  const levels = list(structured.levelStatements).map(obj).filter((o): o is Obj => !!o);
  const statuses = levels.filter((o) => textOf(o["a:status"]) || textOf(o["a:statusWhen"]));
  const latest = statuses.reduce<Obj | null>((best, row) => {
    if (!best) return row;
    return textOf(row["a:statusWhen"]) > textOf(best["a:statusWhen"]) ? row : best;
  }, null);
  for (const row of levels) {
    if (textOf(row["a:tolerable"]) || textOf(row["a:tolerableWhen"])) fillLevel(out, row, "tolerable");
    else if (textOf(row["a:goal"]) || textOf(row["a:goalWhen"])) fillLevel(out, row, "goal");
    else if (textOf(row["a:wish"]) || textOf(row["a:wishWhen"])) fillLevel(out, row, "wish");
    else if (row === latest) fillLevel(out, row, "status");
    else fillLevel(out, row, "past");
  }
  fillRef(out, structured.measures, "valueOfFunction", "valueOfFunctionUrl", "a:unitTag");
  fillRef(out, structured.fvParent, "partOf", "partOfUrl", "a:unitTag");
  const values = list(structured.hasValue);
  if (values[0]) fillRef(out, values[0], "functionOfValue", "functionOfValueUrl", "a:unitTag");
  fillRef(out, structured.meansFor, "solutionOfFunction", "solutionOfFunctionUrl", "a:unitTag");
  fillRef(out, structured.partOf, "partOfSystem", "partOfSystemUrl", "a:label");
  for (const row of list(structured.impactEstimates)) {
    const o = obj(row);
    if (!o) continue;
    const value = obj(o["role:value"]);
    const resource = obj(o["role:resource"]);
    if (value) {
      if (textOf(value["a:unitTag"])) out.impactValue = textOf(value["a:unitTag"]);
      const estimate = obj(o["a:valueEstimate"]);
      if (estimate) {
        if (textOf(estimate.from)) out.impactFrom = textOf(estimate.from);
        if (textOf(estimate.to)) out.impactTo = textOf(estimate.to);
        if (textOf(estimate.unit)) out.impactUnit = textOf(estimate.unit);
      } else if (textOf(o["a:valueEstimate"])) out.impactValueMove = textOf(o["a:valueEstimate"]);
      if (textOf(o["a:source"])) out.impactValueSource = textOf(o["a:source"]);
    }
    if (resource) {
      if (textOf(resource["a:unitTag"])) out.impactResource = textOf(resource["a:unitTag"]);
      const draw = obj(o["a:resourceDraw"]);
      if (draw) {
        if (textOf(draw.amount)) out.impactResourceAmount = textOf(draw.amount);
        if (textOf(draw.sign)) out.impactResourceSign = textOf(draw.sign);
        if (textOf(draw.unit)) out.impactResourceUnit = textOf(draw.unit);
      } else if (textOf(o["a:resourceDraw"])) out.impactResourceDraw = textOf(o["a:resourceDraw"]);
      if (textOf(o["a:source"])) out.impactResourceSource = textOf(o["a:source"]);
    }
  }
  const sourceOf: Record<string, string> = {
    "a:level": "levelSource",
    "a:stakeholders": "stakeholderSource",
    "a:concept": "conceptSource",
    "a:ontologyTerm": "gilbVedaSource",
    "a:endpointSubject": "endpointSource",
    "a:measures": "valueOfFunctionSource",
    "a:body": "descriptionSource",
    "a:fvParent": "partOfSource",
    "a:hasValue": "functionOfValueSource",
    "a:meansFor": "solutionOfFunctionSource",
    "a:partOf": "partOfSystemSource",
    "a:authority": "authoritySource",
  };
  for (const row of list(structured.lineSources)) {
    const o = obj(row);
    if (!o) continue;
    const slot = sourceOf[textOf(o["a:sourceOf"])];
    if (slot && textOf(o["a:source"])) out[slot] = textOf(o["a:source"]);
  }
  return out;
}

export function specCardForm(
  facts: Record<string, string>,
  structured: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...facts, ...formatSpecCard(structured) };
  if (facts.ontologyTerm && !out.gilbVeda) out.gilbVeda = facts.ontologyTerm;
  if (facts.body && !out.description) out.description = facts.body;
  if (facts.endpointReference && !out.endpointReference) out.endpointReference = facts.endpointReference;
  return out;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function specCardWire(
  kind: SpecCardKind,
  form: Record<string, string>,
  structured: Readonly<Record<string, unknown>> | null | undefined,
  facts: Record<string, string> = {},
): { unchanged: boolean; patch: Record<string, MergePatchValue> } {
  const next = composeSpecCard(kind, form);
  const previous = composeSpecCard(kind, specCardForm(facts, structured));
  const patch: Record<string, MergePatchValue> = { ...next };
  for (const key of Object.keys(previous)) {
    if (!(key in next)) patch[key] = null;
  }
  return { unchanged: stable(previous) === stable(next), patch };
}
