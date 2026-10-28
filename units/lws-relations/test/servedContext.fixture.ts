/**
 * 🔴 Cycle161 — THE VAULT'S SERVED `@context`, PINNED AS BYTES.
 *
 * `GET https://ontology.platform.example.test/base/context.jsonld` → HTTP 200, 2026-09-03, verbatim. Also
 * byte-derivable from Base's own `src/jsonld/context.ts` `buildContext`.
 *
 * ⚠ It is a PIN, ⛔ not an authority: the SHIPPED path fetches this document at runtime
 * (`vaultContext.ts`); this only records what the shipped path will find, so a test can reason
 * about the inversion without a network. `S33` moved it OUT of a `.test.ts` file so that
 * `servedContext.live.test.ts` — the parity check that makes a stale pin FAIL LOUDLY — can
 * import it WITHOUT re-registering another file's suites under its own name (measured: doing so
 * reported 15 foreign tests as this file's, an all-green sheet that had not run the two
 * assertions it was written for — an instrument failure, ⛔ not a result).
 */
export const SERVED_CONTEXT = {
  "@context": {
    "@version": 1.1,
    "@vocab": "https://ontology.platform.example.test/base/a/",
    base: "https://ontology.platform.example.test/base/",
    t: "https://ontology.platform.example.test/base/t/",
    a: "https://ontology.platform.example.test/base/a/",
    role: "https://ontology.platform.example.test/base/role/",
    type: { "@id": "a:type", "@type": "@id" },
    functions: { "@id": "a:functionOf", "@container": "@set" },
    values: { "@id": "a:valueHierarchy", "@container": "@set" },
    children: { "@id": "a:fvChild", "@container": "@set" },
    resources: { "@id": "a:resourceOf", "@container": "@set" },
    fvParent: { "@id": "a:fvParent", "@type": "@id" },
    fvOf: { "@id": "a:fvOf", "@type": "@id" },
    valueEstimations: { "@id": "a:valueEstimations", "@container": "@set" },
    constraints: { "@id": "a:constraints", "@container": "@set" },
    stakeholders: { "@id": "a:stakeholders", "@container": "@set" },
    relationType: { "@id": "a:relationType" },
    solution: { "@id": "role:solution", "@type": "@id" },
    valueEstimate: { "@id": "a:valueEstimate" },
    resourceDraw: { "@id": "a:resourceDraw" },
    shows: { "@id": "a:viewShows" },
    windowState: { "@id": "a:viewWindowState" },
    layout: { "@id": "a:viewLayout" },
    target: { "@id": "a:viewTarget" },
    label: { "@id": "a:label" },
  },
};
