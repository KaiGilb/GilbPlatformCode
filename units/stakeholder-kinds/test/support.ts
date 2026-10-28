// Shared set-up of the tests (not shipped). Ported from gilb-stakeholders `test/fixtureMaster.ts` at 27fe0cef: a served master as documents keyed by URL, behind a fake fetch.
// A served master, as documents keyed by URL, behind a fake fetch.
//
// The shapes are the master's own, read live on 2026-09-30:
//   GET https://ontology.platform.example.test/base/t/Stakeholder            200 at 06:29:13Z (a:playableBy, 7 refs)
//   GET https://ontology.platform.example.test/base/t/Person/children         200 (Passenger, complete)
//   GET https://ontology.platform.example.test/base/t/SoftwareSystem/children 200 (AI Agent, Data Store, complete)
//   GET https://ontology.platform.example.test/base/a/{fieldOf,playableBy,subTypeOf,label,name} 200
//   GET https://ontology.platform.example.test/base/vocab?status=all&limit=2  200 (@graph, complete, next)
//   control GET https://ontology.platform.example.test/base/t/zzqqnotatype    404
// The documents are trimmed to the facts this package reads. ⚠ Two id forms, both as served:
// a predicate dereferenced at /base/a/<slug> answers with `@id` …/base/a/<slug>, while the same
// attribute as a node of the ?status=all listing carries `@id` …/base/t/<TypeName>
// (read live 06:40Z: …/base/t/Email, …/base/t/PlanguageLevel). A field's `term` is therefore
// the listing's t/ form. ⚠ The is-a chains ABOVE the
// members (Animal, Organism, Substance, Relation, …) and the field declarations are
// ILLUSTRATIVE: they have the served shape, ⛔ not a claim about what the master holds today.
// The live reading is in the receipt, not here.
//
// The fixture is FETCHED from a rig origin that differs from the identity host in every IRI,
// so a resolver that fetched an IRI verbatim (or built URLs from the identity host) would miss.
import type { TermDoc } from "@kaigilb/gilbplatformcode-vocabulary-source";

export const ID = "https://ontology.platform.example.test";
export const RIG = "http://rig.example.test:5301";
export const t = (name: string) => `${ID}/base/t/${name}`;
export const a = (slug: string) => `${ID}/base/a/${slug}`;

export const CONTEXT = {
  "@vocab": `${ID}/base/a/`,
  base: `${ID}/base/`,
  t: `${ID}/base/t/`,
  a: `${ID}/base/a/`,
};

/** A page or named-read document's context, as GilbPlatform `pageContext` serves it at eda13db1
 *  (`src/vocab/document.ts`): the term context first and unchanged, then the page grammar. */
export const PAGE_CONTEXT = [
  CONTEXT,
  {
    complete: { "@id": `${ID}/base/ns/vocab-page#complete` },
    limit: { "@id": `${ID}/base/ns/vocab-page#limit` },
    absent: { "@id": `${ID}/base/ns/vocab-page#absent`, "@container": "@set" },
    next: { "@id": "http://www.w3.org/ns/hydra/core#next", "@type": "@id" },
  },
];

const ref = (iri: string) => ({ "@id": iri });

/** The seven players, in the order the master served them at 06:29:13Z. */
export const SERVED_PLAYERS = [
  "Person",
  "Organization",
  "PartyGroup",
  "PartyMemberOf",
  "SoftwareSystem",
  "SoftwareSystemGroup",
  "SoftwareSystemMemberOf",
];

const REQUEST_BUDGET = 500;

export interface FixtureMaster {
  docs: Map<string, unknown>;
  status: Map<string, number>;
  requested: string[];
  /** The init each request was sent with, in request order (its cache mode, for one). */
  inits: (RequestInit | undefined)[];
  /** True (the default): the master has GilbPlatform GAPP214.22b's carrier selector and narrows
   *  `?status=all&carries=<name>`. False: a master without it (GilbPlatform `46eaea58`, production
   *  until GAPP214.45), which ignores the key and serves the whole listing, paged by `limit`. */
  selector: boolean;
  /** True (the default): the master serves the opt-in listing's named read,
   *  `?status=all&type=<Name>&type=<Name>…` (GilbPlatform Cycle154 D8, at `46eaea58` and
   *  `eda13db1`). False: a master that ignores `type` and serves the whole listing. */
  namedRead: boolean;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Put a document at a term's address (its path under /base/, e.g. "t/Person"). */
  put(path: string, doc: unknown): void;
  children(typeName: string, kids: { name: string; label?: string }[], complete?: boolean): void;
  /** Replace the listing with these pages of nodes. */
  listing(pages: TermDoc[][], opts?: { lastComplete?: boolean; dropNextAt?: number }): void;
  count(pathSuffix: string): number;
}

