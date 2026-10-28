// The first labels of the platform's own hosts (the identity host, the ontology host and the like), as the app sets them once at
// start-up. A card whose address is on one of these hosts, under the same apex as the vault, says nothing about which vault holds it
// (`cardBelongsToVault` reads this). The module holds state and must exist once in an app.

let labels: ReadonlySet<string> | null = null;

/**
 * Set the first labels of the platform's own hosts on a person vault's apex (for a host `id.example.test`, the label `id`).
 * Each label is trimmed and lower-cased; a repeated label counts once. A label that is empty, or holds a dot or a space, is refused
 * with a TypeError (message starts with `own-card:`) and the earlier list stays. An empty list is allowed: no system host.
 */
export function setSystemHostLabels(next: readonly string[]): void {
  const out = new Set<string>();
  for (const raw of next) {
    if (typeof raw !== "string") throw new TypeError("own-card: setSystemHostLabels: every label must be a string");
    const label = raw.trim().toLowerCase();
    if (label === "" || /[.\s/:]/.test(label)) {
      throw new TypeError(`own-card: setSystemHostLabels: not a single host label (got ${JSON.stringify(raw)})`);
    }
    out.add(label);
  }
  labels = out;
}

/** The labels that were set. Throws when `setSystemHostLabels` has not been called. */
export function systemHostLabels(): ReadonlySet<string> {
  if (labels === null) throw new Error("own-card: call setSystemHostLabels([...labels]) once at start-up");
  return labels;
}

/** Forget the labels. For tests. */
export function resetSystemHostLabels(): void {
  labels = null;
}
