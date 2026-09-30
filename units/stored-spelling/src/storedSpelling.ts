/**
 * Which key a write must store, from a key the vault served.
 *
 * The map is the vault's own `@context`, already fetched by the host.
 * This unit does not fetch it. An empty map means "the vault did not say",
 * and the prefix rule below is then the old rule. An empty map is not a
 * reason to drop keys.
 *
 * The private slug test must stay in agreement with the addressable-slug unit
 * at its default: an ASCII letter, then at most 63 of letters, digits, `_`,
 * and `-`. No trim. This file does not export that test. Import addressable-slug
 * when the question is "may this app prefix this slug", and use this file when
 * the question is "which key does the write send".
 */

/** One term the vault declared for a wire key. `id` is the stored key, verbatim. */
export interface VaultContextTerm {
  readonly id: string;
  /** True only when the vault assembles this bucket at read time. */
  readonly assembled: boolean;
}

/** Wire key to the term the vault declared. */
export type VaultContextTerms = ReadonlyMap<string, VaultContextTerm>;

/**
 * What the vault stores for one bare wire key that could be either spelling.
 * `unknown` means the vault was not asked, said nothing, or holds both.
 */
export type StoredSpelling = "bare" | "prefixed" | "unknown";

const KEYWORD = /^@/;

function isAppAddressableSlug(slug: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(slug);
}

/**
 * The term map from a context document the host already parsed.
 *
 * A non-object, null, or array is an empty map.
 * If the document has `@context`, that value is the context. Otherwise the
 * document itself is the context. A `@context` that is a string (a URL) is
 * an empty map. Fetching that URL stays in the app.
 * Keys that start with `@` are skipped.
 * A string value is a prefix, not a term, and is skipped.
 * A term must be an object with a string `@id` that is not `""`.
 * `assembled` is true only when `@container` is exactly `@set`.
 * Keys and ids are not trimmed. Each call returns a new map.
 */
export function parseVaultContext(doc: unknown): VaultContextTerms {
  const out = new Map<string, VaultContextTerm>();
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return out;
  const outer = doc as Record<string, unknown>;
  const ctxRaw = outer["@context"] ?? outer;
  if (!ctxRaw || typeof ctxRaw !== "object" || Array.isArray(ctxRaw)) return out;
  for (const [key, def] of Object.entries(ctxRaw as Record<string, unknown>)) {
    if (KEYWORD.test(key)) continue;
    if (typeof def === "string") continue;
    if (!def || typeof def !== "object" || Array.isArray(def)) continue;
    const d = def as Record<string, unknown>;
    const id = d["@id"];
    if (typeof id !== "string" || !id) continue;
    out.set(key, { id, assembled: d["@container"] === "@set" });
  }
  return out;
}

/**
 * True when the vault says this wire key names no stored fact.
 *
 * True only when the map has this exact key and `assembled` is true.
 * A missing key is false. `assembled: false` is false. The key is not trimmed.
 * False does not mean the key is safe to prefix. Ask {@link storedSpellingFor}
 * for the key to send. This function only answers "must this key stay out of
 * the body".
 */
export function namesNoStoredFact(wireKey: string, ctx: VaultContextTerms): boolean {
  return ctx.get(wireKey)?.assembled === true;
}

/**
 * The key to store for one served wire key.
 *
 * Order, and the first match wins:
 * 1. A lowercase `http://` or `https://` address is returned unchanged.
 * 2. Any key that contains `:` is returned unchanged. `a:label` stays `a:label`.
 *    `owl:sameAs` stays `owl:sameAs`. This step is before the map, so a key
 *    that already has a colon is never renamed by the map.
 * 3. A map entry that is assembled returns the wire key, not `term.id`.
 * 4. Any other map entry returns `term.id`, even when that id is odd.
 * 5. A key that is not an app slug is returned unchanged. A leading digit,
 *    a space, an empty string, and a 65-character slug are this case.
 * 6. When the vault served the key and the spelling is exactly `bare`, the
 *    wire key is returned. `prefixed` and `unknown` do not take this step.
 *    `servedByVault` false does not take this step, even when spelling is `bare`.
 * 7. Otherwise `a:` is added once. `name` becomes `a:name`.
 *
 * Nothing is trimmed. `httpfoo` has no colon and is a slug, so with an empty
 * map it becomes `a:httpfoo`.
 */
export function storedSpellingFor(
  wireKey: string,
  ctx: VaultContextTerms,
  spelling: StoredSpelling,
  servedByVault: boolean,
): string {
  if (/^https?:\/\//.test(wireKey)) return wireKey;
  if (wireKey.includes(":")) return wireKey;
  const term = ctx.get(wireKey);
  if (term) return term.assembled ? wireKey : term.id;
  if (!isAppAddressableSlug(wireKey)) return wireKey;
  if (servedByVault && spelling === "bare") return wireKey;
  return `a:${wireKey}`;
}