export function fixtureMaster(): FixtureMaster {
  const docs = new Map<string, unknown>();
  const status = new Map<string, number>();
  const requested: string[] = [];
  const inits: (RequestInit | undefined)[] = [];

  // Every node of the whole listing, in served order: the walk's own pages, followed by `next`.
  const wholeListing = (): TermDoc[] => {
    const out: TermDoc[] = [];
    let at: string | null = `${RIG}/base/vocab?status=all&limit=2000`;
    for (let i = 0; at && i < 100; i++) {
      const page = docs.get(at) as { "@graph": TermDoc[]; next: string | null } | undefined;
      if (!page) break;
      out.push(...page["@graph"]);
      // A relative next is read against the rig, as the package's own `locate` reads it, so a
      // fixture fault cannot pass as a package refusal (VAScaling GAPP214.22c B3).
      const nextUrl: URL | null = page.next ? new URL(page.next, `${RIG}/`) : null;
      at = nextUrl ? `${RIG}${nextUrl.pathname}${nextUrl.search}` : null;
    }
    return out;
  };

  // The carrier read, as GilbPlatform GAPP214.22b serves it (src/routes/vocab.ts at eda13db1):
  // the named predicate's term is found by a `|` segment of its a:predicateAttribute; its
  // spellings are every segment, each a:deprecatedNotation and the a:-form's full IRI; a node is
  // kept when it carries a fact under one of them; the face repeats `carries` and
  // `carriesSpellings` beside `limit`, `complete` and `next`. An unbound name is a 400.
  const carrierRead = (u: URL): Response => {
    const name = u.searchParams.get("carries") ?? "";
    const limit = Number(u.searchParams.get("limit") ?? "2000");
    const offset = Number((u.searchParams.get("cursor") ?? "k0").slice(1));
    if (!m.selector) {
      // A master without the selector: the key is ignored, the WHOLE listing is paged.
      const all = wholeListing();
      const graph = all.slice(offset, offset + limit);
      const complete = offset + limit >= all.length;
      return Response.json({
        "@context": PAGE_CONTEXT,
        "@id": u.toString(),
        limit,
        complete,
        next: complete ? null : `${ID}/base/vocab?status=all&limit=${limit}&cursor=k${offset + limit}`,
        "@graph": graph,
      });
    }
    const split = (v: unknown): string[] =>
      typeof v === "string" ? v.split("|").map((x) => x.trim()).filter(Boolean) : Array.isArray(v) ? v.flatMap(split) : [];
    let spellings: string[] | null = null;
    for (const doc of docs.values()) {
      const d = doc as TermDoc;
      const binding = split(d?.["a:predicateAttribute"]);
      if (!binding.includes(name)) continue;
      const curies = [...binding, ...split(d["a:deprecatedNotation"])];
      const iris = curies.filter((c) => c.startsWith("a:")).map((c) => `${ID}/base/a/${c.slice(2)}`);
      spellings = [...new Set([...curies, ...iris])];
      break;
    }
    if (!name || spellings === null) return Response.json({ error: "UnknownPredicate", carries: name }, { status: 400 });
    const all = wholeListing().filter((n) => spellings!.some((k) => n[k] !== undefined && n[k] !== null));
    const graph = all.slice(offset, offset + limit);
    const complete = offset + limit >= all.length;
    return Response.json({
      "@context": [PAGE_CONTEXT[0], { ...PAGE_CONTEXT[1], carries: { "@id": `${ID}/base/ns/vocab-page#carries` }, carriesSpellings: { "@id": `${ID}/base/ns/vocab-page#carriesSpellings`, "@container": "@set" } }],
      "@id": u.toString(),
      carries: name,
      carriesSpellings: spellings,
      limit,
      complete,
      next: complete ? null : `${ID}/base/vocab?status=all&carries=${encodeURIComponent(name)}&limit=${limit}&cursor=k${offset + limit}`,
      "@graph": graph,
    });
  };

  // The named read, as GilbPlatform serves it at eda13db1 (src/routes/vocab.ts, the `named.requested`
  // branch of /base/vocab with status=all; src/read/type-name-selector.ts; src/vocab/document.ts
  // buildNamedTermsDocument): each `type` a bare name (/^[A-Za-z0-9_-]{1,64}$/, else 400), at most
  // 100 distinct names (else 400, nothing served), no `limit`/`cursor`/`nodeKind` beside it (else
  // 400). The face is `complete: true` and `absent` (the names with no term); each served term is
  // a node of `@graph` with `@id` its own /base/t/<Name> identity, projected as the per-term route
  // projects it. A term whose own address this fixture is told to fail (`status`) is absent here,
  // so a test that fails a term still sees that term's own read fail.
  const namedRead = (u: URL): Response => {
    const names = [...new Set(u.searchParams.getAll("type"))];
    const bad = names.filter((n) => !/^[A-Za-z0-9_-]{1,64}$/.test(n));
    if (bad.length > 0) return Response.json({ error: "TypeTokenUnresolved", rejected: bad }, { status: 400 });
    if (names.length > 100) return Response.json({ error: "TypeFilterTooLarge", limit: 100, named: names.length }, { status: 400 });
    if (["limit", "cursor", "nodeKind"].some((k) => u.searchParams.has(k)))
      return Response.json({ error: "SelectorCombinationUnsupported" }, { status: 400 });
    const graph: TermDoc[] = [];
    const absent: string[] = [];
    for (const n of names) {
      const at = `${RIG}/base/t/${n}`;
      const doc = docs.get(at) as TermDoc | undefined;
      if (!doc || status.has(at)) {
        absent.push(n);
        continue;
      }
      const { "@context": _context, ...node } = doc;
      graph.push({ ...node, "@id": t(n) });
    }
    // The page's context as the door serves it: a list, [the term context, the page grammar].
    return Response.json({ "@context": PAGE_CONTEXT, "@id": u.toString(), complete: true, absent, "@graph": graph });
  };

  const m: FixtureMaster = {
    docs,
    status,
    requested,
    inits,
    selector: true,
    namedRead: true,
    fetch: async (url: string, init?: RequestInit) => {
      requested.push(url);
      inits.push(init);
      // A budget far above any honest walk here (~40 requests). A walk that does not end hits it
      // and fails the test BY NAME, rather than starving the event loop until the suite hangs.
      if (requested.length > REQUEST_BUDGET) throw new Error(`fixture request budget of ${REQUEST_BUDGET} exceeded: a walk is not ending`);
      const code = status.get(url);
      if (code) return new Response("{}", { status: code });
      const parsed = new URL(url);
      if (!docs.has(url) && parsed.pathname === "/base/vocab" && parsed.searchParams.has("carries")) return carrierRead(parsed);
      if (!docs.has(url) && parsed.pathname === "/base/vocab" && parsed.searchParams.get("status") === "all" && parsed.searchParams.has("type")) {
        if (m.namedRead) return namedRead(parsed);
        // A master that ignores `type`: the whole listing, in one answer.
        return Response.json({ "@context": CONTEXT, "@id": url, complete: true, "@graph": wholeListing() });
      }
      if (!docs.has(url)) return new Response(JSON.stringify({ error: "NotFound" }), { status: 404 });
      return new Response(JSON.stringify(docs.get(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    put(path, doc) {
      docs.set(`${RIG}/base/${path}`, doc);
    },
    children(typeName, kids, complete = true) {
      docs.set(`${RIG}/base/t/${typeName}/children`, {
        type: t(typeName),
        children: kids.map((k) => ({ term: t(k.name), name: k.name, label: k.label ?? k.name, kind: "type" })),
        complete,
      });
    },
    listing(pages, opts = {}) {
      for (const k of [...docs.keys()]) if (k.includes("/base/vocab?")) docs.delete(k);
      const urlOf = (i: number) =>
        i === 0
          ? `${RIG}/base/vocab?status=all&limit=2000`
          : `${RIG}/base/vocab?status=all&limit=2000&cursor=c${i}`;
      pages.forEach((graph, i) => {
        const last = i === pages.length - 1;
        const complete = last ? (opts.lastComplete ?? true) : false;
        const next =
          last || opts.dropNextAt === i
            ? null
            : // The server hands back an absolute URL on ITS host; the source must re-root it.
              `https://ontology.platform.example.test/base/vocab?status=all&limit=2000&cursor=c${i + 1}`;
        docs.set(urlOf(i), { "@context": PAGE_CONTEXT, "@id": urlOf(i), limit: 2000, complete, next, "@graph": graph });
      });
    },
    count(pathSuffix) {
      return requested.filter((u) => u.endsWith(pathSuffix)).length;
    },
  };

  // The predicates, each describing its own spelling.
  for (const slug of ["playableBy", "fieldOf", "subTypeOf", "label", "name", "fieldRecordType"]) {
    m.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  }

  // The role concept, as served.
  m.put("t/Stakeholder", {
    "@context": CONTEXT,
    "@id": t("Stakeholder"),
    "a:label": "Stakeholder",
    "a:playableBy": SERVED_PLAYERS.map((n) => ref(t(n))),
    "a:subTypeOf": ref(t("Type")),
  });

  // Children, as served at 06:40:23Z and re-read by VATester at 06:47Z: Person has Passenger,
  // Software System has AI Agent and Data Store, the other members have none. So 10 kinds.
  for (const n of SERVED_PLAYERS) m.children(n, []);
  m.children("Person", [{ name: "Passenger", label: "Passenger" }]);
  m.children("Passenger", []);
  m.children("SoftwareSystem", [
    { name: "AiAgent", label: "AI Agent" },
    { name: "DataStore", label: "Data Store" },
  ]);
  m.children("AiAgent", []);
  m.children("DataStore", []);

  // Is-a upward. ILLUSTRATIVE chains with the served shape.
  const up: Record<string, { label: string; parent?: string }> = {
    Person: { label: "Person", parent: "Animal" },
    Passenger: { label: "Passenger", parent: "Person" },
    Animal: { label: "Animal", parent: "Organism" },
    Organism: { label: "Organism", parent: "Substance" },
    Substance: { label: "Substance" },
    Organization: { label: "Organization", parent: "CollectiveAgent" },
    CollectiveAgent: { label: "Collective Agent", parent: "Substance" },
    PartyGroup: { label: "Party Group", parent: "SocialCollective" },
    SocialCollective: { label: "Social Collective", parent: "Substance" },
    PartyMemberOf: { label: "party-member-of", parent: "MemberOf" },
    MemberOf: { label: "member-of", parent: "Relation" },
    Relation: { label: "Relation" },
    SoftwareSystem: { label: "Software System", parent: "Artifact" },
    Artifact: { label: "Artifact", parent: "Substance" },
    AiAgent: { label: "AI Agent", parent: "SoftwareSystem" },
    DataStore: { label: "Data Store", parent: "SoftwareSystem" },
    SoftwareSystemGroup: { label: "Software System Group", parent: "Information" },
    Information: { label: "Information", parent: "Substance" },
    SoftwareSystemMemberOf: { label: "software-system-member-of", parent: "MemberOf" },
    Employment: { label: "Employment", parent: "WorksFor" },
    WorksFor: { label: "works-for", parent: "MemberOf" },
  };
  for (const [name, { label, parent }] of Object.entries(up)) {
    m.put(`t/${name}`, {
      "@context": CONTEXT,
      "@id": t(name),
      "a:label": label,
      ...(parent ? { "a:subTypeOf": ref(t(parent)) } : {}),
    });
  }

  // Field declarations, spread over two listing pages with a node that is not a declaration.
  m.listing([
    [
      { "@id": t("Unrelated"), "a:predicateAttribute": "a:unrelated", "a:label": "Unrelated" },
      {
        "@id": t("Name"),
        "a:predicateAttribute": "a:name",
        "a:label": "Name",
        "a:encoding": "inline-literal:text",
        "a:fieldOf": ["Person", "Organization", "PartyGroup", "SoftwareSystem", "SoftwareSystemGroup"].map((n) => ref(t(n))),
      },
      {
        "@id": t("Email"),
        "a:predicateAttribute": "a:email",
        "a:label": "Email address",
        "a:fieldOf": [ref(t("Person")), ref(t("Organization"))],
      },
    ],
    [
      {
        "@id": t("PlanguageLevel"),
        "a:predicateAttribute": "a:level",
        "a:label": "Level",
        "a:fieldOf": [
          "Person", "Organization", "PartyGroup", "PartyMemberOf",
          "SoftwareSystem", "SoftwareSystemGroup", "SoftwareSystemMemberOf",
        ].map((n) => ref(t(n))),
      },
      {
        "@id": t("JobTitle"),
        "a:predicateAttribute": "a:jobTitle",
        "a:label": "Job title",
        "a:fieldOf": ref(t("Employment")),
      },
    ],
  ]);

  return m;
}
