/**
 * The synchronous floor's seed (RuleBaseattrSyncFloor cl.4: dated, naming its source and its
 * control). Read by the ontology steward, public GETs from M5, 2026-10-04T16:11:28Z:
 *   `https://ontology.example.test/base/a/name`  → 200, Approved, `a:predicateAttribute` `a:name`;
 *   `https://ontology.example.test/base/a/label` → 200, Suggested, `a:label` (its `a:does` carries the 3.8
 *     clause: "a reader shows a:name and falls back to that label only where a:name is absent");
 *   `https://ontology.example.test/base/a/title` → 200, Approved, "rather than to an agent";
 *   control `https://ontology.example.test/base/a/zzqqnotanattr` → 404.
 * Fact keys are bare slugs, as `readRecord` serves them (one `a:` stripped).
 */
export const PARTY_NAME_FLOOR = {
  capturedAt: "2026-10-04T16:11:28Z",
  source: "the ontology host's /base/a/name, /base/a/label and /base/a/title (control /base/a/zzqqnotanattr 404); the party-name ruling §1",
  /** The name's one home: read first, and the only spelling a save writes. */
  name: "name",
  /** The legacy home: read only where `name` is absent; retracted by a save that changes the name. */
  legacy: ["label"] as readonly string[],
} as const;
